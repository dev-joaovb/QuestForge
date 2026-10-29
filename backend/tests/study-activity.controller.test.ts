import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.ts';
import { AuthService } from '../src/services/auth.service.ts';
import { StudyActivityService } from '../src/services/study-activity.service.ts';
import { StreakService } from '../src/services/streak.service.ts';
import { MockStudyActivityRepository } from '../src/repositories/study-activity.repository.ts';
import { MockUserStreakRepository } from '../src/repositories/user-streak.repository.ts';
import { type ValidatedSessionResult } from '../src/types/auth.types.ts';
import { SESSION_COOKIE_NAME } from '../src/utils/cookies.ts';

describe('Rotas HTTP de Histórico de Atividades e Streak (/api/activities) — Sprint 7.2', () => {
  const user1 = {
    id: 'user-1',
    name: 'Estudante Concurseiro',
    email: 'estudante@questforge.local',
    avatarUrl: null,
    createdAt: new Date('2026-10-20T10:00:00Z'),
    updatedAt: new Date('2026-10-20T10:00:00Z'),
  };

  const user2 = {
    id: 'user-2',
    name: 'Outro Concurseiro',
    email: 'outro@questforge.local',
    avatarUrl: null,
    createdAt: new Date('2026-10-20T10:00:00Z'),
    updatedAt: new Date('2026-10-20T10:00:00Z'),
  };

  let mockAuthService: AuthService;
  let activityRepo: MockStudyActivityRepository;
  let streakRepo: MockUserStreakRepository;
  let streakService: StreakService;
  let studyActivityService: StudyActivityService;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    activityRepo = new MockStudyActivityRepository();
    streakRepo = new MockUserStreakRepository();
    streakService = new StreakService(streakRepo);
    studyActivityService = new StudyActivityService({
      studyActivityRepository: activityRepo,
      userStreakRepository: streakRepo,
      streakService,
    });

    mockAuthService = {
      validateSession: vi.fn().mockImplementation(async (token: string): Promise<ValidatedSessionResult> => {
        if (token === 'token-user-1') {
          return {
            user: user1,
            session: {
              id: 'session-1',
              userId: user1.id,
              expiresAt: new Date(Date.now() + 3600000),
              createdAt: new Date(),
              lastUsedAt: new Date(),
            },
          };
        }
        if (token === 'token-user-2') {
          return {
            user: user2,
            session: {
              id: 'session-2',
              userId: user2.id,
              expiresAt: new Date(Date.now() + 3600000),
              createdAt: new Date(),
              lastUsedAt: new Date(),
            },
          };
        }
        throw new Error('Invalid token');
      }),
    } as unknown as AuthService;

    app = createApp({
      auth: { authService: mockAuthService },
      activities: {
        authService: mockAuthService,
        studyActivityService,
        streakService,
      },
    });
  });

  describe('GET /api/activities/streak', () => {
    it('1. deve rejeitar com HTTP 401 requisições sem autenticação', async () => {
      const response = await request(app).get('/api/activities/streak');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
      expect(response.body.message).toBe('Autenticação necessária.');
    });

    it('2. deve retornar HTTP 200 com zeros estruturados para usuário sem streak gravado', async () => {
      const response = await request(app)
        .get('/api/activities/streak')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

      expect(response.status).toBe(200);
      expect(response.body.streak).toBeDefined();
      expect(response.body.streak.userId).toBe('user-1');
      expect(response.body.streak.currentStreak).toBe(0);
      expect(response.body.streak.longestStreak).toBe(0);
      expect(response.body.streak.lastActivityDate).toBeNull();
    });

    it('3. deve retornar HTTP 200 com dados reais para usuário com streak gravado', async () => {
      await streakRepo.upsert('user-1', {
        currentStreak: 5,
        longestStreak: 10,
        lastActivityDate: '2026-10-29',
      });

      const response = await request(app)
        .get('/api/activities/streak')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

      expect(response.status).toBe(200);
      expect(response.body.streak).toBeDefined();
      expect(response.body.streak.userId).toBe('user-1');
      expect(response.body.streak.currentStreak).toBe(5);
      expect(response.body.streak.longestStreak).toBe(10);
      expect(response.body.streak.lastActivityDate).toBe('2026-10-29');
    });

    it('4. isolamento multiusuário: não permite consultar streak de outro usuário via query ou body', async () => {
      // Usuário 1 tem streak 5
      await streakRepo.upsert('user-1', {
        currentStreak: 5,
        longestStreak: 10,
        lastActivityDate: '2026-10-29',
      });

      // Usuário 2 tem streak 1
      await streakRepo.upsert('user-2', {
        currentStreak: 1,
        longestStreak: 1,
        lastActivityDate: '2026-10-28',
      });

      // Usuário 2 requisita com tentativa de spoofing ?userId=user-1
      const response = await request(app)
        .get('/api/activities/streak?userId=user-1')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-2`]);

      expect(response.status).toBe(200);
      // Deve retornar o streak do usuário 2 autenticado!
      expect(response.body.streak.userId).toBe('user-2');
      expect(response.body.streak.currentStreak).toBe(1);
    });
  });

  describe('GET /api/activities (Histórico Paginado)', () => {
    beforeEach(async () => {
      // Popular atividades para user-1
      const date1 = new Date('2026-10-27T10:00:00Z');
      const date2 = new Date('2026-10-28T14:00:00Z');
      const date3 = new Date('2026-10-29T09:00:00Z');

      await activityRepo.create({
        userId: 'user-1',
        type: 'SIMULATION',
        simulationId: 'sim-1',
        durationSeconds: 1800,
        scorePercentage: 80,
        correctCount: 8,
        wrongCount: 2,
        unansweredCount: 0,
        completedAt: date1,
      });

      await activityRepo.create({
        userId: 'user-1',
        type: 'QUESTION',
        questionId: 'q-1',
        correctCount: 1,
        wrongCount: 0,
        unansweredCount: 0,
        completedAt: date2,
      });

      await activityRepo.create({
        userId: 'user-1',
        type: 'EXAM',
        examId: 'exam-1',
        durationSeconds: 7200,
        scorePercentage: 90,
        correctCount: 45,
        wrongCount: 5,
        unansweredCount: 0,
        completedAt: date3,
      });

      // Atividade de user-2 (isolamento)
      await activityRepo.create({
        userId: 'user-2',
        type: 'SIMULATION',
        simulationId: 'sim-user2',
        completedAt: date2,
      });
    });

    it('5. deve rejeitar com HTTP 401 requisições sem autenticação', async () => {
      const response = await request(app).get('/api/activities');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });

    it('6. deve retornar HTTP 200 com lista paginada e contadores padrões (limit=20, offset=0)', async () => {
      const response = await request(app)
        .get('/api/activities')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

      expect(response.status).toBe(200);
      expect(response.body.activities).toBeInstanceOf(Array);
      expect(response.body.activities.length).toBe(3);
      expect(response.body.total).toBe(3);
      expect(response.body.limit).toBe(20);
      expect(response.body.offset).toBe(0);

      // Ordenação decrescente por completedAt
      expect(response.body.activities[0].type).toBe('EXAM'); // 29/10
      expect(response.body.activities[1].type).toBe('QUESTION'); // 28/10
      expect(response.body.activities[2].type).toBe('SIMULATION'); // 27/10
    });

    it('7. deve paginar corretamente com limit e offset', async () => {
      const response = await request(app)
        .get('/api/activities?limit=1&offset=1')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

      expect(response.status).toBe(200);
      expect(response.body.activities.length).toBe(1);
      expect(response.body.total).toBe(3);
      expect(response.body.limit).toBe(1);
      expect(response.body.offset).toBe(1);
      expect(response.body.activities[0].type).toBe('QUESTION');
    });

    it('8. deve filtrar por tipo (type=SIMULATION)', async () => {
      const response = await request(app)
        .get('/api/activities?type=SIMULATION')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

      expect(response.status).toBe(200);
      expect(response.body.activities.length).toBe(1);
      expect(response.body.total).toBe(1);
      expect(response.body.activities[0].simulationId).toBe('sim-1');
    });

    it('9. deve filtrar por intervalo de datas (startDate e endDate)', async () => {
      const response = await request(app)
        .get('/api/activities?startDate=2026-10-28T00:00:00Z&endDate=2026-10-28T23:59:59Z')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

      expect(response.status).toBe(200);
      expect(response.body.activities.length).toBe(1);
      expect(response.body.total).toBe(1);
      expect(response.body.activities[0].type).toBe('QUESTION');
    });

    it('10. deve rejeitar com HTTP 400 quando startDate for posterior a endDate', async () => {
      const response = await request(app)
        .get('/api/activities?startDate=2026-10-29T00:00:00Z&endDate=2026-10-28T00:00:00Z')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('ACTIVITY_INVALID_INPUT');
      expect(response.body.message).toContain('startDate');
    });

    it('11. deve rejeitar com HTTP 400 parâmetros inválidos (limit=0, limit=101, offset=-1, type inválido, page)', async () => {
      // limit=0
      let res = await request(app)
        .get('/api/activities?limit=0')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);
      expect(res.status).toBe(400);

      // limit=101
      res = await request(app)
        .get('/api/activities?limit=101')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);
      expect(res.status).toBe(400);

      // offset=-1
      res = await request(app)
        .get('/api/activities?offset=-1')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);
      expect(res.status).toBe(400);

      // type inválido
      res = await request(app)
        .get('/api/activities?type=INVALID_TYPE')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);
      expect(res.status).toBe(400);

      // page não permitido nesta sprint
      res = await request(app)
        .get('/api/activities?page=2')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ACTIVITY_INVALID_INPUT');
    });

    it('12. isolamento multiusuário: garante que Usuário 2 não visualiza atividades do Usuário 1', async () => {
      const response = await request(app)
        .get('/api/activities')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-2`]);

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(1);
      expect(response.body.activities.length).toBe(1);
      expect(response.body.activities[0].userId).toBe('user-2');
      expect(response.body.activities[0].simulationId).toBe('sim-user2');
    });

    it('13. desempate determinístico por id DESC quando completedAt for idêntico', async () => {
      const sameDate = new Date('2026-10-25T12:00:00Z');
      activityRepo.activities = []; // Limpa para teste isolado

      // Cria atividade A e atividade B com mesma data
      activityRepo.activities.push({
        id: 'act-aaa',
        userId: 'user-1',
        type: 'QUESTION',
        simulationId: null,
        questionId: 'q-a',
        examId: null,
        durationSeconds: null,
        scorePercentage: null,
        correctCount: null,
        wrongCount: null,
        unansweredCount: null,
        completedAt: sameDate,
        createdAt: sameDate,
      });

      activityRepo.activities.push({
        id: 'act-zzz',
        userId: 'user-1',
        type: 'QUESTION',
        simulationId: null,
        questionId: 'q-z',
        examId: null,
        durationSeconds: null,
        scorePercentage: null,
        correctCount: null,
        wrongCount: null,
        unansweredCount: null,
        completedAt: sameDate,
        createdAt: sameDate,
      });

      const response = await request(app)
        .get('/api/activities')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

      expect(response.status).toBe(200);
      expect(response.body.activities.length).toBe(2);
      // act-zzz vem antes de act-aaa pelo desempate por id DESC
      expect(response.body.activities[0].id).toBe('act-zzz');
      expect(response.body.activities[1].id).toBe('act-aaa');
    });

    it('14. resposta vazia estruturada quando o usuário não tiver atividades', async () => {
      activityRepo.activities = [];

      const response = await request(app)
        .get('/api/activities')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

      expect(response.status).toBe(200);
      expect(response.body.activities).toEqual([]);
      expect(response.body.total).toBe(0);
      expect(response.body.limit).toBe(20);
      expect(response.body.offset).toBe(0);
    });
  });
});
