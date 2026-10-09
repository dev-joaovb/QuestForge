import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.ts';

describe('Health Check Endpoint — Testes Unitários (GET /api/health)', () => {
  const validTestEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    PORT: '3000',
    FRONTEND_URL: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://user:super_secret_password@localhost:5432/questforge',
    SESSION_SECRET: 'chave_secreta_de_teste_com_mais_de_32_caracteres_12345',
    OLLAMA_BASE_URL: 'http://localhost:11434',
    MINIO_ENDPOINT: 'localhost',
    MINIO_PORT: '9000',
    MINIO_BUCKET: 'questforge-documents',
    MINIO_USE_SSL: 'false',
  };

  it('deve retornar HTTP 200 e status healthy quando a aplicação e o PostgreSQL estão ativos e variáveis configuradas', async () => {
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

    // Garante que nenhuma credencial vaze na resposta HTTP
    const rawBody = JSON.stringify(response.body);
    expect(rawBody).not.toContain('super_secret_password');
    expect(rawBody).not.toContain('chave_secreta_de_teste');
  });

  it('deve retornar HTTP 503 e distinguir claramente app="up" de database="down" quando o PostgreSQL está indisponível', async () => {
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

  it('deve retornar HTTP 503 e database="unconfigured" quando DATABASE_URL não foi preenchida', async () => {
    const app = createApp({
      health: {
        rawEnv: { NODE_ENV: 'test' },
        checkDb: async () => ({
          status: 'unconfigured',
          latencyMs: null,
          message: 'Variável DATABASE_URL ausente. Configure a conexão PostgreSQL no arquivo .env.',
        }),
      },
    });

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('degraded');
    expect(response.body.app.status).toBe('up');
    expect(response.body.dependencies.database.status).toBe('unconfigured');
    expect(response.body.dependencies.environment.status).toBe('incomplete');
    expect(response.body.dependencies.environment.missingOrInvalidCount).toBeGreaterThan(0);
  });

  it('deve retornar HTTP 404 JSON para rotas /api/* inexistentes sem cair no fallback do frontend', async () => {
    const app = createApp();
    const response = await request(app).get('/api/rota-inexistente');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('NotFound');
  });
});
