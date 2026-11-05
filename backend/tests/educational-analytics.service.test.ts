import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EducationalAnalyticsService } from '../src/services/educational-analytics.service.ts';
import {
  MockEducationalAnalyticsRepository,
  PrismaEducationalAnalyticsRepository,
  type MockSimulationItem,
  type MockQuestionAttemptItem,
} from '../src/repositories/educational-analytics.repository.ts';
import {
  EducationalAnalyticsDomainError,
  calculateAccuracyPercentage,
  determineTemporalTrend,
  normalizeSubjectKey,
} from '../src/types/educational-analytics.types.ts';

describe('EducationalAnalyticsService & Refinamentos (Sprint 9.1 / 9.1.1)', () => {
  let mockRepo: MockEducationalAnalyticsRepository;
  let service: EducationalAnalyticsService;

  const USER_A = 'user-uuid-1111';
  const USER_B = 'user-uuid-2222';

  beforeEach(() => {
    mockRepo = new MockEducationalAnalyticsRepository();
    service = new EducationalAnalyticsService({
      educationalAnalyticsRepository: mockRepo,
    });
  });

  describe('Cenário 1: Usuário sem histórico', () => {
    it('deve retornar zeros, arrays consistentes, INSUFFICIENT_DATA e suficiência negativa', async () => {
      const result = await service.getStudentAnalytics(USER_A);

      expect(result.globalStats.completedSimulationsCount).toBe(0);
      expect(result.globalStats.totalAnsweredQuestions).toBe(0);
      expect(result.globalStats.totalCorrectAnswers).toBe(0);
      expect(result.globalStats.totalWrongAnswers).toBe(0);
      expect(result.globalStats.globalAccuracyPercentage).toBe(0);
      expect(result.globalStats.officialTotalPoints).toBe(0);
      expect(result.globalStats.pedagogicalAnsweredQuestions).toBe(0);
      expect(result.globalStats.pedagogicalCorrectAnswers).toBe(0);
      expect(result.globalStats.pedagogicalAccuracyPercentage).toBe(0);
      expect(result.globalStats.averageSimulationScore).toBeNull();
      expect(result.globalStats.averageTimeSpentPerQuestionSeconds).toBeNull();
      expect(result.globalStats.totalDurationSeconds).toBe(0);

      expect(result.subjectPerformance).toEqual([]);
      expect(result.difficultyPerformance).toEqual([
        { difficulty: 'EASY', totalAnswered: 0, correctCount: 0, wrongCount: 0, accuracyPercentage: 0 },
        { difficulty: 'MEDIUM', totalAnswered: 0, correctCount: 0, wrongCount: 0, accuracyPercentage: 0 },
        { difficulty: 'HARD', totalAnswered: 0, correctCount: 0, wrongCount: 0, accuracyPercentage: 0 },
        { difficulty: 'UNSPECIFIED', totalAnswered: 0, correctCount: 0, wrongCount: 0, accuracyPercentage: 0 },
      ]);

      expect(result.temporalTrend.direction).toBe('INSUFFICIENT_DATA');
      expect(result.temporalTrend.recentAverageScore).toBeNull();
      expect(result.temporalTrend.historicalAverageScore).toBeNull();
      expect(result.temporalTrend.deltaPercentage).toBeNull();
      expect(result.temporalTrend.completedSimulationsEvaluated).toBe(0);

      expect(result.consistency.currentStreak).toBe(0);
      expect(result.consistency.longestStreak).toBe(0);
      expect(result.consistency.lastActivityDate).toBeNull();
      expect(result.consistency.completedSimulationsCount).toBe(0);
      expect(result.consistency.totalStudyActivitiesCount).toBe(0);

      expect(result.sampleSufficiency.hasMinQuestionsForDescriptiveStats).toBe(false);
      expect(result.sampleSufficiency.hasMinSimulationsForTrend).toBe(false);
      expect(result.sampleSufficiency.isSufficientForDeepAnalysis).toBe(false);
      expect(result.sampleSufficiency.insufficientDataReasons.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Cenário 2: Uma única questão respondida', () => {
    it('deve marcar hasMinQuestionsForDescriptiveStats como false', async () => {
      const simId = 'sim-single';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 100,
        correctCount: 1,
        wrongCount: 0,
        durationSeconds: 60,
        finishedAt: new Date('2026-03-01T10:00:00Z'),
      });

      mockRepo.questionAttempts.push({
        id: 'attempt-1',
        userId: USER_A,
        simulationId: simId,
        isCorrect: true,
        timeSpentSeconds: 60,
        answeredAt: new Date('2026-03-01T10:01:00Z'),
        question: {
          subject: 'Direito Constitucional',
          difficulty: 'MEDIUM',
          topic: 'Direitos Fundamentais',
        },
      });

      const result = await service.getStudentAnalytics(USER_A);

      expect(result.globalStats.totalAnsweredQuestions).toBe(1);
      expect(result.globalStats.totalCorrectAnswers).toBe(1);
      expect(result.sampleSufficiency.hasMinQuestionsForDescriptiveStats).toBe(false);
      expect(result.sampleSufficiency.insufficientDataReasons).toContain(
        'Necessário responder pelo menos 5 questões para gerar estatísticas descritivas (atualmente: 1).'
      );
    });
  });

  describe('Cenário 3: Cinco ou mais respostas', () => {
    it('deve atingir o limiar descritivo hasMinQuestionsForDescriptiveStats = true', async () => {
      const simId = 'sim-5q';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 80,
        correctCount: 4,
        wrongCount: 1,
        durationSeconds: 300,
        finishedAt: new Date('2026-03-01T10:00:00Z'),
      });

      for (let i = 1; i <= 5; i++) {
        mockRepo.questionAttempts.push({
          id: `attempt-${i}`,
          userId: USER_A,
          simulationId: simId,
          isCorrect: i <= 4,
          timeSpentSeconds: 60,
          answeredAt: new Date(),
          question: {
            subject: 'Direito Administrativo',
            difficulty: 'EASY',
            topic: 'Atos Administrativos',
          },
        });
      }

      const result = await service.getStudentAnalytics(USER_A);

      expect(result.globalStats.totalAnsweredQuestions).toBe(5);
      expect(result.sampleSufficiency.hasMinQuestionsForDescriptiveStats).toBe(true);
      expect(
        result.sampleSufficiency.insufficientDataReasons.some((r) =>
          r.includes('estatísticas descritivas')
        )
      ).toBe(false);
    });
  });

  describe('Cenário 4: Disciplinas com desempenhos contrastantes', () => {
    it('deve computar métricas individuais e flag isReliable por disciplina', async () => {
      const simId = 'sim-multi-subj';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 66.7,
        correctCount: 6,
        wrongCount: 3,
        durationSeconds: 500,
        finishedAt: new Date(),
      });

      // 6 questões de Direito Constitucional (5 acertos, 1 erro) => 83.3%, isReliable = true
      for (let i = 1; i <= 6; i++) {
        mockRepo.questionAttempts.push({
          id: `att-const-${i}`,
          userId: USER_A,
          simulationId: simId,
          isCorrect: i <= 5,
          timeSpentSeconds: 40,
          answeredAt: new Date(),
          question: {
            subject: 'Direito Constitucional',
            difficulty: 'MEDIUM',
            topic: 'Poder Legislativo',
          },
        });
      }

      // 3 questões de Informática (1 acerto, 2 erros) => 33.3%, isReliable = false (< 5 questões)
      for (let i = 1; i <= 3; i++) {
        mockRepo.questionAttempts.push({
          id: `att-info-${i}`,
          userId: USER_A,
          simulationId: simId,
          isCorrect: i === 1,
          timeSpentSeconds: 50,
          answeredAt: new Date(),
          question: {
            subject: 'Informática',
            difficulty: 'HARD',
            topic: 'Redes',
          },
        });
      }

      const result = await service.getStudentAnalytics(USER_A);

      const constSubj = result.subjectPerformance.find(
        (s) => s.subject === 'Direito Constitucional'
      );
      const infoSubj = result.subjectPerformance.find((s) => s.subject === 'Informática');

      expect(constSubj).toBeDefined();
      expect(constSubj?.totalAnswered).toBe(6);
      expect(constSubj?.correctCount).toBe(5);
      expect(constSubj?.wrongCount).toBe(1);
      expect(constSubj?.accuracyPercentage).toBe(83.3);
      expect(constSubj?.isReliable).toBe(true);

      expect(infoSubj).toBeDefined();
      expect(infoSubj?.totalAnswered).toBe(3);
      expect(infoSubj?.correctCount).toBe(1);
      expect(infoSubj?.wrongCount).toBe(2);
      expect(infoSubj?.accuracyPercentage).toBe(33.3);
      expect(infoSubj?.isReliable).toBe(false);
    });
  });

  describe('Cenário 5: Dificuldades EASY, MEDIUM, HARD e não especificada', () => {
    it('deve agrupar corretamente em EASY, MEDIUM, HARD e UNSPECIFIED', async () => {
      const simId = 'sim-diff';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 50,
        correctCount: 2,
        wrongCount: 2,
        durationSeconds: 200,
        finishedAt: new Date(),
      });

      mockRepo.questionAttempts.push(
        {
          id: 'q-easy',
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          timeSpentSeconds: 30,
          answeredAt: new Date(),
          question: { subject: 'Português', difficulty: 'EASY', topic: 'Sintaxe' },
        },
        {
          id: 'q-medium',
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          timeSpentSeconds: 40,
          answeredAt: new Date(),
          question: { subject: 'Português', difficulty: 'MEDIUM', topic: 'Morfologia' },
        },
        {
          id: 'q-hard',
          userId: USER_A,
          simulationId: simId,
          isCorrect: false,
          timeSpentSeconds: 80,
          answeredAt: new Date(),
          question: { subject: 'Português', difficulty: 'HARD', topic: 'Semântica' },
        },
        {
          id: 'q-unspecified',
          userId: USER_A,
          simulationId: simId,
          isCorrect: false,
          timeSpentSeconds: 50,
          answeredAt: new Date(),
          question: { subject: 'Português', difficulty: null, topic: null },
        }
      );

      const result = await service.getStudentAnalytics(USER_A);

      const easy = result.difficultyPerformance.find((d) => d.difficulty === 'EASY');
      const med = result.difficultyPerformance.find((d) => d.difficulty === 'MEDIUM');
      const hard = result.difficultyPerformance.find((d) => d.difficulty === 'HARD');
      const unspec = result.difficultyPerformance.find((d) => d.difficulty === 'UNSPECIFIED');

      expect(easy).toEqual({ difficulty: 'EASY', totalAnswered: 1, correctCount: 1, wrongCount: 0, accuracyPercentage: 100 });
      expect(med).toEqual({ difficulty: 'MEDIUM', totalAnswered: 1, correctCount: 1, wrongCount: 0, accuracyPercentage: 100 });
      expect(hard).toEqual({ difficulty: 'HARD', totalAnswered: 1, correctCount: 0, wrongCount: 1, accuracyPercentage: 0 });
      expect(unspec).toEqual({ difficulty: 'UNSPECIFIED', totalAnswered: 1, correctCount: 0, wrongCount: 1, accuracyPercentage: 0 });
    });
  });

  describe('Cenário 6: Precisão ponderada (nunca média de médias)', () => {
    it('deve calcular taxa ponderada real totalAcertos / totalQuestoes', async () => {
      mockRepo.simulations.push(
        {
          id: 'sim-1',
          userId: USER_A,
          status: 'COMPLETED',
          scorePercentage: 100,
          correctCount: 1,
          wrongCount: 0,
          durationSeconds: 60,
          finishedAt: new Date('2026-03-01T10:00:00Z'),
        },
        {
          id: 'sim-2',
          userId: USER_A,
          status: 'COMPLETED',
          scorePercentage: 0,
          correctCount: 0,
          wrongCount: 9,
          durationSeconds: 540,
          finishedAt: new Date('2026-03-02T10:00:00Z'),
        }
      );

      // Tentativas reais: 1 acerto no sim-1, 9 erros no sim-2
      mockRepo.questionAttempts.push({
        id: 'att-s1-1',
        userId: USER_A,
        simulationId: 'sim-1',
        isCorrect: true,
        timeSpentSeconds: 60,
        answeredAt: new Date(),
        question: { subject: 'Direito Penal', difficulty: 'EASY', topic: 'Crimes' },
      });

      for (let i = 1; i <= 9; i++) {
        mockRepo.questionAttempts.push({
          id: `att-s2-${i}`,
          userId: USER_A,
          simulationId: 'sim-2',
          isCorrect: false,
          timeSpentSeconds: 60,
          answeredAt: new Date(),
          question: { subject: 'Direito Penal', difficulty: 'HARD', topic: 'Crimes' },
        });
      }

      const result = await service.getStudentAnalytics(USER_A);

      expect(result.globalStats.totalCorrectAnswers).toBe(1);
      expect(result.globalStats.totalAnsweredQuestions).toBe(10);
      expect(result.globalStats.globalAccuracyPercentage).toBe(10.0);
      expect(result.globalStats.pedagogicalAccuracyPercentage).toBe(10.0);
      expect(result.globalStats.globalAccuracyPercentage).not.toBe(50.0);
    });
  });

  describe('Cenário 7: Proteção contra divisão por zero', () => {
    it('deve retornar 0 sem gerar NaN ou Infinity', () => {
      expect(calculateAccuracyPercentage(0, 0)).toBe(0);
      expect(calculateAccuracyPercentage(5, 0)).toBe(0);
      expect(calculateAccuracyPercentage(NaN, 10)).toBe(0);
      expect(calculateAccuracyPercentage(5, NaN)).toBe(0);
      expect(calculateAccuracyPercentage(-2, 10)).toBe(0);
    });
  });

  describe('Cenário 8: Notas e tempos nulos tratados com elegância', () => {
    it('deve ignorar tempos e scores nulos sem quebrar o cálculo', async () => {
      mockRepo.simulations.push({
        id: 'sim-nulls',
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: null,
        correctCount: null,
        wrongCount: null,
        durationSeconds: null,
        finishedAt: new Date(),
      });

      mockRepo.questionAttempts.push({
        id: 'att-null-time',
        userId: USER_A,
        simulationId: 'sim-nulls',
        isCorrect: true,
        timeSpentSeconds: null,
        answeredAt: null,
        question: { subject: null, difficulty: null, topic: null },
      });

      const result = await service.getStudentAnalytics(USER_A);

      expect(result.globalStats.averageSimulationScore).toBeNull();
      expect(result.globalStats.averageTimeSpentPerQuestionSeconds).toBeNull();
      expect(result.globalStats.totalDurationSeconds).toBe(0);
      expect(result.subjectPerformance[0]?.subject).toBe('Não classificada');
      expect(result.subjectPerformance[0]?.averageTimeSpentSeconds).toBeNull();
    });
  });

  describe('Cenário 9: Tendência crescente (IMPROVING: delta > +3%)', () => {
    it('deve identificar tendência IMPROVING quando a janela recente superar a anterior', async () => {
      mockRepo.simulations.push(
        {
          id: 'sim-t1',
          userId: USER_A,
          status: 'COMPLETED',
          scorePercentage: 60,
          correctCount: 6,
          wrongCount: 4,
          durationSeconds: 600,
          finishedAt: new Date('2026-03-01T10:00:00Z'),
        },
        {
          id: 'sim-t2',
          userId: USER_A,
          status: 'COMPLETED',
          scorePercentage: 70,
          correctCount: 7,
          wrongCount: 3,
          durationSeconds: 600,
          finishedAt: new Date('2026-03-02T10:00:00Z'),
        },
        {
          id: 'sim-t3',
          userId: USER_A,
          status: 'COMPLETED',
          scorePercentage: 85,
          correctCount: 8,
          wrongCount: 2,
          durationSeconds: 600,
          finishedAt: new Date('2026-03-03T10:00:00Z'),
        }
      );

      const result = await service.getStudentAnalytics(USER_A);

      expect(result.temporalTrend.direction).toBe('IMPROVING');
      expect(result.temporalTrend.recentAverageScore).toBe(85.0);
      expect(result.temporalTrend.historicalAverageScore).toBe(65.0);
      expect(result.temporalTrend.deltaPercentage).toBe(20.0);
    });
  });

  describe('Cenário 10: Tendência decrescente (DECLINING: delta < -3%)', () => {
    it('deve identificar tendência DECLINING quando a janela recente cair além do limiar', async () => {
      mockRepo.simulations.push(
        {
          id: 'sim-d1',
          userId: USER_A,
          status: 'COMPLETED',
          scorePercentage: 90,
          correctCount: 9,
          wrongCount: 1,
          durationSeconds: 600,
          finishedAt: new Date('2026-03-01T10:00:00Z'),
        },
        {
          id: 'sim-d2',
          userId: USER_A,
          status: 'COMPLETED',
          scorePercentage: 80,
          correctCount: 8,
          wrongCount: 2,
          durationSeconds: 600,
          finishedAt: new Date('2026-03-02T10:00:00Z'),
        },
        {
          id: 'sim-d3',
          userId: USER_A,
          status: 'COMPLETED',
          scorePercentage: 65,
          correctCount: 6,
          wrongCount: 4,
          durationSeconds: 600,
          finishedAt: new Date('2026-03-03T10:00:00Z'),
        }
      );

      const result = await service.getStudentAnalytics(USER_A);

      expect(result.temporalTrend.direction).toBe('DECLINING');
      expect(result.temporalTrend.recentAverageScore).toBe(65.0);
      expect(result.temporalTrend.historicalAverageScore).toBe(85.0);
      expect(result.temporalTrend.deltaPercentage).toBe(-20.0);
    });
  });

  describe('Cenário 11: Tendência estável (STABLE: delta entre -3% e +3%)', () => {
    it('deve classificar como STABLE variações contidas no limiar', async () => {
      mockRepo.simulations.push(
        {
          id: 'sim-s1',
          userId: USER_A,
          status: 'COMPLETED',
          scorePercentage: 70,
          correctCount: 7,
          wrongCount: 3,
          durationSeconds: 600,
          finishedAt: new Date('2026-03-01T10:00:00Z'),
        },
        {
          id: 'sim-s2',
          userId: USER_A,
          status: 'COMPLETED',
          scorePercentage: 72,
          correctCount: 7,
          wrongCount: 3,
          durationSeconds: 600,
          finishedAt: new Date('2026-03-02T10:00:00Z'),
        }
      );

      const result = await service.getStudentAnalytics(USER_A);

      expect(result.temporalTrend.direction).toBe('STABLE');
      expect(result.temporalTrend.deltaPercentage).toBe(2.0);
    });
  });

  describe('Cenário 12: Dados insuficientes para tendência (< 2 simulados)', () => {
    it('deve retornar INSUFFICIENT_DATA quando houver menos de 2 simulados concluídos', () => {
      const trend0 = determineTemporalTrend([]);
      expect(trend0.direction).toBe('INSUFFICIENT_DATA');
      expect(trend0.completedSimulationsEvaluated).toBe(0);

      const trend1 = determineTemporalTrend([{ scorePercentage: 80, finishedAt: new Date() }]);
      expect(trend1.direction).toBe('INSUFFICIENT_DATA');
      expect(trend1.recentAverageScore).toBe(80.0);
      expect(trend1.historicalAverageScore).toBeNull();
      expect(trend1.deltaPercentage).toBeNull();
      expect(trend1.completedSimulationsEvaluated).toBe(1);
    });
  });

  describe('Cenário 13: Simulados não concluídos ignorados na tendência oficial', () => {
    it('não deve permitir que simulados em andamento ou abandonados afetem métricas', async () => {
      mockRepo.simulations.push(
        {
          id: 'sim-completed-1',
          userId: USER_A,
          status: 'COMPLETED',
          scorePercentage: 80,
          correctCount: 8,
          wrongCount: 2,
          durationSeconds: 500,
          finishedAt: new Date('2026-03-01T10:00:00Z'),
        },
        {
          id: 'sim-in-progress',
          userId: USER_A,
          status: 'IN_PROGRESS',
          scorePercentage: 10,
          correctCount: 1,
          wrongCount: 9,
          durationSeconds: 100,
          finishedAt: null,
        },
        {
          id: 'sim-abandoned',
          userId: USER_A,
          status: 'ABANDONED',
          scorePercentage: 0,
          correctCount: 0,
          wrongCount: 10,
          durationSeconds: 50,
          finishedAt: null,
        }
      );

      mockRepo.questionAttempts.push({
        id: 'att-in-prog',
        userId: USER_A,
        simulationId: 'sim-in-progress',
        isCorrect: false,
        timeSpentSeconds: 10,
        answeredAt: new Date(),
        question: { subject: 'Direito Penal', difficulty: 'EASY', topic: 'Crimes' },
      });

      const result = await service.getStudentAnalytics(USER_A);

      expect(result.globalStats.completedSimulationsCount).toBe(1);
      expect(result.temporalTrend.direction).toBe('INSUFFICIENT_DATA');
      expect(result.subjectPerformance.find((s) => s.subject === 'Direito Penal')).toBeUndefined();
    });
  });

  describe('Cenário 14: Tentativas repetidas e integridade de contagem', () => {
    it('deve agregar todas as tentativas de questões de simulados concluídos', async () => {
      const sim1 = 'sim-rep-1';
      const sim2 = 'sim-rep-2';

      mockRepo.simulations.push(
        {
          id: sim1,
          userId: USER_A,
          status: 'COMPLETED',
          scorePercentage: 50,
          correctCount: 1,
          wrongCount: 1,
          durationSeconds: 100,
          finishedAt: new Date('2026-03-01T10:00:00Z'),
        },
        {
          id: sim2,
          userId: USER_A,
          status: 'COMPLETED',
          scorePercentage: 100,
          correctCount: 2,
          wrongCount: 0,
          durationSeconds: 120,
          finishedAt: new Date('2026-03-02T10:00:00Z'),
        }
      );

      mockRepo.questionAttempts.push(
        {
          id: 'att-1',
          userId: USER_A,
          simulationId: sim1,
          isCorrect: true,
          timeSpentSeconds: 40,
          answeredAt: new Date(),
          question: { subject: 'Matemática', difficulty: 'EASY', topic: 'Álgebra' },
        },
        {
          id: 'att-2',
          userId: USER_A,
          simulationId: sim1,
          isCorrect: false,
          timeSpentSeconds: 60,
          answeredAt: new Date(),
          question: { subject: 'Matemática', difficulty: 'MEDIUM', topic: 'Álgebra' },
        },
        {
          id: 'att-3',
          userId: USER_A,
          simulationId: sim2,
          isCorrect: true,
          timeSpentSeconds: 50,
          answeredAt: new Date(),
          question: { subject: 'Matemática', difficulty: 'EASY', topic: 'Álgebra' },
        },
        {
          id: 'att-4',
          userId: USER_A,
          simulationId: sim2,
          isCorrect: true,
          timeSpentSeconds: 70,
          answeredAt: new Date(),
          question: { subject: 'Matemática', difficulty: 'EASY', topic: 'Álgebra' },
        }
      );

      const result = await service.getStudentAnalytics(USER_A);

      const math = result.subjectPerformance.find((s) => s.subject === 'Matemática');
      expect(math?.totalAnswered).toBe(4);
      expect(math?.correctCount).toBe(3);
      expect(math?.wrongCount).toBe(1);
      expect(math?.accuracyPercentage).toBe(75.0);
      expect(math?.averageTimeSpentSeconds).toBe(55);
    });
  });

  describe('Cenário 15: Isolamento estrito entre usuários (multi-tenant)', () => {
    it('não deve vazar dados de usuário B para as estatísticas de usuário A', async () => {
      mockRepo.simulations.push(
        {
          id: 'sim-user-a',
          userId: USER_A,
          status: 'COMPLETED',
          scorePercentage: 90,
          correctCount: 9,
          wrongCount: 1,
          durationSeconds: 400,
          finishedAt: new Date('2026-03-01T10:00:00Z'),
        },
        {
          id: 'sim-user-b',
          userId: USER_B,
          status: 'COMPLETED',
          scorePercentage: 30,
          correctCount: 3,
          wrongCount: 7,
          durationSeconds: 200,
          finishedAt: new Date('2026-03-01T10:00:00Z'),
        }
      );

      mockRepo.streaks.push(
        { userId: USER_A, currentStreak: 5, longestStreak: 10, lastActivityDate: '2026-03-01' },
        { userId: USER_B, currentStreak: 1, longestStreak: 1, lastActivityDate: '2026-02-15' }
      );

      mockRepo.studyActivitiesCount.set(USER_A, 12);
      mockRepo.studyActivitiesCount.set(USER_B, 2);

      const statsA = await service.getStudentAnalytics(USER_A);
      const statsB = await service.getStudentAnalytics(USER_B);

      expect(statsA.globalStats.completedSimulationsCount).toBe(1);
      expect(statsA.globalStats.officialTotalPoints).toBe(9);
      expect(statsA.consistency.currentStreak).toBe(5);
      expect(statsA.consistency.totalStudyActivitiesCount).toBe(12);

      expect(statsB.globalStats.completedSimulationsCount).toBe(1);
      expect(statsB.globalStats.officialTotalPoints).toBe(3);
      expect(statsB.consistency.currentStreak).toBe(1);
      expect(statsB.consistency.totalStudyActivitiesCount).toBe(2);
    });
  });

  describe('Cenário 16: Garantia de somente leitura e ausência de mutações', () => {
    it('não deve invocar nenhuma operação de escrita no repositório', async () => {
      mockRepo.writeCallCount = 0;

      await service.getStudentAnalytics(USER_A);

      expect(mockRepo.writeCallCount).toBe(0);
    });
  });

  describe('Cenário 17: Garantia de ausência de PII no contrato', () => {
    it('não deve conter nome, email, senha, token ou identificadores confidenciais no DTO', async () => {
      const result = await service.getStudentAnalytics(USER_A);

      const keys = Object.keys(result);
      expect(keys).not.toContain('userId');
      expect(keys).not.toContain('name');
      expect(keys).not.toContain('email');
      expect(keys).not.toContain('password');
      expect(keys).not.toContain('token');

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(USER_A);
    });
  });

  describe('Cenário 18: Validação estrita de identificador de usuário', () => {
    it('deve rejeitar identificador nulo, indefinido ou vazio', async () => {
      await expect(service.getStudentAnalytics('')).rejects.toThrow(
        EducationalAnalyticsDomainError
      );
      await expect(service.getStudentAnalytics('   ')).rejects.toThrow(
        EducationalAnalyticsDomainError
      );
      // @ts-expect-error teste com valor inválido
      await expect(service.getStudentAnalytics(null)).rejects.toThrow(
        EducationalAnalyticsDomainError
      );
    });
  });

  // =========================================================================
  // REFINAMENTOS ESPECÍFICOS DA SPRINT 9.1.1 (ACH-01, ACH-02, ACH-03, ACH-04)
  // =========================================================================

  describe('ACH-01: Escalabilidade e Processamento em Lotes Sem Truncamento', () => {
    it('deve processar histórico volumoso (>2.000 tentativas) sem truncamento silencioso', async () => {
      const simId = 'sim-big-history';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 75.0,
        correctCount: 1500,
        wrongCount: 500,
        durationSeconds: 7200,
        finishedAt: new Date(),
      });

      // Cria 2.500 tentativas distribuídas entre lotes
      const TOTAL_ATTEMPTS = 2500;
      for (let i = 1; i <= TOTAL_ATTEMPTS; i++) {
        mockRepo.questionAttempts.push({
          id: `att-volume-${String(i).padStart(5, '0')}`,
          userId: USER_A,
          simulationId: simId,
          isCorrect: i <= 1500,
          timeSpentSeconds: 30,
          answeredAt: new Date(),
          question: {
            subject: 'Língua Portuguesa',
            difficulty: i % 2 === 0 ? 'MEDIUM' : 'HARD',
            topic: 'Interpretação de Texto',
          },
        });
      }

      const result = await service.getStudentAnalytics(USER_A);

      expect(result.globalStats.pedagogicalAnsweredQuestions).toBe(TOTAL_ATTEMPTS);
      expect(result.globalStats.pedagogicalCorrectAnswers).toBe(1500);
      expect(result.globalStats.pedagogicalWrongAnswers).toBe(1000);
      expect(result.globalStats.pedagogicalAccuracyPercentage).toBe(60.0);

      const pt = result.subjectPerformance.find((s) => s.subject === 'Língua Portuguesa');
      expect(pt).toBeDefined();
      expect(pt?.totalAnswered).toBe(TOTAL_ATTEMPTS);
      expect(pt?.correctCount).toBe(1500);
      expect(pt?.wrongCount).toBe(1000);
      expect(pt?.accuracyPercentage).toBe(60.0);
    });

    it('processQuestionAttemptsInBatches deve invocar o callback para todos os lotes paginados', async () => {
      const simId = 'sim-chunks';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 100,
        correctCount: 25,
        wrongCount: 0,
        durationSeconds: 1000,
        finishedAt: new Date(),
      });

      for (let i = 1; i <= 25; i++) {
        mockRepo.questionAttempts.push({
          id: `chunk-item-${i}`,
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          timeSpentSeconds: 20,
          answeredAt: new Date(),
          question: { subject: 'Física', difficulty: 'MEDIUM', topic: 'Cinemática' },
        });
      }

      let batchesReceived = 0;
      let itemsAccumulated = 0;

      const total = await mockRepo.processQuestionAttemptsInBatches(
        USER_A,
        (batch) => {
          batchesReceived += 1;
          itemsAccumulated += batch.length;
        },
        10 // Lotes de 10
      );

      expect(total).toBe(25);
      expect(batchesReceived).toBe(3); // 10 + 10 + 5
      expect(itemsAccumulated).toBe(25);
    });
  });

  describe('ACH-02: Separação Formal entre Pontuação Oficial e Desempenho Pedagógico', () => {
    it('deve distinguir questão anulada NÃO respondida (ganha ponto oficial no exame, mas não ganha acerto pedagógico)', async () => {
      const simId = 'sim-annulled-unanswered';
      // Simulado com 10 questões no exame oficial:
      // O estudante acertou 6, errou 3, e 1 foi anulada sem resposta do estudante.
      // Regra oficial de concurso: a questão anulada confere ponto oficial ao candidato -> correctCount = 7.
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 70.0,
        correctCount: 7, // Pontuação oficial com bônus de anulação
        wrongCount: 3,
        durationSeconds: 1800,
        finishedAt: new Date(),
      });

      // Tentativas no banco: 6 acertos e 3 erros. A anulada não foi respondida (isCorrect === null)
      for (let i = 1; i <= 6; i++) {
        mockRepo.questionAttempts.push({
          id: `att-merit-${i}`,
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          timeSpentSeconds: 40,
          answeredAt: new Date(),
          question: { subject: 'Direito Administrativo', difficulty: 'MEDIUM', topic: 'Atos' },
        });
      }

      for (let i = 1; i <= 3; i++) {
        mockRepo.questionAttempts.push({
          id: `att-error-${i}`,
          userId: USER_A,
          simulationId: simId,
          isCorrect: false,
          timeSpentSeconds: 50,
          answeredAt: new Date(),
          question: { subject: 'Direito Administrativo', difficulty: 'MEDIUM', topic: 'Atos' },
        });
      }

      // Tentativa em branco na questão anulada
      mockRepo.questionAttempts.push({
        id: 'att-annulled-blank',
        userId: USER_A,
        simulationId: simId,
        isCorrect: null, // Deixada em branco
        timeSpentSeconds: 10,
        answeredAt: new Date(),
        question: { subject: 'Direito Administrativo', difficulty: 'HARD', topic: 'Atos' },
      });

      const result = await service.getStudentAnalytics(USER_A);

      // Pontuação oficial do exame reflete os 7 pontos concedidos pelo concurso
      expect(result.globalStats.officialTotalPoints).toBe(7);
      expect(result.globalStats.averageSimulationScore).toBe(70.0);

      // Desempenho pedagógico reflete estritamente as 9 questões com mérito demonstrado
      expect(result.globalStats.pedagogicalAnsweredQuestions).toBe(9);
      expect(result.globalStats.pedagogicalCorrectAnswers).toBe(6);
      expect(result.globalStats.pedagogicalWrongAnswers).toBe(3);
      expect(result.globalStats.pedagogicalAccuracyPercentage).toBe(66.7); // 6/9 * 100 = 66.7% (não 70%)

      // Disciplina reflete 6 acertos em 9 respondidas
      const adm = result.subjectPerformance.find((s) => s.subject === 'Direito Administrativo');
      expect(adm?.totalAnswered).toBe(9);
      expect(adm?.correctCount).toBe(6);
      expect(adm?.accuracyPercentage).toBe(66.7);
    });

    it('deve preservar ponto oficial mas neutralizar acerto pedagógico quando questão anulada foi respondida (Sprint 9.5.1)', async () => {
      const simId = 'sim-annulled-answered';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 100.0,
        correctCount: 2,
        wrongCount: 0,
        durationSeconds: 120,
        finishedAt: new Date(),
      });

      mockRepo.simulationQuestions.push(
        { simulationId: simId, questionId: 'q-regular', isAnnulledSnapshot: false },
        { simulationId: simId, questionId: 'q-annulled', isAnnulledSnapshot: true }
      );

      mockRepo.questionAttempts.push(
        {
          id: 'att-regular',
          userId: USER_A,
          simulationId: simId,
          questionId: 'q-regular',
          isCorrect: true,
          timeSpentSeconds: 40,
          answeredAt: new Date(),
          question: { subject: 'Ética Pública', difficulty: 'EASY', topic: 'Princípios' },
        },
        {
          id: 'att-annulled-active',
          userId: USER_A,
          simulationId: simId,
          questionId: 'q-annulled',
          isCorrect: true, // Questão anulada respondida pelo estudante (bonificada no exame)
          isAnnulled: true,
          timeSpentSeconds: 30,
          answeredAt: new Date(),
          question: { subject: 'Ética Pública', difficulty: 'EASY', topic: 'Deveres' },
        }
      );

      const result = await service.getStudentAnalytics(USER_A);

      // Pontuação oficial do exame continua sendo 2 (1 mérito + 1 anulada)
      expect(result.globalStats.officialTotalPoints).toBe(2);
      expect(result.globalStats.averageSimulationScore).toBe(100.0);

      // Desempenho pedagógico computa estritamente a questão regular de mérito demonstrado (1 acerto em 1 respondida)
      expect(result.globalStats.pedagogicalAnsweredQuestions).toBe(1);
      expect(result.globalStats.pedagogicalCorrectAnswers).toBe(1);
      expect(result.globalStats.pedagogicalAccuracyPercentage).toBe(100.0);
    });
  });

  describe('ACH-03: Defesa em Profundidade no Repositório Prisma', () => {
    it('deve enviar filtro userId na raiz e na relação simulation { status: "COMPLETED", userId }', async () => {
      // Teste do objeto de consulta Prisma real usando mock de PrismaClient
      const mockFindMany = vi.fn().mockResolvedValue([]);
      const fakePrismaClient = {
        questionAttempt: {
          findMany: mockFindMany,
        },
      };

      // @ts-expect-error simulação de PrismaClient para teste de query
      const repo = new PrismaEducationalAnalyticsRepository(fakePrismaClient);

      await repo.processQuestionAttemptsInBatches(USER_A, () => {}, 500);

      expect(mockFindMany).toHaveBeenCalledTimes(1);
      const callArgs = mockFindMany.mock.calls[0][0];

      // Verifica filtro de raiz
      expect(callArgs.where.userId).toBe(USER_A);

      // ACH-03: Verifica defesa em profundidade na relação simulation
      expect(callArgs.where.simulation).toEqual({
        status: 'COMPLETED',
        userId: USER_A,
      });

      // Verifica ordenação estável para cursor
      expect(callArgs.orderBy).toEqual({ id: 'asc' });
      expect(callArgs.take).toBe(500);
    });
  });

  describe('ACH-04: Normalização Canônica e Determinística de Disciplinas', () => {
    it('deve unificar variações de capitalização da mesma disciplina', async () => {
      const simId = 'sim-cases';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 75.0,
        correctCount: 3,
        wrongCount: 1,
        durationSeconds: 240,
        finishedAt: new Date(),
      });

      mockRepo.questionAttempts.push(
        {
          id: 'case-1',
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          timeSpentSeconds: 40,
          answeredAt: new Date(),
          question: { subject: 'Direito Constitucional', difficulty: 'EASY', topic: 'CF' },
        },
        {
          id: 'case-2',
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          timeSpentSeconds: 40,
          answeredAt: new Date(),
          question: { subject: 'direito constitucional', difficulty: 'EASY', topic: 'CF' },
        },
        {
          id: 'case-3',
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          timeSpentSeconds: 40,
          answeredAt: new Date(),
          question: { subject: 'DIREITO CONSTITUCIONAL', difficulty: 'EASY', topic: 'CF' },
        },
        {
          id: 'case-4',
          userId: USER_A,
          simulationId: simId,
          isCorrect: false,
          timeSpentSeconds: 40,
          answeredAt: new Date(),
          question: { subject: 'Direito constitucional', difficulty: 'EASY', topic: 'CF' },
        }
      );

      const result = await service.getStudentAnalytics(USER_A);

      // Deve existir EXATAMENTE 1 disciplina agrupada
      expect(result.subjectPerformance).toHaveLength(1);
      const unified = result.subjectPerformance[0];
      expect(unified.subject).toBe('Direito Constitucional');
      expect(unified.totalAnswered).toBe(4);
      expect(unified.correctCount).toBe(3);
      expect(unified.wrongCount).toBe(1);
      expect(unified.accuracyPercentage).toBe(75.0);
    });

    it('deve normalizar espaços excedentes sem alterar o sentido', async () => {
      const simId = 'sim-spaces';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 100.0,
        correctCount: 2,
        wrongCount: 0,
        durationSeconds: 100,
        finishedAt: new Date(),
      });

      mockRepo.questionAttempts.push(
        {
          id: 'sp-1',
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          timeSpentSeconds: 30,
          answeredAt: new Date(),
          question: { subject: '   Direito   Administrativo  ', difficulty: 'EASY', topic: null },
        },
        {
          id: 'sp-2',
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          timeSpentSeconds: 30,
          answeredAt: new Date(),
          question: { subject: 'Direito Administrativo', difficulty: 'EASY', topic: null },
        }
      );

      const result = await service.getStudentAnalytics(USER_A);

      expect(result.subjectPerformance).toHaveLength(1);
      expect(result.subjectPerformance[0].subject).toBe('Direito Administrativo');
      expect(result.subjectPerformance[0].totalAnswered).toBe(2);
    });

    it('deve preservar acentos ortográficos e manter disciplinas distintas separadas', async () => {
      const simId = 'sim-distinct';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 100.0,
        correctCount: 2,
        wrongCount: 0,
        durationSeconds: 120,
        finishedAt: new Date(),
      });

      mockRepo.questionAttempts.push(
        {
          id: 'd-1',
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          timeSpentSeconds: 40,
          answeredAt: new Date(),
          question: { subject: 'Direito Penal', difficulty: 'EASY', topic: null },
        },
        {
          id: 'd-2',
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          timeSpentSeconds: 50,
          answeredAt: new Date(),
          question: { subject: 'Direito Processual Penal', difficulty: 'EASY', topic: null },
        }
      );

      const result = await service.getStudentAnalytics(USER_A);

      expect(result.subjectPerformance).toHaveLength(2);
      const subjects = result.subjectPerformance.map((s) => s.subject);
      expect(subjects).toContain('Direito Penal');
      expect(subjects).toContain('Direito Processual Penal');
    });

    it('função pura normalizeSubjectKey deve formatar conectivos em minúsculas e preservar Não classificada', () => {
      expect(normalizeSubjectKey(null)).toEqual({
        normalizedKey: 'nao_classificada',
        displayLabel: 'Não classificada',
      });
      expect(normalizeSubjectKey('   ')).toEqual({
        normalizedKey: 'nao_classificada',
        displayLabel: 'Não classificada',
      });
      expect(normalizeSubjectKey('LÍNGUA PORTUGUESA')).toEqual({
        normalizedKey: 'língua portuguesa',
        displayLabel: 'Língua Portuguesa',
      });
      expect(normalizeSubjectKey('direito processual civil e do trabalho')).toEqual({
        normalizedKey: 'direito processual civil e do trabalho',
        displayLabel: 'Direito Processual Civil e do Trabalho',
      });
    });
  });

  describe('Sprint 9.5: Consolidação da Precisão Pedagógica de Questões Anuladas', () => {
    it('deve garantir que bônus oficiais de questões anuladas não respondidas não inflacionem a acurácia pedagógica nem os percentuais por disciplina', async () => {
      const simId = 'sim-consolidation-9-5';
      // Simulado de 5 questões: 2 acertos mérito, 2 erros, 1 questão anulada não respondida
      // Pontuação oficial de concurso: 2 acertos + 1 anulada = 3 pontos em 5 questões (60%)
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 60.0,
        correctCount: 3,
        wrongCount: 2,
        durationSeconds: 600,
        finishedAt: new Date('2026-03-10T12:00:00Z'),
      });

      // 2 acertos demonstrados em Direito Civil
      mockRepo.questionAttempts.push(
        {
          id: 'att-civil-1',
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          timeSpentSeconds: 60,
          answeredAt: new Date(),
          question: { subject: 'Direito Civil', difficulty: 'EASY', topic: 'Contratos' },
        },
        {
          id: 'att-civil-2',
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          timeSpentSeconds: 60,
          answeredAt: new Date(),
          question: { subject: 'Direito Civil', difficulty: 'EASY', topic: 'Contratos' },
        }
      );

      // 2 erros em Direito Civil
      mockRepo.questionAttempts.push(
        {
          id: 'att-civil-3',
          userId: USER_A,
          simulationId: simId,
          isCorrect: false,
          timeSpentSeconds: 60,
          answeredAt: new Date(),
          question: { subject: 'Direito Civil', difficulty: 'MEDIUM', topic: 'Contratos' },
        },
        {
          id: 'att-civil-4',
          userId: USER_A,
          simulationId: simId,
          isCorrect: false,
          timeSpentSeconds: 60,
          answeredAt: new Date(),
          question: { subject: 'Direito Civil', difficulty: 'MEDIUM', topic: 'Contratos' },
        }
      );

      // 1 tentativa não respondida (em branco) na questão anulada
      mockRepo.questionAttempts.push({
        id: 'att-civil-annulled-unanswered',
        userId: USER_A,
        simulationId: simId,
        isCorrect: null, // Sem resposta ativa
        timeSpentSeconds: 15,
        answeredAt: new Date(),
        question: { subject: 'Direito Civil', difficulty: 'HARD', topic: 'Contratos' },
      });

      const stats = await service.getStudentAnalytics(USER_A);

      // 1. Pontuação oficial do concurso preservada
      expect(stats.globalStats.officialTotalPoints).toBe(3);
      expect(stats.globalStats.averageSimulationScore).toBe(60.0);

      // 2. Métrica pedagógica demonstrada estritamente apurada (2 acertos em 4 respondidas = 50.0%)
      expect(stats.globalStats.pedagogicalAnsweredQuestions).toBe(4);
      expect(stats.globalStats.pedagogicalCorrectAnswers).toBe(2);
      expect(stats.globalStats.pedagogicalWrongAnswers).toBe(2);
      expect(stats.globalStats.pedagogicalAccuracyPercentage).toBe(50.0);

      // 3. Disciplina Direito Civil reflete rigorosamente 50.0% (não 60.0%)
      const civil = stats.subjectPerformance.find((s) => s.subject === 'Direito Civil');
      expect(civil).toBeDefined();
      expect(civil?.totalAnswered).toBe(4);
      expect(civil?.correctCount).toBe(2);
      expect(civil?.wrongCount).toBe(2);
      expect(civil?.accuracyPercentage).toBe(50.0);
    });

    it('deve neutralizar questão anulada respondida que recebeu isCorrect=true, impedindo que ela compute como acerto pedagógico', async () => {
      const simId = 'sim-annulled-answered-neutralized';
      // Simulado de 4 questões: 1 regular correta, 1 regular incorreta, 1 anulada respondida, 1 anulada em branco
      // Pontuação oficial de exame: 1 correta + 2 anuladas (ambas pontuam no exame) = 3 pontos em 4 questões (75.0%)
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 75.0,
        correctCount: 3,
        wrongCount: 1,
        durationSeconds: 400,
        finishedAt: new Date(),
      });

      mockRepo.simulationQuestions.push(
        { simulationId: simId, questionId: 'q-reg-ok', isAnnulledSnapshot: false },
        { simulationId: simId, questionId: 'q-reg-fail', isAnnulledSnapshot: false },
        { simulationId: simId, questionId: 'q-ann-answered', isAnnulledSnapshot: true },
        { simulationId: simId, questionId: 'q-ann-blank', isAnnulledSnapshot: true }
      );

      mockRepo.questionAttempts.push(
        {
          id: 'att-1',
          userId: USER_A,
          simulationId: simId,
          questionId: 'q-reg-ok',
          isCorrect: true,
          timeSpentSeconds: 30,
          answeredAt: new Date(),
          question: { subject: 'Direito Penal', difficulty: 'MEDIUM', topic: 'Crimes' },
        },
        {
          id: 'att-2',
          userId: USER_A,
          simulationId: simId,
          questionId: 'q-reg-fail',
          isCorrect: false,
          timeSpentSeconds: 45,
          answeredAt: new Date(),
          question: { subject: 'Direito Penal', difficulty: 'HARD', topic: 'Penas' },
        },
        {
          id: 'att-3',
          userId: USER_A,
          simulationId: simId,
          questionId: 'q-ann-answered',
          isCorrect: true, // No SimulationService recebeu true por bonificação
          isAnnulled: true,
          timeSpentSeconds: 50,
          answeredAt: new Date(),
          question: { subject: 'Direito Penal', difficulty: 'EASY', topic: 'Teoria do Crime' },
        },
        {
          id: 'att-4',
          userId: USER_A,
          simulationId: simId,
          questionId: 'q-ann-blank',
          isCorrect: null, // Em branco
          isAnnulled: true,
          timeSpentSeconds: 10,
          answeredAt: new Date(),
          question: { subject: 'Direito Penal', difficulty: 'HARD', topic: 'Concurso de Pessoas' },
        }
      );

      const stats = await service.getStudentAnalytics(USER_A);

      // 1. Pontuação oficial preservada
      expect(stats.globalStats.officialTotalPoints).toBe(3);
      expect(stats.globalStats.averageSimulationScore).toBe(75.0);

      // 2. Métrica pedagógica estrita: apenas 2 questões regulares computam (1 acerto e 1 erro = 50.0%)
      expect(stats.globalStats.pedagogicalAnsweredQuestions).toBe(2);
      expect(stats.globalStats.pedagogicalCorrectAnswers).toBe(1);
      expect(stats.globalStats.pedagogicalWrongAnswers).toBe(1);
      expect(stats.globalStats.pedagogicalAccuracyPercentage).toBe(50.0);

      // 3. Disciplina Direito Penal reflete exatamente 50.0% (1/2), e não 66.7% ou 75%
      const penal = stats.subjectPerformance.find((s) => s.subject === 'Direito Penal');
      expect(penal).toBeDefined();
      expect(penal?.totalAnswered).toBe(2);
      expect(penal?.correctCount).toBe(1);
      expect(penal?.accuracyPercentage).toBe(50.0);
    });

    it('deve lidar corretamente com disciplina contendo exclusivamente questões anuladas sem gerar NaN ou divisão por zero', async () => {
      const simId = 'sim-only-annulled';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 100.0,
        correctCount: 2,
        wrongCount: 0,
        durationSeconds: 150,
        finishedAt: new Date(),
      });

      mockRepo.simulationQuestions.push(
        { simulationId: simId, questionId: 'q-only-ann-1', isAnnulledSnapshot: true },
        { simulationId: simId, questionId: 'q-only-ann-2', isAnnulledSnapshot: true }
      );

      mockRepo.questionAttempts.push(
        {
          id: 'att-ann-1',
          userId: USER_A,
          simulationId: simId,
          questionId: 'q-only-ann-1',
          isCorrect: true,
          isAnnulled: true,
          timeSpentSeconds: 30,
          answeredAt: new Date(),
          question: { subject: 'Direitos Humanos', difficulty: 'MEDIUM', topic: 'Tratados' },
        },
        {
          id: 'att-ann-2',
          userId: USER_A,
          simulationId: simId,
          questionId: 'q-only-ann-2',
          isCorrect: true,
          isAnnulled: true,
          timeSpentSeconds: 30,
          answeredAt: new Date(),
          question: { subject: 'Direitos Humanos', difficulty: 'HARD', topic: 'Convenções' },
        }
      );

      const stats = await service.getStudentAnalytics(USER_A);

      // Pontuação oficial: 2 pontos
      expect(stats.globalStats.officialTotalPoints).toBe(2);
      expect(stats.globalStats.averageSimulationScore).toBe(100.0);

      // Métrica pedagógica: 0 questões regulares respondidas
      expect(stats.globalStats.pedagogicalAnsweredQuestions).toBe(0);
      expect(stats.globalStats.pedagogicalCorrectAnswers).toBe(0);
      expect(stats.globalStats.pedagogicalAccuracyPercentage).toBe(0);

      // Disciplina Direitos Humanos não deve existir em subjectPerformance (0 respondidas pedagogicamente)
      const dh = stats.subjectPerformance.find((s) => s.subject === 'Direitos Humanos');
      expect(dh).toBeUndefined();
    });

    it('deve processar tentativas quando a informação de anulação for desconhecida sem quebrar a execução', async () => {
      const simId = 'sim-unknown-annulled';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 100.0,
        correctCount: 1,
        wrongCount: 0,
        durationSeconds: 100,
        finishedAt: new Date(),
      });

      // SimulationQuestion correspondente não existe no banco (inconsistência histórica / órfã)
      mockRepo.questionAttempts.push({
        id: 'att-orphan',
        userId: USER_A,
        simulationId: simId,
        questionId: 'q-orphan',
        isCorrect: true,
        // isAnnulled omitido / não encontrado -> tratado como false por fallback seguro
        timeSpentSeconds: 40,
        answeredAt: new Date(),
        question: { subject: 'Informática', difficulty: 'EASY', topic: 'Sistemas Operacionais' },
      });

      const stats = await service.getStudentAnalytics(USER_A);

      expect(stats.globalStats.pedagogicalAnsweredQuestions).toBe(1);
      expect(stats.globalStats.pedagogicalCorrectAnswers).toBe(1);
      expect(stats.globalStats.pedagogicalAccuracyPercentage).toBe(100.0);
    });
  });
});
