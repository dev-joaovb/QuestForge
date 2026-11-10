import type { Request, Response } from 'express';
import { checkDatabaseHealth, type DatabaseHealthStatus } from '../config/database.ts';
import { validateEnv } from '../config/env.ts';
import { MinioObjectStorageService } from '../services/storage.service.ts';
import { OllamaChatAdapter } from '../services/ollama-adapter.service.ts';
import { UnconfiguredOcrService } from '../services/ocr.service.ts';

export interface StorageHealthStatus {
  provider?: string;
  status: 'up' | 'down' | 'unconfigured';
  bucket: string;
  message: string;
}

export interface AiHealthStatus {
  provider?: string;
  status: 'up' | 'down' | 'unconfigured' | 'model_missing';
  model: string | null;
  message: string;
}

export interface OcrHealthStatus {
  status: 'available' | 'unconfigured';
  provider: string;
  message: string;
}

export interface HealthCheckDependencies {
  checkDb?: () => Promise<DatabaseHealthStatus>;
  checkStorage?: () => Promise<StorageHealthStatus>;
  checkAi?: () => Promise<AiHealthStatus>;
  checkOcr?: () => Promise<OcrHealthStatus>;
  rawEnv?: NodeJS.ProcessEnv;
  storageTimeoutMs?: number;
}

/**
 * Controller de Liveness rápido para orquestradores (Kubernetes / Docker).
 * Apenas valida que o processo Node.js está em execução e o event loop está respondendo.
 */
export function createLiveController() {
  return function getLive(_req: Request, res: Response): void {
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      app: {
        name: 'QuestForge API',
        status: 'up',
        environment: process.env.NODE_ENV ?? 'development',
      },
    });
  };
}

export const getLive = createLiveController();

/**
 * Controller de Health Check clássico (Liveness / General Health).
 * Preserva 100% de compatibilidade com os contratos anteriores da Sprint 0 e 10.2.
 */
export function createHealthController(deps: HealthCheckDependencies = {}) {
  const runDbCheck = deps.checkDb ?? (() => checkDatabaseHealth());

  return async function getHealth(_req: Request, res: Response): Promise<void> {
    try {
      const envResult = validateEnv(deps.rawEnv ?? process.env);
      let dbHealth: DatabaseHealthStatus;

      try {
        dbHealth = await runDbCheck();
      } catch {
        dbHealth = {
          status: 'down',
          latencyMs: null,
          message: 'Falha inesperada ao verificar o banco de dados.',
        };
      }

      const isHealthy = dbHealth.status === 'up' && envResult.isValid;
      const overallStatus = isHealthy ? 'healthy' : 'degraded';
      const httpStatus = dbHealth.status === 'up' ? 200 : 503;

      res.status(httpStatus).json({
        status: overallStatus,
        timestamp: new Date().toISOString(),
        app: {
          name: 'QuestForge API',
          status: 'up',
          environment: envResult.config.NODE_ENV ?? 'development',
        },
        dependencies: {
          database: {
            provider: 'postgresql',
            status: dbHealth.status,
            latencyMs: dbHealth.latencyMs,
            message: dbHealth.message,
          },
          environment: {
            status: envResult.isValid ? 'configured' : 'incomplete',
            missingOrInvalidCount: envResult.missingOrInvalidVars.length,
            issues: envResult.missingOrInvalidVars,
          },
        },
      });
    } catch {
      res.status(503).json({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        app: {
          name: 'QuestForge API',
          status: 'up',
          environment: process.env.NODE_ENV ?? 'development',
        },
        dependencies: {
          database: {
            provider: 'postgresql',
            status: 'down',
            latencyMs: null,
            message: 'Erro interno ao verificar dependências.',
          },
          environment: {
            status: 'incomplete',
            missingOrInvalidCount: 1,
            issues: ['Erro interno de validação de ambiente.'],
          },
        },
      });
    }
  };
}

export const getHealth = createHealthController();

