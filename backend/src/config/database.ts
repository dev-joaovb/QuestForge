import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.ts';

declare global {
  // eslint-disable-next-line no-var
  var __questforgePrisma: PrismaClient | undefined;
}

export interface DatabaseHealthStatus {
  status: 'up' | 'down' | 'unconfigured';
  latencyMs: number | null;
  message: string;
}

/**
 * Retorna a instância singleton do PrismaClient quando DATABASE_URL está configurada.
 * Não realiza conexão ansiosa (eager connect) na importação do módulo.
 */
export function getPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    throw new Error('DATABASE_URL não está configurada no ambiente.');
  }

  if (!globalThis.__questforgePrisma) {
    globalThis.__questforgePrisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  return globalThis.__questforgePrisma;
}

// Reutiliza verificações em andamento por instância de cliente (in-flight request coalescing),
// evitando que requisições concorrentes de health check saturem o pool de conexões com queries SELECT 1 redundantes.
const inFlightDatabaseChecks = new WeakMap<object, Promise<DatabaseHealthStatus>>();

/**
 * Verifica a conectividade real com o PostgreSQL executando `SELECT 1`.
 * Nunca expõe strings de conexão, hosts internos ou credenciais em mensagens de erro.
 *
 * Nota de observabilidade e concorrência (ACH-HEALTH-01):
 * O `Promise.race` impõe um limite de tempo (deadline) na camada do Node.js para
 * não reter a resposta HTTP. Contudo, ele NÃO cancela a query SQL subjacente no
 * driver Prisma ou no PostgreSQL. Para mitigar o consumo de conexões durante lentidão,
 * chamadas simultâneas na mesma instância de cliente reutilizam a mesma promessa em andamento.
 */
export async function checkDatabaseHealth(
  customClient?: Pick<PrismaClient, '$queryRaw'>,
  timeoutMs: number = 3000
): Promise<DatabaseHealthStatus> {
  if (!customClient && (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '')) {
    return {
      status: 'unconfigured',
      latencyMs: null,
      message: 'Variável DATABASE_URL ausente. Configure a conexão PostgreSQL no arquivo .env.',
    };
  }

  const client = customClient ?? getPrismaClient();

  if (typeof client === 'object' && client !== null) {
    const existing = inFlightDatabaseChecks.get(client);
    if (existing) {
      return existing;
    }
  }

  const checkPromise = (async (): Promise<DatabaseHealthStatus> => {
    const startedAt = Date.now();
    let timer: NodeJS.Timeout | undefined;

    try {
      const queryPromise = client.$queryRaw`SELECT 1`;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('DATABASE_HEALTH_CHECK_TIMEOUT'));
        }, timeoutMs);
      });

      await Promise.race([queryPromise, timeoutPromise]);
      const latencyMs = Date.now() - startedAt;

      return {
        status: 'up',
        latencyMs,
        message: 'Conectividade com PostgreSQL verificada com sucesso.',
      };
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const isTimeout =
        error instanceof Error && error.message === 'DATABASE_HEALTH_CHECK_TIMEOUT';

      logger.error('database_health_check_failed', {
        latencyMs,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        isTimeout,
      });

      return {
        status: 'down',
        latencyMs,
        message: isTimeout
          ? `Tempo limite de ${timeoutMs}ms excedido na verificação do PostgreSQL.`
          : 'Não foi possível estabelecer conexão com o PostgreSQL.',
      };
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  })().finally(() => {
    if (typeof client === 'object' && client !== null) {
      inFlightDatabaseChecks.delete(client);
    }
  });

  if (typeof client === 'object' && client !== null) {
    inFlightDatabaseChecks.set(client, checkPromise);
  }

  return checkPromise;
}
