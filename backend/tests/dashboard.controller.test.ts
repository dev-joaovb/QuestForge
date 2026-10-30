import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.ts';
import { AuthService } from '../src/services/auth.service.ts';
import { DashboardService } from '../src/services/dashboard.service.ts';
import { MockDashboardRepository } from '../src/repositories/dashboard.repository.ts';
import { MockStudyActivityRepository } from '../src/repositories/study-activity.repository.ts';
import { MockUserStreakRepository } from '../src/repositories/user-streak.repository.ts';
import { StreakService } from '../src/services/streak.service.ts';
import { SESSION_COOKIE_NAME } from '../src/utils/cookies.ts';
import { type ValidatedSessionResult } from '../src/types/auth.types.ts';

describe('Rotas HTTP do Dashboard (/api/dashboard/summary) — Sprint 8.2', () => {
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
    name: 'Segundo Concurseiro',
    email: 'segundo@questforge.local',
    avatarUrl: null,
    createdAt: new Date('2026-10-20T10:00:00Z'),
    updatedAt: new Date('2026-10-20T10:00:00Z'),
  };

  let mockAuthService: AuthService;
  let dashboardRepo: MockDashboardRepository;
  let activityRepo: MockStudyActivityRepository;
  let streakRepo: MockUserStreakRepository;
  let streakService: StreakService;
  let dashboardService: DashboardService;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    dashboardRepo = new MockDashboardRepository();
    activityRepo = new MockStudyActivityRepository();
    streakRepo = new MockUserStreakRepository();
    streakService = new StreakService(streakRepo);

    dashboardService = new DashboardService({
      dashboardRepository: dashboardRepo,
      streakService,
      studyActivityRepository: activityRepo,
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
      dashboard: {
        authService: mockAuthService,
        dashboardService,
      },
    });
  });

  it('1. deve rejeitar com HTTP 401 requisições sem autenticação', async () => {
    const response = await request(app).get('/api/dashboard/summary');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Unauthorized');
    expect(response.body.message).toBe('Autenticação necessária.');
  });

  it('2. deve retornar HTTP 200 com resumo consolidado válido para usuário com simulados e atividades', async () => {
    const finishedAt = new Date('2026-10-28T16:00:00.000Z');

    dashboardRepo.simulations.push({
      id: 'sim-1',
      userId: user1.id,
      title: 'Simulado Direito Administrativo',
      status: 'COMPLETED',
      totalQuestions: 10,
      timeLimitSeconds: 1800,
      startedAt: new Date('2026-10-28T15:30:00.000Z'),
      finishedAt,
      durationSeconds: 1500,
      scorePercentage: 80.0,
      correctCount: 8,
      wrongCount: 2,
      unansweredCount: 0,
      createdAt: new Date('2026-10-28T15:00:00.000Z'),
      updatedAt: finishedAt,
    });

    await streakRepo.upsert(user1.id, {
      currentStreak: 5,
      longestStreak: 10,
      lastActivityDate: '2026-10-28',
    });

    activityRepo.activities.push({
      id: 'act-1',
      userId: user1.id,
      type: 'SIMULATION',
      simulationId: 'sim-1',
      questionId: null,
      examId: null,
      durationSeconds: 1500,
      scorePercentage: 80.0,
      correctCount: 8,
      wrongCount: 2,
      unansweredCount: 0,
      completedAt: finishedAt,
      createdAt: finishedAt,
    });

    const response = await request(app)
      .get('/api/dashboard/summary')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

    expect(response.status).toBe(200);
    expect(response.body.completedSimulationsCount).toBe(1);
    expect(response.body.totalAnsweredQuestions).toBe(10);
    expect(response.body.totalCorrectAnswers).toBe(8);
    expect(response.body.totalWrongAnswers).toBe(2);
    expect(response.body.accuracyPercentage).toBe(80.0);
    expect(response.body.totalDurationSeconds).toBe(1500);
    expect(response.body.currentStreak).toBe(5);
    expect(response.body.longestStreak).toBe(10);
    expect(response.body.lastActivityDate).toBe('2026-10-28');

    expect(response.body.recentSimulationsEvolution).toHaveLength(1);
    expect(response.body.recentSimulationsEvolution[0].id).toBe('sim-1');
    expect(response.body.recentSimulationsEvolution[0].title).toBe('Simulado Direito Administrativo');
    expect(response.body.recentSimulationsEvolution[0].finishedAt).toBe(finishedAt.toISOString());

    expect(response.body.recentActivities).toHaveLength(1);
    expect(response.body.recentActivities[0].id).toBe('act-1');
  });

  it('3. deve retornar HTTP 200 com zeros estruturados para conta recém-criada sem histórico', async () => {
    const response = await request(app)
      .get('/api/dashboard/summary')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      completedSimulationsCount: 0,
      totalAnsweredQuestions: 0,
      totalCorrectAnswers: 0,
      totalWrongAnswers: 0,
      accuracyPercentage: 0,
      totalDurationSeconds: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastActivityDate: null,
      recentSimulationsEvolution: [],
      recentActivities: [],
    });
  });

  it('4. isolamento multiusuário: garante que Usuário 2 não tem acesso aos dados do Usuário 1', async () => {
    // Dados para user 1
    dashboardRepo.simulations.push({
      id: 'sim-user1',
      userId: user1.id,
      title: 'Simulado do Usuário 1',
      status: 'COMPLETED',
      totalQuestions: 20,
      timeLimitSeconds: null,
      startedAt: new Date(),
      finishedAt: new Date(),
      durationSeconds: 2400,
      scorePercentage: 90,
      correctCount: 18,
      wrongCount: 2,
      unansweredCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await streakRepo.upsert(user1.id, {
      currentStreak: 20,
      longestStreak: 30,
      lastActivityDate: '2026-10-29',
    });

    // Usuário 2 consulta seu próprio dashboard
    const response = await request(app)
      .get('/api/dashboard/summary')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-2`]);

    expect(response.status).toBe(200);
    expect(response.body.completedSimulationsCount).toBe(0);
    expect(response.body.totalAnsweredQuestions).toBe(0);
    expect(response.body.currentStreak).toBe(0);
    expect(response.body.recentSimulationsEvolution).toEqual([]);
    expect(response.body.recentActivities).toEqual([]);
  });

  it('5. deve rejeitar com HTTP 400 tentativas de informar ?userId=...', async () => {
    const response = await request(app)
      .get('/api/dashboard/summary?userId=user-2')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('DASHBOARD_INVALID_INPUT');
    expect(response.body.message).toContain('não aceita parâmetros de consulta');
  });

  it('6. deve rejeitar com HTTP 400 qualquer parâmetro de query inesperado', async () => {
    let response = await request(app)
      .get('/api/dashboard/summary?foo=bar')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('DASHBOARD_INVALID_INPUT');

    response = await request(app)
      .get('/api/dashboard/summary?page=1&limit=10')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('DASHBOARD_INVALID_INPUT');
  });

  it('7. deve tratar erros inesperados com HTTP 503 sem expor detalhes internos ou stack traces', async () => {
    vi.spyOn(dashboardService, 'getSummary').mockRejectedValueOnce(
      new Error('Erro crítico de conexão com PostgreSQL')
    );

    const response = await request(app)
      .get('/api/dashboard/summary')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('ServiceUnavailable');
    expect(response.body.message).toBe('Não foi possível carregar os dados do dashboard no momento.');
    expect(response.body.stack).toBeUndefined();
    expect(response.body.details).toBeUndefined();
  });

  it('8. garante que o controller utiliza o DashboardService injetado passando req.user.id', async () => {
    const getSummarySpy = vi.spyOn(dashboardService, 'getSummary');

    const response = await request(app)
      .get('/api/dashboard/summary')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

    expect(response.status).toBe(200);
    expect(getSummarySpy).toHaveBeenCalledTimes(1);
    expect(getSummarySpy).toHaveBeenCalledWith('user-1');
  });

  it('9. serialização correta de datas em ISO e arrays vazios', async () => {
    const date = new Date('2026-10-25T12:00:00.000Z');

    dashboardRepo.simulations.push({
      id: 'sim-date-test',
      userId: user1.id,
      title: 'Simulado de Data',
      status: 'COMPLETED',
      totalQuestions: 5,
      timeLimitSeconds: null,
      startedAt: date,
      finishedAt: date,
      durationSeconds: 600,
      scorePercentage: 100,
      correctCount: 5,
      wrongCount: 0,
      unansweredCount: 0,
      createdAt: date,
      updatedAt: date,
    });

    const response = await request(app)
      .get('/api/dashboard/summary')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

    expect(response.status).toBe(200);
    expect(typeof response.body.recentSimulationsEvolution[0].finishedAt).toBe('string');
    expect(response.body.recentSimulationsEvolution[0].finishedAt).toBe('2026-10-25T12:00:00.000Z');
    expect(Array.isArray(response.body.recentActivities)).toBe(true);
    expect(response.body.recentActivities).toEqual([]);
  });
});
