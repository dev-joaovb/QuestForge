import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.ts';
import { getPrismaClient } from '../src/config/database.ts';
import { CSRF_HEADER_EXPECTED_VALUE } from '../src/middlewares/csrf.middleware.ts';

/**
 * TESTES DE INTEGRAÇÃO REAL — AUTENTICAÇÃO + POSTGRESQL + PRISMA
 *
 * Exercitam as rotas HTTP `/api/auth/*` diretamente contra o PostgreSQL real.
 * Ficam marcados como `skipped` quando não há uma instância PostgreSQL ativa
 * configurada com `RUN_DB_INTEGRATION=true`.
 */
const hasLivePostgres =
  Boolean(process.env.DATABASE_URL) &&
  !process.env.DATABASE_URL?.includes('SEU_USUARIO') &&
  Boolean(process.env.SESSION_SECRET) &&
  process.env.SESSION_SECRET!.length >= 32 &&
  process.env.RUN_DB_INTEGRATION === 'true';

describe('Autenticação & Sessões — Testes de Integração Real com PostgreSQL', () => {
  it.skipIf(!hasLivePostgres)(
    '[REQUER POSTGRESQL ATIVO] deve persistir usuário e sessão no PostgreSQL, validar /api/auth/me e remover sessão no logout',
    async () => {
      const prisma = getPrismaClient();
      const testEmail = `integration.${Date.now()}@questforge.dev`;
      const agent = request.agent(app);

      try {
        const regRes = await agent
          .post('/api/auth/register')
          .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
          .send({
            name: 'Teste Integração PostgreSQL',
            email: testEmail,
            password: 'SenhaIntegracaoForte123!',
          });

        expect(regRes.status).toBe(201);
        expect(regRes.body.user.email).toBe(testEmail);

        const meRes = await agent.get('/api/auth/me');
        expect(meRes.status).toBe(200);
        expect(meRes.body.user.id).toBe(regRes.body.user.id);

        const logoutRes = await agent
          .post('/api/auth/logout')
          .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE);
        expect(logoutRes.status).toBe(200);

        const meAfterLogout = await agent.get('/api/auth/me');
        expect(meAfterLogout.status).toBe(401);
      } finally {
        await prisma.user.deleteMany({ where: { email: testEmail } });
      }
    }
  );
});
