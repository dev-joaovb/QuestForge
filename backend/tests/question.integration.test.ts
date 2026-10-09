import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.ts';
import { getPrismaClient } from '../src/config/database.ts';
import { CSRF_HEADER_EXPECTED_VALUE } from '../src/middlewares/csrf.middleware.ts';

/**
 * TESTES DE INTEGRAÇÃO REAL — BANCO DE QUESTÕES + POSTGRESQL + PRISMA
 *
 * Exercitam o ciclo completo de persistência de questões e alternativas
 * nas rotas HTTP `/api/questions` diretamente contra o PostgreSQL real.
 * Ficam identificados como `skipped` quando não há uma instância PostgreSQL ativa
 * configurada com `RUN_DB_INTEGRATION=true`.
 */
const hasLivePostgres =
  Boolean(process.env.DATABASE_URL) &&
  !process.env.DATABASE_URL?.includes('SEU_USUARIO') &&
  Boolean(process.env.SESSION_SECRET) &&
  process.env.SESSION_SECRET!.length >= 32 &&
  process.env.RUN_DB_INTEGRATION === 'true';

describe('Banco de Questões — Testes de Integração Real com PostgreSQL', () => {
  it.skipIf(!hasLivePostgres)(
    '[REQUER POSTGRESQL ATIVO] deve persistir, listar, atualizar atomicamente alternativas e excluir questão no PostgreSQL',
    async () => {
      const prisma = getPrismaClient();
      const testEmail = `questions.integration.${Date.now()}@questforge.dev`;
      const agent = request.agent(app);

      try {
        const regRes = await agent
          .post('/api/auth/register')
          .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
          .send({
            name: 'Teste Integração Questões',
            email: testEmail,
            password: 'SenhaIntegracaoQuestoes123!',
          });

        expect(regRes.status).toBe(201);

        // 1. Cadastra questão com alternativas no PostgreSQL
        const createRes = await agent
          .post('/api/questions')
          .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
          .send({
            statement: 'Qual comando SQL faz parte da linguagem DML?',
            type: 'MULTIPLE_CHOICE',
            subject: 'Banco de Dados',
            topic: 'SQL',
            board: 'FGV',
            year: 2025,
            correctAnswer: 'A',
            explanation: 'SELECT/INSERT/UPDATE/DELETE compõem a manipulação de dados.',
            alternatives: [
              { letter: 'A', text: 'INSERT' },
              { letter: 'B', text: 'CREATE TABLE' },
              { letter: 'C', text: 'DROP INDEX' },
            ],
          });

        expect(createRes.status).toBe(201);
        const questionId = createRes.body.question.id as string;

        // 2. Lista questões confirmando omissão padrão do gabarito
        const listRes = await agent.get('/api/questions?subject=Banco');
        expect(listRes.status).toBe(200);
        expect(listRes.body.total).toBe(1);
        expect('correctAnswer' in listRes.body.items[0]).toBe(false);

        // 3. Atualiza alternativas atomicamente no PostgreSQL
        const updateRes = await agent
          .put(`/api/questions/${questionId}`)
          .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
          .send({
            correctAnswer: 'B',
            alternatives: [
              { letter: 'A', text: 'ALTER TABLE' },
              { letter: 'B', text: 'UPDATE' },
            ],
          });

        expect(updateRes.status).toBe(200);
        expect(updateRes.body.question.correctAnswer).toBe('B');
        expect(updateRes.body.question.alternatives).toHaveLength(2);

        // 4. Exclui questão e verifica remoção em cascata das alternativas
        const delRes = await agent
          .delete(`/api/questions/${questionId}`)
          .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE);
        expect(delRes.status).toBe(200);

        const remainingAlternatives = await prisma.alternative.count({
          where: { questionId },
        });
        expect(remainingAlternatives).toBe(0);
      } finally {
        await prisma.user.deleteMany({ where: { email: testEmail } });
      }
    }
  );
});
