import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.ts';
import { checkDatabaseHealth } from '../src/config/database.ts';

/**
 * TESTES DE INTEGRAÇÃO REAL — POSTGRESQL + PRISMA
 *
 * Estes testes não utilizam mocks: exercitam diretamente o PrismaClient real
 * e o endpoint GET /api/health contra o ambiente atual.
 *
 * - O teste de contrato real sempre executa e verifica a resposta real do ambiente.
 * - O teste de conectividade SQL (`SELECT 1` com banco ativo) é executado quando
 *   `DATABASE_URL` está configurada com uma instância PostgreSQL real e `RUN_DB_INTEGRATION=true`,
 *   ou fica explicitamente marcado como `skipped` quando não há PostgreSQL ativo no container.
 */
const hasLivePostgres =
  Boolean(process.env.DATABASE_URL) &&
  !process.env.DATABASE_URL?.includes('SEU_USUARIO') &&
  process.env.RUN_DB_INTEGRATION === 'true';

describe('PostgreSQL & Health Check — Testes de Integração Real', () => {
  it('deve executar checkDatabaseHealth() sem mocks e reportar de forma fidedigna o estado real do PostgreSQL no ambiente atual', async () => {
    const result = await checkDatabaseHealth();

    expect(['up', 'down', 'unconfigured']).toContain(result.status);
    expect(typeof result.message).toBe('string');

    const response = await request(app).get('/api/health');
    expect([200, 503]).toContain(response.status);
    expect(response.body.app.status).toBe('up');
    expect(response.body.dependencies.database.status).toBe(result.status);
  });

  it.skipIf(!hasLivePostgres)(
    '[REQUER POSTGRESQL ATIVO] deve conectar ao PostgreSQL real via Prisma (SELECT 1) e retornar HTTP 200 em GET /api/health',
    async () => {
      const dbStatus = await checkDatabaseHealth();
      expect(dbStatus.status).toBe('up');
      expect(typeof dbStatus.latencyMs).toBe('number');

      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body.dependencies.database.status).toBe('up');
    }
  );
});