/**
 * Controller de Prontidão Operacional (Readiness).
 *
 * Separação rigorosa entre:
 * - Dependências Essenciais (Hard): PostgreSQL e Variáveis Obrigatórias.
 *   Se qualquer uma falhar -> HTTP 503 `not_ready` (a aplicação não pode operar o núcleo de negócio).
 * - Dependências Opcionais (Soft): MinIO, Ollama, OCR.
 *   Se falharem -> HTTP 200 `ready_degraded` (a aplicação atende banco de questões, auth, simulados,
 *   mas avisa sobre degradação em funcionalidades periféricas).
 *
 * Hardening da Sprint 10.3.1:
 * - ACH-HEALTH-02: Uso de Promise.allSettled e wrappers defensivos para garantir isolamento absoluto de falhas.
 * - ACH-HEALTH-03: Timeout explícito na verificação do MinIO (padrão 2500ms) com captura de hanging promises.
 */
export function createReadyController(deps: HealthCheckDependencies = {}) {
  const storageTimeoutMs = deps.storageTimeoutMs ?? 2500;

  const runDbCheck = async (): Promise<DatabaseHealthStatus> => {
    try {
      const checker = deps.checkDb ?? (() => checkDatabaseHealth());
      return await checker();
    } catch {
      return {
        status: 'down',
        latencyMs: null,
        message: 'Falha inesperada ao verificar o PostgreSQL.',
      };
    }
  };

  const runStorageCheck = async (): Promise<StorageHealthStatus> => {
    let timer: NodeJS.Timeout | undefined;
    try {
      const defaultChecker = async (): Promise<StorageHealthStatus> => {
        const storageService = new MinioObjectStorageService();
        const health = await storageService.checkStorageHealth({ timeoutMs: storageTimeoutMs });
        return {
          provider: 'minio',
          status: health.status,
          bucket: health.bucket,
          message: health.message,
        };
      };

      const checker = deps.checkStorage ?? defaultChecker;

      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('STORAGE_TIMEOUT'));
        }, storageTimeoutMs);
      });

      return await Promise.race([checker(), timeoutPromise]);
    } catch (error) {
      const isTimeout =
        error instanceof Error &&
        (error.message === 'STORAGE_TIMEOUT' ||
          error.message.includes('Tempo limite'));

      return {
        provider: 'minio',
        status: 'down',
        bucket: process.env.MINIO_BUCKET || 'questforge-documents',
        message: isTimeout
          ? `Tempo limite de ${storageTimeoutMs}ms excedido na verificação do MinIO.`
          : 'Falha ao verificar serviço de armazenamento MinIO.',
      };
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  };

  const runAiCheck = async (): Promise<AiHealthStatus> => {
    try {
      const defaultChecker = async (): Promise<AiHealthStatus> => {
        const modelName = process.env.OLLAMA_MODEL?.trim();
        if (!modelName || modelName === 'SEU_MODELO_AQUI') {
          return {
            provider: 'ollama',
            status: 'unconfigured',
            model: null,
            message: 'Nenhum modelo Ollama configurado no ambiente.',
          };
        }
        const adapter = new OllamaChatAdapter({ defaultModel: modelName });
        const health = await adapter.checkAvailability({ timeoutMs: 2500 });
        if (!health.reachable) {
          return {
            provider: 'ollama',
            status: 'down',
            model: modelName,
            message: health.message,
          };
        }
        if (health.modelAvailableOnServer === false) {
          return {
            provider: 'ollama',
            status: 'model_missing',
            model: modelName,
            message: health.message,
          };
        }
        return {
          provider: 'ollama',
          status: 'up',
          model: modelName,
          message: health.message,
        };
      };

      const checker = deps.checkAi ?? defaultChecker;
      return await checker();
    } catch {
      return {
        provider: 'ollama',
        status: 'down',
        model: process.env.OLLAMA_MODEL ?? null,
        message: 'Falha ao verificar disponibilidade do servidor Ollama.',
      };
    }
  };

  const runOcrCheck = async (): Promise<OcrHealthStatus> => {
    try {
      const defaultChecker = async (): Promise<OcrHealthStatus> => {
        const ocrService = new UnconfiguredOcrService();
        const status = ocrService.getStatus();
        return {
          status: status.available ? 'available' : 'unconfigured',
          provider: status.providerName,
          message: status.message,
        };
      };

      const checker = deps.checkOcr ?? defaultChecker;
      return await checker();
    } catch {
      return {
        status: 'unconfigured',
        provider: 'unconfigured',
        message: 'Falha ao verificar serviço de OCR.',
      };
    }
  };

  return async function getReady(_req: Request, res: Response): Promise<void> {
    try {
      const rawEnv = deps.rawEnv ?? process.env;
      const envResult = validateEnv(rawEnv);

      // Executa as verificações concorrentemente usando Promise.allSettled (ACH-HEALTH-02)
      const [dbSettled, storageSettled, aiSettled, ocrSettled] =
        await Promise.allSettled([
          runDbCheck(),
          runStorageCheck(),
          runAiCheck(),
          runOcrCheck(),
        ]);

      const dbHealth: DatabaseHealthStatus =
        dbSettled.status === 'fulfilled'
          ? dbSettled.value
          : {
              status: 'down',
              latencyMs: null,
              message: 'Falha inesperada ao verificar o PostgreSQL.',
            };

      const storageHealth: StorageHealthStatus =
        storageSettled.status === 'fulfilled'
          ? storageSettled.value
          : {
              provider: 'minio',
              status: 'down',
              bucket: process.env.MINIO_BUCKET || 'questforge-documents',
              message: 'Falha ao verificar serviço de armazenamento MinIO.',
            };

      const aiHealth: AiHealthStatus =
        aiSettled.status === 'fulfilled'
          ? aiSettled.value
          : {
              provider: 'ollama',
              status: 'down',
              model: process.env.OLLAMA_MODEL ?? null,
              message: 'Falha ao verificar disponibilidade do servidor Ollama.',
            };

      const ocrHealth: OcrHealthStatus =
        ocrSettled.status === 'fulfilled'
          ? ocrSettled.value
          : {
              status: 'unconfigured',
              provider: 'unconfigured',
              message: 'Falha ao verificar serviço de OCR.',
            };

      const isDbReady = dbHealth.status === 'up';
      const isEnvReady = envResult.isValid;
      const isEssentialReady = isDbReady && isEnvReady;

      const hasOptionalDegradation =
        storageHealth.status === 'down' ||
        aiHealth.status === 'down' ||
        aiHealth.status === 'model_missing';

      let readinessStatus: 'ready' | 'ready_degraded' | 'not_ready';
      if (!isEssentialReady) {
        readinessStatus = 'not_ready';
      } else if (hasOptionalDegradation) {
        readinessStatus = 'ready_degraded';
      } else {
        readinessStatus = 'ready';
      }

      const httpStatus = isEssentialReady ? 200 : 503;

      res.status(httpStatus).json({
        ready: isEssentialReady,
        status: readinessStatus,
        timestamp: new Date().toISOString(),
        app: {
          name: 'QuestForge API',
          status: 'up',
          environment: envResult.config.NODE_ENV ?? 'development',
        },
        essential: {
          database: {
            provider: 'postgresql',
            status: dbHealth.status,
            latencyMs: dbHealth.latencyMs,
            message: dbHealth.message,
          },
          environment: {
            status: envResult.isValid ? 'configured' : 'incomplete',
            missingOrInvalidCount: envResult.missingOrInvalidVars.length,
            issues: envResult.missingOrInvalidVars,
          },
        },
        optional: {
          storage: {
            provider: 'minio',
            status: storageHealth.status,
            bucket: storageHealth.bucket,
            message: storageHealth.message,
          },
          ai: {
            provider: 'ollama',
            status: aiHealth.status,
            model: aiHealth.model,
            message: aiHealth.message,
          },
          ocr: {
            status: ocrHealth.status,
            provider: ocrHealth.provider,
            message: ocrHealth.message,
          },
        },
      });
    } catch {
      res.status(503).json({
        ready: false,
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        app: {
          name: 'QuestForge API',
          status: 'up',
          environment: process.env.NODE_ENV ?? 'development',
        },
        essential: {
          database: {
            provider: 'postgresql',
            status: 'down',
            latencyMs: null,
            message: 'Erro inesperado na avaliação de prontidão.',
          },
          environment: {
            status: 'incomplete',
            missingOrInvalidCount: 1,
            issues: ['Falha de validação interna.'],
          },
        },
        optional: {
          storage: {
            provider: 'minio',
            status: 'down',
            bucket: process.env.MINIO_BUCKET || 'questforge-documents',
            message: 'Serviço indisponível devido a erro interno.',
          },
          ai: {
            provider: 'ollama',
            status: 'down',
            model: null,
            message: 'Serviço indisponível devido a erro interno.',
          },
          ocr: {
            status: 'unconfigured',
            provider: 'unconfigured',
            message: 'Serviço indisponível devido a erro interno.',
          },
        },
      });
    }
  };
}

export const getReady = createReadyController();
