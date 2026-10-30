import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Simulation, StudyActivity } from '@prisma/client';
import { DashboardService } from '../src/services/dashboard.service.ts';
import { MockDashboardRepository } from '../src/repositories/dashboard.repository.ts';
import { MockStudyActivityRepository } from '../src/repositories/study-activity.repository.ts';
import { MockUserStreakRepository } from '../src/repositories/user-streak.repository.ts';
import { StreakService } from '../src/services/streak.service.ts';
import { calculateAccuracyPercentage, DashboardDomainError } from '../src/types/dashboard.types.ts';

describe('DashboardService (Sprint 8.1: Contratos, Repositório e Agregações)', () => {
  let dashboardRepo: MockDashboardRepository;
  let activityRepo: MockStudyActivityRepository;
  let streakRepo: MockUserStreakRepository;
  let streakService: StreakService;
  let dashboardService: DashboardService;

  const user1 = 'user-test-1';
  const user2 = 'user-test-2';

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
  });

  it('1. deve retornar zeros estruturados para usuário sem simulados, atividades ou streak', async () => {
    const summary = await dashboardService.getSummary(user1);

    expect(summary).toBeDefined();
    expect(summary.completedSimulationsCount).toBe(0);
    expect(summary.totalAnsweredQuestions).toBe(0);
    expect(summary.totalCorrectAnswers).toBe(0);
    expect(summary.totalWrongAnswers).toBe(0);
    expect(summary.accuracyPercentage).toBe(0);
    expect(summary.totalDurationSeconds).toBe(0);
    expect(summary.currentStreak).toBe(0);
    expect(summary.longestStreak).toBe(0);
    expect(summary.lastActivityDate).toBeNull();
    expect(summary.recentSimulationsEvolution).toEqual([]);
    expect(summary.recentActivities).toEqual([]);
  });

  it('2. deve agregar corretamente as métricas de um usuário com um simulado concluído', async () => {
    const finishDate = new Date('2026-10-25T14:30:00Z');
    dashboardRepo.simulations.push({
      id: 'sim-1',
      userId: user1,
      title: 'Simulado Tribunal de Contas',
      status: 'COMPLETED',
      totalQuestions: 20,
      timeLimitSeconds: 3600,
      startedAt: new Date('2026-10-25T13:30:00Z'),
      finishedAt: finishDate,
      durationSeconds: 3200,
      scorePercentage: 75.0,
      correctCount: 15,
      wrongCount: 5,
      unansweredCount: 0,
      createdAt: new Date('2026-10-25T13:00:00Z'),
      updatedAt: finishDate,
    });

    const summary = await dashboardService.getSummary(user1);

    expect(summary.completedSimulationsCount).toBe(1);
    expect(summary.totalAnsweredQuestions).toBe(20);
    expect(summary.totalCorrectAnswers).toBe(15);
    expect(summary.totalWrongAnswers).toBe(5);
    expect(summary.accuracyPercentage).toBe(75.0);
    expect(summary.totalDurationSeconds).toBe(3200);
    expect(summary.recentSimulationsEvolution).toHaveLength(1);
    expect(summary.recentSimulationsEvolution[0].id).toBe('sim-1');
    expect(summary.recentSimulationsEvolution[0].title).toBe('Simulado Tribunal de Contas');
  });

  it('3. deve agregar múltiplos simulados concluídos e ignorar simulados em andamento ou não concluídos', async () => {
    dashboardRepo.simulations.push(
      // 1. Concluído
      {
        id: 'sim-completed-1',
        userId: user1,
        title: 'Simulado 1',
        status: 'COMPLETED',
        totalQuestions: 10,
        timeLimitSeconds: null,
        startedAt: new Date('2026-10-20T10:00:00Z'),
        finishedAt: new Date('2026-10-20T10:30:00Z'),
        durationSeconds: 1800,
        scorePercentage: 80,
        correctCount: 8,
        wrongCount: 2,
        unansweredCount: 0,
        createdAt: new Date('2026-10-20T09:00:00Z'),
        updatedAt: new Date('2026-10-20T10:30:00Z'),
      },
      // 2. Concluído
      {
        id: 'sim-completed-2',
        userId: user1,
        title: 'Simulado 2',
        status: 'COMPLETED',
        totalQuestions: 10,
        timeLimitSeconds: null,
        startedAt: new Date('2026-10-22T10:00:00Z'),
        finishedAt: new Date('2026-10-22T10:40:00Z'),
        durationSeconds: 2400,
        scorePercentage: 60,
        correctCount: 6,
        wrongCount: 4,
        unansweredCount: 0,
        createdAt: new Date('2026-10-22T09:00:00Z'),
        updatedAt: new Date('2026-10-22T10:40:00Z'),
      }
    );

    const summary = await dashboardService.getSummary(user1);

    expect(summary.completedSimulationsCount).toBe(2);
    expect(summary.totalAnsweredQuestions).toBe(20);
    expect(summary.totalCorrectAnswers).toBe(14); // 8 + 6
    expect(summary.totalWrongAnswers).toBe(6); // 2 + 4
    expect(summary.accuracyPercentage).toBe(70.0); // 14 / 20 * 100
    expect(summary.totalDurationSeconds).toBe(4200); // 1800 + 2400
  });

  it('4. deve excluir estritamente status CREATED, IN_PROGRESS, ABANDONED e EXPIRED das métricas', async () => {
    dashboardRepo.simulations.push(
      {
        id: 'sim-created',
        userId: user1,
        title: 'Não iniciado',
        status: 'CREATED',
        totalQuestions: 10,
        timeLimitSeconds: null,
        startedAt: null,
        finishedAt: null,
        durationSeconds: null,
        scorePercentage: null,
        correctCount: null,
        wrongCount: null,
        unansweredCount: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'sim-in-progress',
        userId: user1,
        title: 'Em andamento',
        status: 'IN_PROGRESS',
        totalQuestions: 10,
        timeLimitSeconds: 3600,
        startedAt: new Date(),
        finishedAt: null,
        durationSeconds: null,
        scorePercentage: null,
        correctCount: 5,
        wrongCount: 1,
        unansweredCount: 4,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'sim-abandoned',
        userId: user1,
        title: 'Abandonado',
        status: 'ABANDONED',
        totalQuestions: 10,
        timeLimitSeconds: null,
        startedAt: new Date(),
        finishedAt: new Date(),
        durationSeconds: 500,
        scorePercentage: null,
        correctCount: 2,
        wrongCount: 2,
        unansweredCount: 6,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'sim-expired',
        userId: user1,
        title: 'Expirado',
        status: 'EXPIRED',
        totalQuestions: 10,
        timeLimitSeconds: 1800,
        startedAt: new Date(),
        finishedAt: new Date(),
        durationSeconds: 1800,
        scorePercentage: 30,
        correctCount: 3,
        wrongCount: 7,
        unansweredCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'sim-completed',
        userId: user1,
        title: 'Único concluído',
        status: 'COMPLETED',
        totalQuestions: 10,
        timeLimitSeconds: null,
        startedAt: new Date('2026-10-21T10:00:00Z'),
        finishedAt: new Date('2026-10-21T10:30:00Z'),
        durationSeconds: 1200,
        scorePercentage: 90,
        correctCount: 9,
        wrongCount: 1,
        unansweredCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    );

    const summary = await dashboardService.getSummary(user1);

    expect(summary.completedSimulationsCount).toBe(1);
    expect(summary.totalAnsweredQuestions).toBe(10);
    expect(summary.totalCorrectAnswers).toBe(9);
    expect(summary.totalWrongAnswers).toBe(1);
    expect(summary.accuracyPercentage).toBe(90.0);
    expect(summary.totalDurationSeconds).toBe(1200);
    expect(summary.recentSimulationsEvolution).toHaveLength(1);
    expect(summary.recentSimulationsEvolution[0].id).toBe('sim-completed');
  });

  it('5. deve calcular a precisão ponderada e não a média simples dos percentuais individuais', () => {
    // Exemplo: Simulado 1 com 10 questões e 100% (10 acertos).
    //          Simulado 2 com 90 questões e 50% (45 acertos).
    // Total de questões: 100, Total de acertos: 55.
    // Precisão ponderada real: 55.0%.
    // Média simples errada: (100 + 50) / 2 = 75.0%.
    const accuracy = calculateAccuracyPercentage(55, 45);
    expect(accuracy).toBe(55.0);

    // Arredondamento para 1 casa decimal (1/3 acertos = 33.333... -> 33.3)
    expect(calculateAccuracyPercentage(1, 2)).toBe(33.3);
    // 2/3 acertos = 66.666... -> 66.7
    expect(calculateAccuracyPercentage(2, 1)).toBe(66.7);
  });

  it('6. deve retornar 0 sem NaN ou Infinity quando o denominador for zero', () => {
    expect(calculateAccuracyPercentage(0, 0)).toBe(0);
    expect(calculateAccuracyPercentage(0, -5)).toBe(0);
    expect(calculateAccuracyPercentage(NaN, 0)).toBe(0);
    expect(calculateAccuracyPercentage(0, Infinity)).toBe(0);
  });

  it('7. deve tratar valores nulos de durationSeconds sem quebrar a soma', async () => {
    dashboardRepo.simulations.push(
      {
        id: 'sim-null-duration',
        userId: user1,
        title: 'Sem duração',
        status: 'COMPLETED',
        totalQuestions: 5,
        timeLimitSeconds: null,
        startedAt: null,
        finishedAt: new Date('2026-10-21T10:00:00Z'),
        durationSeconds: null,
        scorePercentage: 100,
        correctCount: 5,
        wrongCount: 0,
        unansweredCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'sim-with-duration',
        userId: user1,
        title: 'Com duração',
        status: 'COMPLETED',
        totalQuestions: 5,
        timeLimitSeconds: null,
        startedAt: new Date('2026-10-22T10:00:00Z'),
        finishedAt: new Date('2026-10-22T10:15:00Z'),
        durationSeconds: 900,
        scorePercentage: 80,
        correctCount: 4,
        wrongCount: 1,
        unansweredCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    );

    const summary = await dashboardService.getSummary(user1);

    expect(summary.completedSimulationsCount).toBe(2);
    expect(summary.totalDurationSeconds).toBe(900);
    expect(summary.accuracyPercentage).toBe(90.0);
  });

  it('8. deve selecionar os 10 simulados mais recentes e apresentá-los em ordem cronológica (não os mais antigos)', async () => {
    // Cria 15 simulados concluídos em dias sucessivos
    for (let i = 1; i <= 15; i++) {
      const day = i < 10 ? `0${i}` : `${i}`;
      const date = new Date(`2026-10-${day}T12:00:00Z`);
      dashboardRepo.simulations.push({
        id: `sim-${i.toString().padStart(2, '0')}`,
        userId: user1,
        title: `Simulado Dia ${i}`,
        status: 'COMPLETED',
        totalQuestions: 10,
        timeLimitSeconds: null,
        startedAt: date,
        finishedAt: date,
        durationSeconds: 1000 + i,
        scorePercentage: 50 + i,
        correctCount: 5,
        wrongCount: 5,
        unansweredCount: 0,
        createdAt: date,
        updatedAt: date,
      });
    }

    const summary = await dashboardService.getSummary(user1);

    // Deve conter exatamente 10 registros na evolução
    expect(summary.recentSimulationsEvolution).toHaveLength(10);

    // Os 10 mais recentes são de sim-06 até sim-15.
    // Ordenados cronologicamente para a curva visual (do mais antigo dos 10 para o mais novo):
    expect(summary.recentSimulationsEvolution[0].id).toBe('sim-06');
    expect(summary.recentSimulationsEvolution[9].id).toBe('sim-15');

    // Garante que sim-01 a sim-05 NÃO estão no resultado
    const ids = summary.recentSimulationsEvolution.map((s) => s.id);
    expect(ids).not.toContain('sim-01');
    expect(ids).not.toContain('sim-05');
  });

  it('9. deve realizar desempate determinístico por ID quando finishedAt for idêntico', async () => {
    const sameDate = new Date('2026-10-25T15:00:00Z');

    dashboardRepo.simulations.push(
      {
        id: 'sim-bbb',
        userId: user1,
        title: 'Simulado B',
        status: 'COMPLETED',
        totalQuestions: 5,
        timeLimitSeconds: null,
        startedAt: sameDate,
        finishedAt: sameDate,
        durationSeconds: 600,
        scorePercentage: 80,
        correctCount: 4,
        wrongCount: 1,
        unansweredCount: 0,
        createdAt: sameDate,
        updatedAt: sameDate,
      },
      {
        id: 'sim-aaa',
        userId: user1,
        title: 'Simulado A',
        status: 'COMPLETED',
        totalQuestions: 5,
        timeLimitSeconds: null,
        startedAt: sameDate,
        finishedAt: sameDate,
        durationSeconds: 600,
        scorePercentage: 60,
        correctCount: 3,
        wrongCount: 2,
        unansweredCount: 0,
        createdAt: sameDate,
        updatedAt: sameDate,
      }
    );

    const summary = await dashboardService.getSummary(user1);

    expect(summary.recentSimulationsEvolution).toHaveLength(2);
    // Na curva cronológica com mesma data, desempata crescentemente por id:
    expect(summary.recentSimulationsEvolution[0].id).toBe('sim-aaa');
    expect(summary.recentSimulationsEvolution[1].id).toBe('sim-bbb');
  });

  it('10. deve retornar no máximo as 5 atividades mais recentes do usuário', async () => {
    // Registra 8 atividades de estudo em ordem temporal
    for (let i = 1; i <= 8; i++) {
      const day = i < 10 ? `0${i}` : `${i}`;
      const date = new Date(`2026-10-${day}T10:00:00Z`);
      activityRepo.activities.push({
        id: `act-${i.toString().padStart(2, '0')}`,
        userId: user1,
        type: 'SIMULATION',
        simulationId: `sim-${i}`,
        questionId: null,
        examId: null,
        durationSeconds: 1200,
        scorePercentage: 70 + i,
        correctCount: 7,
        wrongCount: 3,
        unansweredCount: 0,
        completedAt: date,
        createdAt: date,
      });
    }

    const summary = await dashboardService.getSummary(user1);

    expect(summary.recentActivities).toHaveLength(5);
    // Ordenadas por completedAt desc: a mais recente (act-08) é a primeira
    expect(summary.recentActivities[0].id).toBe('act-08');
    expect(summary.recentActivities[1].id).toBe('act-07');
    expect(summary.recentActivities[2].id).toBe('act-06');
    expect(summary.recentActivities[3].id).toBe('act-05');
    expect(summary.recentActivities[4].id).toBe('act-04');
  });

  it('11. deve retornar streak real quando existente e zeros quando inexistente', async () => {
    // Cenário A: Inexistente
    let summary = await dashboardService.getSummary(user1);
    expect(summary.currentStreak).toBe(0);
    expect(summary.longestStreak).toBe(0);
    expect(summary.lastActivityDate).toBeNull();

    // Cenário B: Existente
    await streakRepo.upsert(user1, {
      currentStreak: 12,
      longestStreak: 25,
      lastActivityDate: '2026-10-28',
    });

    summary = await dashboardService.getSummary(user1);
    expect(summary.currentStreak).toBe(12);
    expect(summary.longestStreak).toBe(25);
    expect(summary.lastActivityDate).toBe('2026-10-28');
  });

  it('12. deve garantir isolamento multiusuário estrito em todas as consultas do dashboard', async () => {
    // Popula dados para user-1
    dashboardRepo.simulations.push({
      id: 'sim-user1',
      userId: user1,
      title: 'Simulado User 1',
      status: 'COMPLETED',
      totalQuestions: 10,
      timeLimitSeconds: null,
      startedAt: new Date(),
      finishedAt: new Date(),
      durationSeconds: 1500,
      scorePercentage: 90,
      correctCount: 9,
      wrongCount: 1,
      unansweredCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await streakRepo.upsert(user1, {
      currentStreak: 10,
      longestStreak: 10,
      lastActivityDate: '2026-10-29',
    });

    activityRepo.activities.push({
      id: 'act-user1',
      userId: user1,
      type: 'SIMULATION',
      simulationId: 'sim-user1',
      questionId: null,
      examId: null,
      durationSeconds: 1500,
      scorePercentage: 90,
      correctCount: 9,
      wrongCount: 1,
      unansweredCount: 0,
      completedAt: new Date(),
      createdAt: new Date(),
    });

    // Popula dados para user-2
    dashboardRepo.simulations.push({
      id: 'sim-user2',
      userId: user2,
      title: 'Simulado User 2',
      status: 'COMPLETED',
      totalQuestions: 20,
      timeLimitSeconds: null,
      startedAt: new Date(),
      finishedAt: new Date(),
      durationSeconds: 3000,
      scorePercentage: 50,
      correctCount: 10,
      wrongCount: 10,
      unansweredCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await streakRepo.upsert(user2, {
      currentStreak: 2,
      longestStreak: 4,
      lastActivityDate: '2026-10-27',
    });

    // Consulta para user-1
    const summary1 = await dashboardService.getSummary(user1);
    expect(summary1.completedSimulationsCount).toBe(1);
    expect(summary1.totalAnsweredQuestions).toBe(10);
    expect(summary1.totalCorrectAnswers).toBe(9);
    expect(summary1.accuracyPercentage).toBe(90.0);
    expect(summary1.currentStreak).toBe(10);
    expect(summary1.recentActivities[0].userId).toBe(user1);

    // Consulta para user-2
    const summary2 = await dashboardService.getSummary(user2);
    expect(summary2.completedSimulationsCount).toBe(1);
    expect(summary2.totalAnsweredQuestions).toBe(20);
    expect(summary2.totalCorrectAnswers).toBe(10);
    expect(summary2.accuracyPercentage).toBe(50.0);
    expect(summary2.currentStreak).toBe(2);
  });

  it('13. deve garantir a ausência de operações de escrita ou efeitos colaterais durante consultas', async () => {
    const streakUpsertSpy = vi.spyOn(streakRepo, 'upsert');
    const activityCreateSpy = vi.spyOn(activityRepo, 'create');

    await dashboardService.getSummary(user1);

    expect(streakUpsertSpy).not.toHaveBeenCalled();
    expect(activityCreateSpy).not.toHaveBeenCalled();
    expect(dashboardRepo.writeCallCount).toBe(0);
  });

  it('14. deve rejeitar consulta com identificador de usuário nulo ou em branco', async () => {
    await expect(dashboardService.getSummary('')).rejects.toThrow(DashboardDomainError);
    await expect(dashboardService.getSummary('   ')).rejects.toThrow(DashboardDomainError);
    // @ts-expect-error teste com valor undefined
    await expect(dashboardService.getSummary(undefined)).rejects.toThrow(DashboardDomainError);
  });
});
