import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.ts';
import { checkDatabaseHealth } from '../src/config/database.ts';
import { MinioObjectStorageService } from '../src/services/storage.service.ts';

describe('Health & Readiness Check Endpoints — Testes Unitários Herméticos (Sprint 10.3)', () => {
  const validTestEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    PORT: '3000',
    FRONTEND_URL: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://user:super_secret_password_1234@localhost:5432/questforge',
    SESSION_SECRET: 'chave_secreta_de_teste_com_mais_de_32_caracteres_12345',
    OLLAMA_BASE_URL: 'http://localhost:11434',
    OLLAMA_MODEL: 'llama3.1:8b',
    MINIO_ENDPOINT: 'localhost',
    MINIO_PORT: '9000',
    MINIO_BUCKET: 'questforge-documents',
    MINIO_USE_SSL: 'false',
    MINIO_ACCESS_KEY: 'minio_access_secret_user',
    MINIO_SECRET_KEY: 'minio_super_secret_password_9876',
  };

  // ==========================================================================
  // BLOCO 1: Preservação Estrita do Contrato de GET /api/health (Sprint 0 / 10.2)
  // ==========================================================================
  describe('GET /api/health — Preservação do Contrato Canônico', () => {
    it('12. deve preservar o contrato de /api/health retornando HTTP 200 e status healthy quando PostgreSQL está up', async () => {
      const app = createApp({
        health: {
          rawEnv: validTestEnv,
          checkDb: async () => ({
            status: 'up',
            latencyMs: 4,
            message: 'Conectividade com PostgreSQL verificada com sucesso.',
          }),
        },
      });

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.app).toEqual({
        name: 'QuestForge API',
        status: 'up',
        environment: 'test',
      });
      expect(response.body.dependencies.database).toEqual({
        provider: 'postgresql',
        status: 'up',
        latencyMs: 4,
        message: 'Conectividade com PostgreSQL verificada com sucesso.',
      });
      expect(response.body.dependencies.environment.status).toBe('configured');

      // 11. Ausência de vazamento de credenciais
      const rawBody = JSON.stringify(response.body);
      expect(rawBody).not.toContain('super_secret_password_1234');
      expect(rawBody).not.toContain('chave_secreta_de_teste');
      expect(rawBody).not.toContain('minio_access_secret_user');
      expect(rawBody).not.toContain('minio_super_secret_password_9876');
    });

    it('deve retornar HTTP 503 e status degraded quando PostgreSQL está down em /api/health', async () => {
      const app = createApp({
        health: {
          rawEnv: validTestEnv,
          checkDb: async () => ({
            status: 'down',
            latencyMs: 12,
            message: 'Não foi possível estabelecer conexão com o PostgreSQL.',
          }),
        },
      });

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('degraded');
      expect(response.body.app.status).toBe('up');
      expect(response.body.dependencies.database.status).toBe('down');
    });

    it('deve retornar HTTP 503 e status unconfigured quando DATABASE_URL não foi preenchida em /api/health', async () => {
      const app = createApp({
        health: {
          rawEnv: { NODE_ENV: 'test' },
          checkDb: async () => ({
            status: 'unconfigured',
            latencyMs: null,
            message: 'Variável DATABASE_URL ausente.',
          }),
        },
      });

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('degraded');
      expect(response.body.dependencies.database.status).toBe('unconfigured');
      expect(response.body.dependencies.environment.status).toBe('incomplete');
    });

    it('deve retornar HTTP 404 JSON para rotas /api/* inexistentes sem cair no fallback do frontend', async () => {
      const app = createApp();
      const response = await request(app).get('/api/rota-inexistente');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('NotFound');
    });
  });

  // ==========================================================================
  // BLOCO 2: Liveness Probes (GET /api/live e GET /api/health/live)
  // ==========================================================================
  describe('Liveness Probe (GET /api/live e GET /api/health/live)', () => {
    it('1. deve retornar HTTP 200 e status alive confirmando que o processo backend está ativo', async () => {
      const app = createApp();

      const resLive = await request(app).get('/api/live');
      expect(resLive.status).toBe(200);
      expect(resLive.body.status).toBe('alive');
      expect(resLive.body.app.status).toBe('up');

      const resHealthLive = await request(app).get('/api/health/live');
      expect(resHealthLive.status).toBe(200);
      expect(resHealthLive.body.status).toBe('alive');
    });
  });

  // ==========================================================================
  // BLOCO 3: Diagnóstico de PostgreSQL com Timeout Hermético
  // ==========================================================================
  describe('Diagnóstico de Conectividade PostgreSQL (checkDatabaseHealth)', () => {
    it('4. deve tratar timeout graciosamente e retornar status down quando a query excede o tempo limite', async () => {
      // Mock do PrismaClient cujo $queryRaw demora mais do que o timeout configurado (50ms)
      const hangingClient = {
        $queryRaw: async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
          return [{ result: 1 }];
        },
      };

      const health = await checkDatabaseHealth(hangingClient as any, 40);

      expect(health.status).toBe('down');
      expect(health.message).toContain('Tempo limite');
      expect(health.latencyMs).toBeGreaterThanOrEqual(35);
    });

    it('deve retornar status unconfigured sem tentar conectar quando DATABASE_URL está ausente', async () => {
      const previousUrl = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;

      try {
        const health = await checkDatabaseHealth();
        expect(health.status).toBe('unconfigured');
        expect(health.message).toContain('DATABASE_URL ausente');
      } finally {
        if (previousUrl) process.env.DATABASE_URL = previousUrl;
      }
    });
  });

  // ==========================================================================
  // BLOCO 4: Readiness Probe (GET /api/ready e GET /api/health/ready)
  // ==========================================================================
  describe('Readiness Probe (GET /api/ready)', () => {
    it('2 e 13. deve retornar HTTP 200 e status ready quando todas as dependências essenciais e opcionais estão operacionais', async () => {
      const app = createApp({
        health: {
          rawEnv: validTestEnv,
          checkDb: async () => ({
            status: 'up',
            latencyMs: 3,
            message: 'Conectividade com PostgreSQL verificada com sucesso.',
          }),
          checkStorage: async () => ({
            provider: 'minio',
            status: 'up',
            bucket: 'questforge-documents',
            message: 'Conectividade com MinIO verificada com sucesso.',
          }),
          checkAi: async () => ({
            provider: 'ollama',
            status: 'up',
            model: 'llama3.1:8b',
            message: 'Servidor Ollama ativo e modelo disponível.',
          }),
          checkOcr: async () => ({
            status: 'unconfigured',
            provider: 'unconfigured',
            message: 'Processamento de OCR indisponível (opcional).',
          }),
        },
      });

      const response = await request(app).get('/api/ready');

      expect(response.status).toBe(200);
      expect(response.body.ready).toBe(true);
      expect(response.body.status).toBe('ready');
      expect(response.body.essential.database.status).toBe('up');
      expect(response.body.essential.environment.status).toBe('configured');
      expect(response.body.optional.storage.status).toBe('up');
      expect(response.body.optional.ai.status).toBe('up');
      expect(response.body.optional.ocr.status).toBe('unconfigured');

      // Também acessível via sub-rota /api/health/ready
      const altResponse = await request(app).get('/api/health/ready');
      expect(altResponse.status).toBe(200);
      expect(altResponse.body.ready).toBe(true);
    });

    it('3. deve retornar HTTP 503 e status not_ready quando o PostgreSQL está indisponível (dependência essencial)', async () => {
      const app = createApp({
        health: {
          rawEnv: validTestEnv,
          checkDb: async () => ({
            status: 'down',
            latencyMs: 8,
            message: 'Conexão recusada ao PostgreSQL.',
          }),
        },
      });

      const response = await request(app).get('/api/ready');

      expect(response.status).toBe(503);
      expect(response.body.ready).toBe(false);
      expect(response.body.status).toBe('not_ready');
      expect(response.body.essential.database.status).toBe('down');
    });

    it('4. deve retornar HTTP 503 e status not_ready quando o PostgreSQL sofre timeout', async () => {
      const app = createApp({
        health: {
          rawEnv: validTestEnv,
          checkDb: async () => ({
            status: 'down',
            latencyMs: 3000,
            message: 'Tempo limite de 3000ms excedido na verificação do PostgreSQL.',
          }),
        },
      });

      const response = await request(app).get('/api/ready');

      expect(response.status).toBe(503);
      expect(response.body.ready).toBe(false);
      expect(response.body.status).toBe('not_ready');
      expect(response.body.essential.database.message).toContain('Tempo limite');
    });

    it('5. deve retornar HTTP 200 e ready=true quando MinIO não está configurado (dependência opcional)', async () => {
      const app = createApp({
        health: {
          rawEnv: validTestEnv,
          checkDb: async () => ({
            status: 'up',
            latencyMs: 2,
            message: 'PostgreSQL OK.',
          }),
          checkStorage: async () => ({
            provider: 'minio',
            status: 'unconfigured',
            bucket: 'questforge-documents',
            message: 'Credenciais ausentes.',
          }),
        },
      });

      const response = await request(app).get('/api/ready');

      expect(response.status).toBe(200);
      expect(response.body.ready).toBe(true);
      expect(response.body.status).toBe('ready');
      expect(response.body.optional.storage.status).toBe('unconfigured');
    });

    it('6. deve retornar HTTP 200 e status ready_degraded quando MinIO está configurado porém indisponível', async () => {
      const app = createApp({
        health: {
          rawEnv: validTestEnv,
          checkDb: async () => ({
            status: 'up',
            latencyMs: 2,
            message: 'PostgreSQL OK.',
          }),
          checkStorage: async () => ({
            provider: 'minio',
            status: 'down',
            bucket: 'questforge-documents',
            message: 'Servidor MinIO inacessível na porta 9000.',
          }),
        },
      });

      const response = await request(app).get('/api/ready');

      expect(response.status).toBe(200);
      expect(response.body.ready).toBe(true);
      expect(response.body.status).toBe('ready_degraded');
      expect(response.body.optional.storage.status).toBe('down');
    });

    it('7. deve retornar HTTP 200 e status ready_degraded quando Ollama está indisponível', async () => {
      const app = createApp({
        health: {
          rawEnv: validTestEnv,
          checkDb: async () => ({
            status: 'up',
            latencyMs: 2,
            message: 'PostgreSQL OK.',
          }),
          checkAi: async () => ({
            provider: 'ollama',
            status: 'down',
            model: 'llama3.1:8b',
            message: 'Servidor Ollama inacessível.',
          }),
        },
      });

      const response = await request(app).get('/api/ready');

      expect(response.status).toBe(200);
      expect(response.body.ready).toBe(true);
      expect(response.body.status).toBe('ready_degraded');
      expect(response.body.optional.ai.status).toBe('down');
    });

    it('8. deve retornar HTTP 200 e status ready_degraded quando o modelo do Ollama está ausente no servidor', async () => {
      const app = createApp({
        health: {
          rawEnv: validTestEnv,
          checkDb: async () => ({
            status: 'up',
            latencyMs: 2,
            message: 'PostgreSQL OK.',
          }),
          checkAi: async () => ({
            provider: 'ollama',
            status: 'model_missing',
            model: 'llama3.1:8b',
            message: 'Servidor ativo mas modelo llama3.1:8b não baixado.',
          }),
        },
      });

      const response = await request(app).get('/api/ready');

      expect(response.status).toBe(200);
      expect(response.body.ready).toBe(true);
      expect(response.body.status).toBe('ready_degraded');
      expect(response.body.optional.ai.status).toBe('model_missing');
    });

    it('9. deve informar corretamente o status do OCR como unconfigured sem degradar a prontidão', async () => {
      const app = createApp({
        health: {
          rawEnv: validTestEnv,
          checkDb: async () => ({
            status: 'up',
            latencyMs: 2,
            message: 'PostgreSQL OK.',
          }),
          checkOcr: async () => ({
            status: 'unconfigured',
            provider: 'unconfigured',
            message: 'Nenhum motor de OCR concreto configurado.',
          }),
        },
      });

      const response = await request(app).get('/api/ready');

      expect(response.status).toBe(200);
      expect(response.body.ready).toBe(true);
      expect(response.body.optional.ocr).toEqual({
        status: 'unconfigured',
        provider: 'unconfigured',
        message: 'Nenhum motor de OCR concreto configurado.',
      });
    });

    it('10 e 11. deve manter HTTP 200 e ready=true diante de falha simultânea de todas as dependências opcionais sem vazar credenciais', async () => {
      const app = createApp({
        health: {
          rawEnv: validTestEnv,
          checkDb: async () => ({
            status: 'up',
            latencyMs: 5,
            message: 'PostgreSQL OK.',
          }),
          checkStorage: async () => ({
            provider: 'minio',
            status: 'down',
            bucket: 'questforge-documents',
            message: 'MinIO offline.',
          }),
          checkAi: async () => ({
            provider: 'ollama',
            status: 'down',
            model: 'llama3.1:8b',
            message: 'Ollama offline.',
          }),
          checkOcr: async () => ({
            status: 'unconfigured',
            provider: 'unconfigured',
            message: 'OCR unconfigured.',
          }),
        },
      });

      const response = await request(app).get('/api/ready');

      expect(response.status).toBe(200);
      expect(response.body.ready).toBe(true);
      expect(response.body.status).toBe('ready_degraded');
      expect(response.body.optional.storage.status).toBe('down');
      expect(response.body.optional.ai.status).toBe('down');
      expect(response.body.optional.ocr.status).toBe('unconfigured');

      // 11. Rigorosa ausência de segredos no payload
      const rawText = JSON.stringify(response.body);
      expect(rawText).not.toContain('super_secret_password_1234');
      expect(rawText).not.toContain('chave_secreta_de_teste');
      expect(rawText).not.toContain('minio_access_secret_user');
      expect(rawText).not.toContain('minio_super_secret_password_9876');
    });
  });

  // ==========================================================================
  // BLOCO 5: Hardening de Readiness e Isolamento de Falhas (Sprint 10.3.1)
  // ==========================================================================
  describe('Hardening e Isolamento de Falhas Assíncronas (Sprint 10.3.1)', () => {
    it('1. deve isolar rejeição inesperada em checker opcional (storage) retornando HTTP 200 ready_degraded sem 500', async () => {
      const app = createApp({
        health: {
          rawEnv: validTestEnv,
          checkDb: async () => ({
            status: 'up',
            latencyMs: 2,
            message: 'PostgreSQL OK.',
          }),
          checkStorage: async () => {
            throw new Error('Falha catastrófica no driver MinIO');
          },
        },
      });

      const response = await request(app).get('/api/ready');

      expect(response.status).toBe(200);
      expect(response.body.ready).toBe(true);
      expect(response.body.status).toBe('ready_degraded');
      expect(response.body.optional.storage.status).toBe('down');
      expect(response.body.optional.storage.message).toContain('Falha ao verificar serviço de armazenamento');
    });

    it('2. deve isolar rejeição inesperada em checker essencial (database) retornando HTTP 503 not_ready sem 500', async () => {
      const app = createApp({
        health: {
          rawEnv: validTestEnv,
          checkDb: async () => {
            throw new Error('Falha catastrófica no driver Prisma');
          },
        },
      });

      const response = await request(app).get('/api/ready');

      expect(response.status).toBe(503);
      expect(response.body.ready).toBe(false);
      expect(response.body.status).toBe('not_ready');
      expect(response.body.essential.database.status).toBe('down');
      expect(response.body.essential.database.message).toContain('Falha inesperada');
    });

    it('3. deve tratar graciosamente MinIO que nunca resolve a Promise via timeout configurável', async () => {
      const app = createApp({
        health: {
          rawEnv: validTestEnv,
          storageTimeoutMs: 30,
          checkDb: async () => ({
            status: 'up',
            latencyMs: 2,
            message: 'PostgreSQL OK.',
          }),
          // Promise pendente que nunca resolve
          checkStorage: () => new Promise<never>(() => {}),
        },
      });

      const start = Date.now();
      const response = await request(app).get('/api/ready');
      const duration = Date.now() - start;

      expect(response.status).toBe(200);
      expect(response.body.ready).toBe(true);
      expect(response.body.status).toBe('ready_degraded');
      expect(response.body.optional.storage.status).toBe('down');
      expect(response.body.optional.storage.message).toContain('Tempo limite de 30ms excedido');
      expect(duration).toBeLessThan(1500);
    });

    it('4. deve tratar timeout em checkStorageHealth quando cliente MinIO demora ou rejeita após o limite', async () => {
      const slowMinioClient = {
        bucketExists: async () => {
          await new Promise((resolve) => setTimeout(resolve, 80));
          throw new Error('Socket timeout tardio');
        },
      };

      const storageService = new MinioObjectStorageService({
        customClient: slowMinioClient as any,
      });

      const result = await storageService.checkStorageHealth({ timeoutMs: 30 });

      expect(result.status).toBe('down');
      expect(result.message).toContain('Tempo limite de 30ms excedido');
    });

    it('5. deve tratar falha simultânea de todas as dependências sem 500', async () => {
      const app = createApp({
        health: {
          rawEnv: validTestEnv,
          checkDb: async () => {
            throw new Error('DB Crash');
          },
          checkStorage: async () => {
            throw new Error('Storage Crash');
          },
          checkAi: async () => {
            throw new Error('AI Crash');
          },
          checkOcr: async () => {
            throw new Error('OCR Crash');
          },
        },
      });

      const response = await request(app).get('/api/ready');

      expect(response.status).toBe(503);
      expect(response.body.ready).toBe(false);
      expect(response.body.status).toBe('not_ready');
      expect(response.body.essential.database.status).toBe('down');
      expect(response.body.optional.storage.status).toBe('down');
      expect(response.body.optional.ai.status).toBe('down');
      expect(response.body.optional.ocr.status).toBe('unconfigured');
    });

    it('6. deve preservar os códigos HTTP em todos os 5 endpoints em cenários saudáveis e degradados', async () => {
      const healthyApp = createApp({
        health: {
          rawEnv: validTestEnv,
          checkDb: async () => ({ status: 'up', latencyMs: 1, message: 'OK' }),
          checkStorage: async () => ({ provider: 'minio', status: 'up', bucket: 'questforge-documents', message: 'OK' }),
          checkAi: async () => ({ provider: 'ollama', status: 'up', model: 'llama3.1:8b', message: 'OK' }),
        },
      });

      // Liveness: 200
      const resLive = await request(healthyApp).get('/api/live');
      expect(resLive.status).toBe(200);

      const resHealthLive = await request(healthyApp).get('/api/health/live');
      expect(resHealthLive.status).toBe(200);

      // Health: 200
      const resHealth = await request(healthyApp).get('/api/health');
      expect(resHealth.status).toBe(200);

      // Ready: 200
      const resReady = await request(healthyApp).get('/api/ready');
      expect(resReady.status).toBe(200);

      const resHealthReady = await request(healthyApp).get('/api/health/ready');
      expect(resHealthReady.status).toBe(200);

      // Cenário com DB down: Health e Ready viram 503, Liveness permanece 200
      const brokenApp = createApp({
        health: {
          rawEnv: validTestEnv,
          checkDb: async () => ({ status: 'down', latencyMs: null, message: 'DB Down' }),
        },
      });

      expect((await request(brokenApp).get('/api/live')).status).toBe(200);
      expect((await request(brokenApp).get('/api/health')).status).toBe(503);
      expect((await request(brokenApp).get('/api/ready')).status).toBe(503);
    });

    it('7. deve garantir ausência estrita de vazamento de segredos quando checkers rejeitam com credenciais', async () => {
      const app = createApp({
        health: {
          rawEnv: validTestEnv,
          checkDb: async () => {
            throw new Error('Connection refused to postgresql://user:DATABASE_SENHA_ULTRA_SECRETA@db:5432');
          },
          checkStorage: async () => {
            throw new Error('Auth failed for minio key MINIO_ACCESS_KEY_ULTRA_SECRETA');
          },
        },
      });

      const response = await request(app).get('/api/ready');
      const text = JSON.stringify(response.body);

      expect(text).not.toContain('DATABASE_SENHA_ULTRA_SECRETA');
      expect(text).not.toContain('MINIO_ACCESS_KEY_ULTRA_SECRETA');
      expect(text).not.toContain('super_secret_password_1234');
    });

    it('8. deve reutilizar verificação em andamento (in-flight request coalescing) para o mesmo cliente sem chamadas redundantes', async () => {
      let queryCallCount = 0;
      const clientMock = {
        $queryRaw: async () => {
          queryCallCount++;
          await new Promise((resolve) => setTimeout(resolve, 40));
          return [{ result: 1 }];
        },
      };

      // Dispara 3 verificações simultâneas para a mesma instância
      const [r1, r2, r3] = await Promise.all([
        checkDatabaseHealth(clientMock as any, 200),
        checkDatabaseHealth(clientMock as any, 200),
        checkDatabaseHealth(clientMock as any, 200),
      ]);

      // Todas devem ter compartilhado a mesma query in-flight
      expect(queryCallCount).toBe(1);
      expect(r1.status).toBe('up');
      expect(r2.status).toBe('up');
      expect(r3.status).toBe('up');

      // Após a conclusão, uma nova verificação executa normalmente (sem cache estático)
      const r4 = await checkDatabaseHealth(clientMock as any, 200);
      expect(queryCallCount).toBe(2);
      expect(r4.status).toBe('up');
    });

    it('9. deve preservar o contrato histórico de /api/health quando o checker de banco lança exceção não tratada', async () => {
      const app = createApp({
        health: {
          rawEnv: validTestEnv,
          checkDb: async () => {
            throw new Error('Exceção síncrona não capturada no pool');
          },
        },
      });

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('degraded');
      expect(response.body.app).toEqual({
        name: 'QuestForge API',
        status: 'up',
        environment: 'test',
      });
      expect(response.body.dependencies.database.status).toBe('down');
      expect(response.body.dependencies.database.message).toBe('Falha inesperada ao verificar o banco de dados.');
    });
  });
});
