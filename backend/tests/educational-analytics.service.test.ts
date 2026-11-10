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
  type QuestionAttemptWithMetadata,
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

      mockRepo.simulationQuestions.push({
        simulationId: simId,
        questionId: 'attempt-1',
        isAnnulledSnapshot: false,
      });

      mockRepo.questionAttempts.push({
        id: 'attempt-1',
        userId: USER_A,
        simulationId: simId,
        isCorrect: true,
        isAnnulled: false,
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
        mockRepo.simulationQuestions.push({
          simulationId: simId,
          questionId: `attempt-${i}`,
          isAnnulledSnapshot: false,
        });
        mockRepo.questionAttempts.push({
          id: `attempt-${i}`,
          userId: USER_A,
          simulationId: simId,
          isCorrect: i <= 4,
          isAnnulled: false,
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
        mockRepo.simulationQuestions.push({
          simulationId: simId,
          questionId: `att-const-${i}`,
          isAnnulledSnapshot: false,
        });
        mockRepo.questionAttempts.push({
          id: `att-const-${i}`,
          userId: USER_A,
          simulationId: simId,
          isCorrect: i <= 5,
          isAnnulled: false,
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
        mockRepo.simulationQuestions.push({
          simulationId: simId,
          questionId: `att-info-${i}`,
          isAnnulledSnapshot: false,
        });
        mockRepo.questionAttempts.push({
          id: `att-info-${i}`,
          userId: USER_A,
          simulationId: simId,
          isCorrect: i === 1,
          isAnnulled: false,
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

      mockRepo.simulationQuestions.push(
        { simulationId: simId, questionId: 'q-easy', isAnnulledSnapshot: false },
        { simulationId: simId, questionId: 'q-medium', isAnnulledSnapshot: false },
        { simulationId: simId, questionId: 'q-hard', isAnnulledSnapshot: false },
        { simulationId: simId, questionId: 'q-unspecified', isAnnulledSnapshot: false }
      );

      mockRepo.questionAttempts.push(
        {
          id: 'q-easy',
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          isAnnulled: false,
          timeSpentSeconds: 30,
          answeredAt: new Date(),
          question: { subject: 'Português', difficulty: 'EASY', topic: 'Sintaxe' },
        },
        {
          id: 'q-medium',
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          isAnnulled: false,
          timeSpentSeconds: 40,
          answeredAt: new Date(),
          question: { subject: 'Português', difficulty: 'MEDIUM', topic: 'Morfologia' },
        },
        {
          id: 'q-hard',
          userId: USER_A,
          simulationId: simId,
          isCorrect: false,
          isAnnulled: false,
          timeSpentSeconds: 80,
          answeredAt: new Date(),
          question: { subject: 'Português', difficulty: 'HARD', topic: 'Semântica' },
        },
        {
          id: 'q-unspecified',
          userId: USER_A,
          simulationId: simId,
          isCorrect: false,
          isAnnulled: false,
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
      mockRepo.simulationQuestions.push({
        simulationId: 'sim-1',
        questionId: 'att-s1-1',
        isAnnulledSnapshot: false,
      });
      mockRepo.questionAttempts.push({
        id: 'att-s1-1',
        userId: USER_A,
        simulationId: 'sim-1',
        isCorrect: true,
        isAnnulled: false,
        timeSpentSeconds: 60,
        answeredAt: new Date(),
        question: { subject: 'Direito Penal', difficulty: 'EASY', topic: 'Crimes' },
      });

      for (let i = 1; i <= 9; i++) {
        mockRepo.simulationQuestions.push({
          simulationId: 'sim-2',
          questionId: `att-s2-${i}`,
          isAnnulledSnapshot: false,
        });
        mockRepo.questionAttempts.push({
          id: `att-s2-${i}`,
          userId: USER_A,
          simulationId: 'sim-2',
          isCorrect: false,
          isAnnulled: false,
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

      mockRepo.simulationQuestions.push({
        simulationId: 'sim-nulls',
        questionId: 'att-null-time',
        isAnnulledSnapshot: false,
      });

      mockRepo.questionAttempts.push({
        id: 'att-null-time',
        userId: USER_A,
        simulationId: 'sim-nulls',
        isCorrect: true,
        isAnnulled: false,
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

      mockRepo.simulationQuestions.push({
        simulationId: 'sim-in-progress',
        questionId: 'att-in-prog',
        isAnnulledSnapshot: false,
      });

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

      mockRepo.simulationQuestions.push(
        { simulationId: sim1, questionId: 'att-1', isAnnulledSnapshot: false },
        { simulationId: sim1, questionId: 'att-2', isAnnulledSnapshot: false },
        { simulationId: sim2, questionId: 'att-3', isAnnulledSnapshot: false },
        { simulationId: sim2, questionId: 'att-4', isAnnulledSnapshot: false }
      );

      mockRepo.questionAttempts.push(
        {
          id: 'att-1',
          userId: USER_A,
          simulationId: sim1,
          isCorrect: true,
          isAnnulled: false,
          timeSpentSeconds: 40,
          answeredAt: new Date(),
          question: { subject: 'Matemática', difficulty: 'EASY', topic: 'Álgebra' },
        },
        {
          id: 'att-2',
          userId: USER_A,
          simulationId: sim1,
          isCorrect: false,
          isAnnulled: false,
          timeSpentSeconds: 60,
          answeredAt: new Date(),
          question: { subject: 'Matemática', difficulty: 'MEDIUM', topic: 'Álgebra' },
        },
        {
          id: 'att-3',
          userId: USER_A,
          simulationId: sim2,
          isCorrect: true,
          isAnnulled: false,
          timeSpentSeconds: 50,
          answeredAt: new Date(),
          question: { subject: 'Matemática', difficulty: 'EASY', topic: 'Álgebra' },
        },
        {
          id: 'att-4',
          userId: USER_A,
          simulationId: sim2,
          isCorrect: true,
          isAnnulled: false,
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
        const qId = `att-volume-${String(i).padStart(5, '0')}`;
        mockRepo.simulationQuestions.push({
          simulationId: simId,
          questionId: qId,
          isAnnulledSnapshot: false,
        });
        mockRepo.questionAttempts.push({
          id: qId,
          userId: USER_A,
          simulationId: simId,
          isCorrect: i <= 1500,
          isAnnulled: false,
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
        const qId = `chunk-item-${i}`;
        mockRepo.simulationQuestions.push({
          simulationId: simId,
          questionId: qId,
          isAnnulledSnapshot: false,
        });
        mockRepo.questionAttempts.push({
          id: qId,
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          isAnnulled: false,
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
        mockRepo.simulationQuestions.push({
          simulationId: simId,
          questionId: `att-merit-${i}`,
          isAnnulledSnapshot: false,
        });
        mockRepo.questionAttempts.push({
          id: `att-merit-${i}`,
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          isAnnulled: false,
          timeSpentSeconds: 40,
          answeredAt: new Date(),
          question: { subject: 'Direito Administrativo', difficulty: 'MEDIUM', topic: 'Atos' },
        });
      }

      for (let i = 1; i <= 3; i++) {
        mockRepo.simulationQuestions.push({
          simulationId: simId,
          questionId: `att-error-${i}`,
          isAnnulledSnapshot: false,
        });
        mockRepo.questionAttempts.push({
          id: `att-error-${i}`,
          userId: USER_A,
          simulationId: simId,
          isCorrect: false,
          isAnnulled: false,
          timeSpentSeconds: 50,
          answeredAt: new Date(),
          question: { subject: 'Direito Administrativo', difficulty: 'MEDIUM', topic: 'Atos' },
        });
      }

      // Tentativa em branco na questão anulada
      mockRepo.simulationQuestions.push({
        simulationId: simId,
        questionId: 'att-annulled-blank',
        isAnnulledSnapshot: true,
      });
      mockRepo.questionAttempts.push({
        id: 'att-annulled-blank',
        userId: USER_A,
        simulationId: simId,
        isCorrect: null, // Deixada em branco
        isAnnulled: true,
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

      mockRepo.simulationQuestions.push(
        { simulationId: simId, questionId: 'case-1', isAnnulledSnapshot: false },
        { simulationId: simId, questionId: 'case-2', isAnnulledSnapshot: false },
        { simulationId: simId, questionId: 'case-3', isAnnulledSnapshot: false },
        { simulationId: simId, questionId: 'case-4', isAnnulledSnapshot: false }
      );

      mockRepo.questionAttempts.push(
        {
          id: 'case-1',
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          isAnnulled: false,
          timeSpentSeconds: 40,
          answeredAt: new Date(),
          question: { subject: 'Direito Constitucional', difficulty: 'EASY', topic: 'CF' },
        },
        {
          id: 'case-2',
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          isAnnulled: false,
          timeSpentSeconds: 40,
          answeredAt: new Date(),
          question: { subject: 'direito constitucional', difficulty: 'EASY', topic: 'CF' },
        },
        {
          id: 'case-3',
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          isAnnulled: false,
          timeSpentSeconds: 40,
          answeredAt: new Date(),
          question: { subject: 'DIREITO CONSTITUCIONAL', difficulty: 'EASY', topic: 'CF' },
        },
        {
          id: 'case-4',
          userId: USER_A,
          simulationId: simId,
          isCorrect: false,
          isAnnulled: false,
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

      mockRepo.simulationQuestions.push(
        { simulationId: simId, questionId: 'sp-1', isAnnulledSnapshot: false },
        { simulationId: simId, questionId: 'sp-2', isAnnulledSnapshot: false }
      );

      mockRepo.questionAttempts.push(
        {
          id: 'sp-1',
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          isAnnulled: false,
          timeSpentSeconds: 30,
          answeredAt: new Date(),
          question: { subject: '   Direito   Administrativo  ', difficulty: 'EASY', topic: null },
        },
        {
          id: 'sp-2',
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          isAnnulled: false,
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

      mockRepo.simulationQuestions.push(
        { simulationId: simId, questionId: 'd-1', isAnnulledSnapshot: false },
        { simulationId: simId, questionId: 'd-2', isAnnulledSnapshot: false }
      );

      mockRepo.questionAttempts.push(
        {
          id: 'd-1',
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          isAnnulled: false,
          timeSpentSeconds: 40,
          answeredAt: new Date(),
          question: { subject: 'Direito Penal', difficulty: 'EASY', topic: null },
        },
        {
          id: 'd-2',
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          isAnnulled: false,
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

      mockRepo.simulationQuestions.push(
        { simulationId: simId, questionId: 'att-civil-1', isAnnulledSnapshot: false },
        { simulationId: simId, questionId: 'att-civil-2', isAnnulledSnapshot: false },
        { simulationId: simId, questionId: 'att-civil-3', isAnnulledSnapshot: false },
        { simulationId: simId, questionId: 'att-civil-4', isAnnulledSnapshot: false },
        { simulationId: simId, questionId: 'att-civil-annulled-unanswered', isAnnulledSnapshot: true }
      );

      // 2 acertos demonstrados em Direito Civil
      mockRepo.questionAttempts.push(
        {
          id: 'att-civil-1',
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          isAnnulled: false,
          timeSpentSeconds: 60,
          answeredAt: new Date(),
          question: { subject: 'Direito Civil', difficulty: 'EASY', topic: 'Contratos' },
        },
        {
          id: 'att-civil-2',
          userId: USER_A,
          simulationId: simId,
          isCorrect: true,
          isAnnulled: false,
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
          isAnnulled: false,
          timeSpentSeconds: 60,
          answeredAt: new Date(),
          question: { subject: 'Direito Civil', difficulty: 'MEDIUM', topic: 'Contratos' },
        },
        {
          id: 'att-civil-4',
          userId: USER_A,
          simulationId: simId,
          isCorrect: false,
          isAnnulled: false,
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
        isAnnulled: true,
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

    it('deve neutralizar tentativa com estado de anulação desconhecido (ausência de snapshot) sem quebrar a execução', async () => {
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
        // isAnnulled omitido / não encontrado -> tratado conservadoramente como null (desconhecido)
        timeSpentSeconds: 40,
        answeredAt: new Date(),
        question: { subject: 'Informática', difficulty: 'EASY', topic: 'Sistemas Operacionais' },
      });

      const stats = await service.getStudentAnalytics(USER_A);

      // Sprint 10.1 (ACH-SEC-01): Ausência de snapshot não pontua nem conta nas métricas pedagógicas
      expect(stats.globalStats.pedagogicalAnsweredQuestions).toBe(0);
      expect(stats.globalStats.pedagogicalCorrectAnswers).toBe(0);
      expect(stats.globalStats.pedagogicalAccuracyPercentage).toBe(0);
      // Pontuação oficial do simulado é preservada
      expect(stats.globalStats.officialTotalPoints).toBe(1);
      expect(stats.globalStats.averageSimulationScore).toBe(100.0);
    });
  });

  describe('Sprint 10.1: Hardening de Integridade Histórica e Resiliência do Analytics (ACH-SEC-01)', () => {
    // 1. Questão comprovadamente regular
    it('1. Questão comprovadamente regular deve ser contabilizada normalmente nas métricas pedagógicas', async () => {
      const simId = 'sim-reg-10-1';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 100.0,
        correctCount: 1,
        wrongCount: 0,
        durationSeconds: 60,
        finishedAt: new Date(),
      });
      mockRepo.simulationQuestions.push({
        simulationId: simId,
        questionId: 'q-reg',
        isAnnulledSnapshot: false,
      });
      mockRepo.questionAttempts.push({
        id: 'att-reg',
        userId: USER_A,
        simulationId: simId,
        questionId: 'q-reg',
        isCorrect: true,
        timeSpentSeconds: 40,
        answeredAt: new Date(),
        question: { subject: 'Direito Constitucional', difficulty: 'MEDIUM', topic: 'Direitos Fundamentais' },
      });

      const stats = await service.getStudentAnalytics(USER_A);
      expect(stats.globalStats.pedagogicalAnsweredQuestions).toBe(1);
      expect(stats.globalStats.pedagogicalCorrectAnswers).toBe(1);
      expect(stats.globalStats.pedagogicalAccuracyPercentage).toBe(100.0);
      expect(stats.subjectPerformance[0]?.subject).toBe('Direito Constitucional');
      expect(stats.subjectPerformance[0]?.accuracyPercentage).toBe(100.0);
    });

    // 2. Questão comprovadamente anulada
    it('2. Questão comprovadamente anulada deve ser neutralizada das métricas pedagógicas', async () => {
      const simId = 'sim-ann-10-1';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 100.0,
        correctCount: 1, // Pontuação oficial de concurso
        wrongCount: 0,
        durationSeconds: 60,
        finishedAt: new Date(),
      });
      mockRepo.simulationQuestions.push({
        simulationId: simId,
        questionId: 'q-ann',
        isAnnulledSnapshot: true,
      });
      mockRepo.questionAttempts.push({
        id: 'att-ann',
        userId: USER_A,
        simulationId: simId,
        questionId: 'q-ann',
        isCorrect: true, // Bonificação oficial
        timeSpentSeconds: 40,
        answeredAt: new Date(),
        question: { subject: 'Direito Administrativo', difficulty: 'EASY', topic: 'Atos' },
      });

      const stats = await service.getStudentAnalytics(USER_A);
      expect(stats.globalStats.officialTotalPoints).toBe(1);
      expect(stats.globalStats.averageSimulationScore).toBe(100.0);
      expect(stats.globalStats.pedagogicalAnsweredQuestions).toBe(0);
      expect(stats.globalStats.pedagogicalCorrectAnswers).toBe(0);
      expect(stats.globalStats.pedagogicalAccuracyPercentage).toBe(0);
      expect(stats.subjectPerformance.find((s) => s.subject === 'Direito Administrativo')).toBeUndefined();
    });

    // 3. Tentativa sem SimulationQuestion (ausência de snapshot -> isAnnulled === null)
    it('3. Tentativa sem SimulationQuestion deve resultar em isAnnulled === null no repositório', async () => {
      const simId = 'sim-orphan-10-1';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 100.0,
        correctCount: 1,
        wrongCount: 0,
        durationSeconds: 60,
        finishedAt: new Date(),
      });
      // NÃO adiciona em mockRepo.simulationQuestions e não passa isAnnulled
      mockRepo.questionAttempts.push({
        id: 'att-orphan-test',
        userId: USER_A,
        simulationId: simId,
        questionId: 'q-no-snapshot',
        isCorrect: true,
        timeSpentSeconds: 30,
        answeredAt: new Date(),
        question: { subject: 'Informática', difficulty: 'EASY', topic: 'Hardware' },
      });

      const attempts = await mockRepo.getQuestionAttemptsWithMetadata(USER_A);
      expect(attempts).toHaveLength(1);
      expect(attempts[0].isAnnulled).toBeNull();
    });

    // 4. Tentativa sem snapshot com isCorrect=true
    it('4. Tentativa sem snapshot com isCorrect=true NÃO deve pontuar como acerto pedagógico', async () => {
      const simId = 'sim-orphan-true';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 100.0,
        correctCount: 1,
        wrongCount: 0,
        durationSeconds: 50,
        finishedAt: new Date(),
      });
      mockRepo.questionAttempts.push({
        id: 'att-orphan-correct',
        userId: USER_A,
        simulationId: simId,
        questionId: 'q-orphan-true',
        isCorrect: true,
        timeSpentSeconds: 50,
        answeredAt: new Date(),
        question: { subject: 'Direito Penal', difficulty: 'HARD', topic: 'Tipicidade' },
      });

      const stats = await service.getStudentAnalytics(USER_A);
      expect(stats.globalStats.pedagogicalCorrectAnswers).toBe(0);
      expect(stats.globalStats.pedagogicalAnsweredQuestions).toBe(0);
      expect(stats.globalStats.pedagogicalAccuracyPercentage).toBe(0);
      expect(stats.subjectPerformance.find((s) => s.subject === 'Direito Penal')).toBeUndefined();
    });

    // 5. Tentativa sem snapshot com isCorrect=false
    it('5. Tentativa sem snapshot com isCorrect=false NÃO deve contar no denominador da acurácia pedagógica', async () => {
      const simId = 'sim-orphan-false';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 0,
        correctCount: 0,
        wrongCount: 1,
        durationSeconds: 50,
        finishedAt: new Date(),
      });
      mockRepo.questionAttempts.push({
        id: 'att-orphan-wrong',
        userId: USER_A,
        simulationId: simId,
        questionId: 'q-orphan-false',
        isCorrect: false,
        timeSpentSeconds: 50,
        answeredAt: new Date(),
        question: { subject: 'Direito Tributário', difficulty: 'MEDIUM', topic: 'Impostos' },
      });

      const stats = await service.getStudentAnalytics(USER_A);
      expect(stats.globalStats.pedagogicalWrongAnswers).toBe(0);
      expect(stats.globalStats.pedagogicalAnsweredQuestions).toBe(0);
      expect(stats.globalStats.pedagogicalAccuracyPercentage).toBe(0);
      expect(stats.subjectPerformance.find((s) => s.subject === 'Direito Tributário')).toBeUndefined();
    });

    // 6. Histórico misto com questões regulares, anuladas e desconhecidas
    it('6. Histórico misto deve considerar estritamente as questões regulares para acurácia e disciplinas', async () => {
      const simId = 'sim-mixed-10-1';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 80.0,
        correctCount: 4,
        wrongCount: 1,
        durationSeconds: 400,
        finishedAt: new Date(),
      });

      // Snapshots conhecidos
      mockRepo.simulationQuestions.push(
        { simulationId: simId, questionId: 'q-reg-1', isAnnulledSnapshot: false },
        { simulationId: simId, questionId: 'q-reg-2', isAnnulledSnapshot: false },
        { simulationId: simId, questionId: 'q-reg-3', isAnnulledSnapshot: false },
        { simulationId: simId, questionId: 'q-ann-1', isAnnulledSnapshot: true }
      );
      // q-orphan-1 e q-orphan-2 NÃO possuem snapshot (desconhecidas)

      mockRepo.questionAttempts.push(
        // 2 regulares corretas em Constitucional
        { id: 'att-m-1', userId: USER_A, simulationId: simId, questionId: 'q-reg-1', isCorrect: true, timeSpentSeconds: 30, answeredAt: new Date(), question: { subject: 'Direito Constitucional', difficulty: 'EASY', topic: 'CF' } },
        { id: 'att-m-2', userId: USER_A, simulationId: simId, questionId: 'q-reg-2', isCorrect: true, timeSpentSeconds: 30, answeredAt: new Date(), question: { subject: 'Direito Constitucional', difficulty: 'EASY', topic: 'CF' } },
        // 1 regular errada em Constitucional
        { id: 'att-m-3', userId: USER_A, simulationId: simId, questionId: 'q-reg-3', isCorrect: false, timeSpentSeconds: 30, answeredAt: new Date(), question: { subject: 'Direito Constitucional', difficulty: 'EASY', topic: 'CF' } },
        // 1 anulada respondida em Informática (ganha ponto oficial no exame)
        { id: 'att-m-4', userId: USER_A, simulationId: simId, questionId: 'q-ann-1', isCorrect: true, timeSpentSeconds: 30, answeredAt: new Date(), question: { subject: 'Informática', difficulty: 'HARD', topic: 'Redes' } },
        // 1 desconhecida/órfã com isCorrect=true em Direito Civil
        { id: 'att-m-5', userId: USER_A, simulationId: simId, questionId: 'q-orphan-1', isCorrect: true, timeSpentSeconds: 30, answeredAt: new Date(), question: { subject: 'Direito Civil', difficulty: 'MEDIUM', topic: 'Posse' } },
        // 1 desconhecida/órfã com isCorrect=false em Direito Civil
        { id: 'att-m-6', userId: USER_A, simulationId: simId, questionId: 'q-orphan-2', isCorrect: false, timeSpentSeconds: 30, answeredAt: new Date(), question: { subject: 'Direito Civil', difficulty: 'MEDIUM', topic: 'Posse' } }
      );

      const stats = await service.getStudentAnalytics(USER_A);

      // Apenas as 3 questões regulares entram no domínio pedagógico (2 acertos, 1 erro = 66.7%)
      expect(stats.globalStats.pedagogicalAnsweredQuestions).toBe(3);
      expect(stats.globalStats.pedagogicalCorrectAnswers).toBe(2);
      expect(stats.globalStats.pedagogicalWrongAnswers).toBe(1);
      expect(stats.globalStats.pedagogicalAccuracyPercentage).toBe(66.7);

      // Disciplina Direito Constitucional
      expect(stats.subjectPerformance).toHaveLength(1);
      const constSubj = stats.subjectPerformance[0];
      expect(constSubj.subject).toBe('Direito Constitucional');
      expect(constSubj.totalAnswered).toBe(3);
      expect(constSubj.correctCount).toBe(2);
      expect(constSubj.wrongCount).toBe(1);
      expect(constSubj.accuracyPercentage).toBe(66.7);

      // Informática e Direito Civil neutralizadas
      expect(stats.subjectPerformance.find((s) => s.subject === 'Informática')).toBeUndefined();
      expect(stats.subjectPerformance.find((s) => s.subject === 'Direito Civil')).toBeUndefined();
    });

    // 7. Preservação da pontuação oficial
    it('7. Preservação da pontuação oficial e nota do simulado independente de anulações ou snapshots ausentes', async () => {
      const simId = 'sim-official-preserved';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 75.0,
        correctCount: 3,
        wrongCount: 1,
        durationSeconds: 1500,
        finishedAt: new Date(),
      });

      // Todas as tentativas são órfãs ou anuladas
      mockRepo.questionAttempts.push(
        { id: 'att-p-1', userId: USER_A, simulationId: simId, questionId: 'q-orphan-p1', isCorrect: true, timeSpentSeconds: 40, answeredAt: new Date(), question: { subject: 'Bioética', difficulty: null, topic: null } },
        { id: 'att-p-2', userId: USER_A, simulationId: simId, questionId: 'q-orphan-p2', isCorrect: true, timeSpentSeconds: 40, answeredAt: new Date(), question: { subject: 'Bioética', difficulty: null, topic: null } }
      );

      const stats = await service.getStudentAnalytics(USER_A);
      expect(stats.globalStats.officialTotalPoints).toBe(3);
      expect(stats.globalStats.averageSimulationScore).toBe(75.0);
      expect(stats.globalStats.completedSimulationsCount).toBe(1);
      expect(stats.globalStats.totalDurationSeconds).toBe(1500);
    });

    // 8. Ausência de divisão por zero
    it('8. Ausência de divisão por zero quando o estudante possui apenas tentativas desconhecidas ou anuladas', async () => {
      const simId = 'sim-no-div-zero';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 50.0,
        correctCount: 1,
        wrongCount: 1,
        durationSeconds: 120,
        finishedAt: new Date(),
      });
      // 1 tentativa sem snapshot
      mockRepo.questionAttempts.push({
        id: 'att-ndz',
        userId: USER_A,
        simulationId: simId,
        questionId: 'q-ndz',
        isCorrect: true,
        timeSpentSeconds: 40,
        answeredAt: new Date(),
        question: { subject: 'Ética', difficulty: 'EASY', topic: 'Conceitos' },
      });

      const stats = await service.getStudentAnalytics(USER_A);
      expect(stats.globalStats.pedagogicalAnsweredQuestions).toBe(0);
      expect(stats.globalStats.pedagogicalCorrectAnswers).toBe(0);
      expect(stats.globalStats.pedagogicalAccuracyPercentage).toBe(0);
      expect(Number.isNaN(stats.globalStats.pedagogicalAccuracyPercentage)).toBe(false);
      expect(Number.isFinite(stats.globalStats.pedagogicalAccuracyPercentage)).toBe(true);
      expect(stats.subjectPerformance).toEqual([]);
    });

    // 9. Isolamento entre usuários
    it('9. Isolamento estrito entre usuários: tentativas desconhecidas ou regulares de outro estudante não contaminam o analytics', async () => {
      const simA = 'sim-user-a';
      const simB = 'sim-user-b';

      mockRepo.simulations.push(
        { id: simA, userId: USER_A, status: 'COMPLETED', scorePercentage: 100, correctCount: 1, wrongCount: 0, durationSeconds: 60, finishedAt: new Date() },
        { id: simB, userId: USER_B, status: 'COMPLETED', scorePercentage: 50, correctCount: 1, wrongCount: 1, durationSeconds: 120, finishedAt: new Date() }
      );

      mockRepo.simulationQuestions.push(
        { simulationId: simA, questionId: 'q-user-a', isAnnulledSnapshot: false },
        { simulationId: simB, questionId: 'q-user-b', isAnnulledSnapshot: false }
      );

      mockRepo.questionAttempts.push(
        { id: 'att-ua', userId: USER_A, simulationId: simA, questionId: 'q-user-a', isCorrect: true, timeSpentSeconds: 30, answeredAt: new Date(), question: { subject: 'Geografia', difficulty: 'EASY', topic: 'Clima' } },
        // Tentativa de USER_B (com erro e com questão desconhecida)
        { id: 'att-ub-1', userId: USER_B, simulationId: simB, questionId: 'q-user-b', isCorrect: false, timeSpentSeconds: 60, answeredAt: new Date(), question: { subject: 'Geografia', difficulty: 'HARD', topic: 'Relevo' } },
        { id: 'att-ub-orphan', userId: USER_B, simulationId: simB, questionId: 'q-orphan-b', isCorrect: true, timeSpentSeconds: 60, answeredAt: new Date(), question: { subject: 'Geografia', difficulty: 'HARD', topic: 'Relevo' } }
      );

      const statsA = await service.getStudentAnalytics(USER_A);
      expect(statsA.globalStats.pedagogicalAnsweredQuestions).toBe(1);
      expect(statsA.globalStats.pedagogicalCorrectAnswers).toBe(1);
      expect(statsA.globalStats.pedagogicalAccuracyPercentage).toBe(100.0);
      expect(statsA.subjectPerformance[0]?.subject).toBe('Geografia');
      expect(statsA.subjectPerformance[0]?.totalAnswered).toBe(1);
      expect(statsA.subjectPerformance[0]?.accuracyPercentage).toBe(100.0);
    });

    // 10. Processamento em múltiplos lotes
    it('10. Processamento em múltiplos lotes mantém a classificação conservadora de cada tentativa', async () => {
      const simId = 'sim-batch-mult';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 80.0,
        correctCount: 20,
        wrongCount: 5,
        durationSeconds: 1000,
        finishedAt: new Date(),
      });

      // 10 regulares, 5 anuladas, 5 desconhecidas = 20 tentativas
      for (let i = 1; i <= 10; i++) {
        mockRepo.simulationQuestions.push({ simulationId: simId, questionId: `q-b-reg-${i}`, isAnnulledSnapshot: false });
        mockRepo.questionAttempts.push({
          id: `att-b-${String(i).padStart(3, '0')}`,
          userId: USER_A,
          simulationId: simId,
          questionId: `q-b-reg-${i}`,
          isCorrect: true,
          timeSpentSeconds: 20,
          answeredAt: new Date(),
          question: { subject: 'História', difficulty: 'EASY', topic: 'Brasil' },
        });
      }
      for (let i = 11; i <= 15; i++) {
        mockRepo.simulationQuestions.push({ simulationId: simId, questionId: `q-b-ann-${i}`, isAnnulledSnapshot: true });
        mockRepo.questionAttempts.push({
          id: `att-b-${String(i).padStart(3, '0')}`,
          userId: USER_A,
          simulationId: simId,
          questionId: `q-b-ann-${i}`,
          isCorrect: true,
          timeSpentSeconds: 20,
          answeredAt: new Date(),
          question: { subject: 'História', difficulty: 'EASY', topic: 'Brasil' },
        });
      }
      for (let i = 16; i <= 20; i++) {
        // Sem simulationQuestion (desconhecidas)
        mockRepo.questionAttempts.push({
          id: `att-b-${String(i).padStart(3, '0')}`,
          userId: USER_A,
          simulationId: simId,
          questionId: `q-b-orph-${i}`,
          isCorrect: true,
          timeSpentSeconds: 20,
          answeredAt: new Date(),
          question: { subject: 'História', difficulty: 'EASY', topic: 'Brasil' },
        });
      }

      // Processar em lotes de 5
      let batchCount = 0;
      const collected: QuestionAttemptWithMetadata[] = [];
      await mockRepo.processQuestionAttemptsInBatches(
        USER_A,
        (batch) => {
          batchCount += 1;
          collected.push(...batch);
        },
        5
      );

      expect(batchCount).toBe(4);
      expect(collected).toHaveLength(20);
      const regularCount = collected.filter((c) => c.isAnnulled === false).length;
      const annulledCount = collected.filter((c) => c.isAnnulled === true).length;
      const unknownCount = collected.filter((c) => c.isAnnulled === null).length;
      expect(regularCount).toBe(10);
      expect(annulledCount).toBe(5);
      expect(unknownCount).toBe(5);

      const stats = await service.getStudentAnalytics(USER_A);
      // Somente as 10 regulares entram nas métricas
      expect(stats.globalStats.pedagogicalAnsweredQuestions).toBe(10);
      expect(stats.globalStats.pedagogicalCorrectAnswers).toBe(10);
      expect(stats.globalStats.pedagogicalAccuracyPercentage).toBe(100.0);
    });

    // 11. Ausência de N+1
    it('11. Ausência de N+1 no repositório Prisma: 1 única consulta simulationQuestion.findMany por lote', async () => {
      const mockRawAttempts = [
        { id: 'att-1', simulationId: 'sim-1', questionId: 'q-1', isCorrect: true, timeSpentSeconds: 30, answeredAt: new Date(), question: { subject: 'Direito', difficulty: 'EASY', topic: 'T' } },
        { id: 'att-2', simulationId: 'sim-1', questionId: 'q-2', isCorrect: true, timeSpentSeconds: 30, answeredAt: new Date(), question: { subject: 'Direito', difficulty: 'EASY', topic: 'T' } },
        { id: 'att-3', simulationId: 'sim-2', questionId: 'q-3', isCorrect: false, timeSpentSeconds: 30, answeredAt: new Date(), question: { subject: 'Direito', difficulty: 'EASY', topic: 'T' } },
      ];

      const mockFindManyAttempts = vi.fn().mockResolvedValueOnce(mockRawAttempts).mockResolvedValueOnce([]);
      const mockFindManySimulationQuestions = vi.fn().mockResolvedValue([
        { simulationId: 'sim-1', questionId: 'q-1', isAnnulledSnapshot: false },
        // q-2 e q-3 sem snapshot
      ]);

      const fakePrismaClient = {
        questionAttempt: { findMany: mockFindManyAttempts },
        simulationQuestion: { findMany: mockFindManySimulationQuestions },
      } as any;

      const prismaRepo = new PrismaEducationalAnalyticsRepository(fakePrismaClient);
      const batchesReceived: QuestionAttemptWithMetadata[][] = [];
      const total = await prismaRepo.processQuestionAttemptsInBatches(
        USER_A,
        (batch) => {
          batchesReceived.push(batch);
        },
        10
      );

      expect(total).toBe(3);
      // Garantia total contra N+1: exatamente 1 chamada para o lote
      expect(mockFindManySimulationQuestions).toHaveBeenCalledTimes(1);
      expect(mockFindManySimulationQuestions).toHaveBeenCalledWith({
        where: {
          simulationId: { in: ['sim-1', 'sim-2'] },
          questionId: { in: ['q-1', 'q-2', 'q-3'] },
        },
        select: {
          simulationId: true,
          questionId: true,
          isAnnulledSnapshot: true,
        },
      });

      // Validação do mapeamento tri-estado
      const batch = batchesReceived[0];
      expect(batch[0].isAnnulled).toBe(false); // q-1 comprovadamente regular
      expect(batch[1].isAnnulled).toBeNull(); // q-2 sem snapshot -> null
      expect(batch[2].isAnnulled).toBeNull(); // q-3 sem snapshot -> null
    });

    // 12. Paridade entre Mock e Prisma
    it('12. Paridade estrita entre Mock e Prisma: ambos retornam isAnnulled === null para tentativas sem snapshot', async () => {
      // 1. Prisma
      const fakePrismaClient = {
        questionAttempt: {
          findMany: vi.fn()
            .mockResolvedValueOnce([
              { id: 'att-prism', simulationId: 'sim-p', questionId: 'q-no-sq', isCorrect: true, timeSpentSeconds: 40, answeredAt: new Date(), question: { subject: 'Matemática', difficulty: 'EASY', topic: 'Álgebra' } },
            ])
            .mockResolvedValueOnce([]),
        },
        simulationQuestion: {
          findMany: vi.fn().mockResolvedValue([]), // nenhum snapshot encontrado
        },
      } as any;

      const prismaRepo = new PrismaEducationalAnalyticsRepository(fakePrismaClient);
      let prismaAttempt: QuestionAttemptWithMetadata | undefined;
      await prismaRepo.processQuestionAttemptsInBatches(USER_A, (batch) => {
        prismaAttempt = batch[0];
      });

      // 2. Mock
      const localMockRepo = new MockEducationalAnalyticsRepository();
      localMockRepo.simulations.push({
        id: 'sim-p',
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 100,
        correctCount: 1,
        wrongCount: 0,
        durationSeconds: 100,
        finishedAt: new Date(),
      });
      localMockRepo.questionAttempts.push({
        id: 'att-mock',
        userId: USER_A,
        simulationId: 'sim-p',
        questionId: 'q-no-sq',
        isCorrect: true,
        timeSpentSeconds: 40,
        answeredAt: new Date(),
        question: { subject: 'Matemática', difficulty: 'EASY', topic: 'Álgebra' },
      });
      const mockAttempts = await localMockRepo.getQuestionAttemptsWithMetadata(USER_A);

      // Verificação de paridade exata
      expect(prismaAttempt?.isAnnulled).toBeNull();
      expect(mockAttempts[0].isAnnulled).toBeNull();
      expect(prismaAttempt?.isAnnulled).toBe(mockAttempts[0].isAnnulled);
    });
  });

  describe('Sprint 10.1.1: Precedência de Snapshot e Paridade Estrita entre Mock e Prisma', () => {
    // 1. Tentativa com isAnnulled: false, snapshot true -> resultado true
    it('1. Precedência de Snapshot: tentativa com isAnnulled: false e snapshot true deve resolver para isAnnulled === true', async () => {
      const simId = 'sim-prec-1';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 100,
        correctCount: 1,
        wrongCount: 0,
        durationSeconds: 60,
        finishedAt: new Date(),
      });
      // Snapshot oficial afirma que a questão foi ANULADA
      mockRepo.simulationQuestions.push({
        simulationId: simId,
        questionId: 'q-prec-1',
        isAnnulledSnapshot: true,
      });
      // Tentativa local declara isAnnulled: false (conflito / tentativa desatualizada)
      mockRepo.questionAttempts.push({
        id: 'att-prec-1',
        userId: USER_A,
        simulationId: simId,
        questionId: 'q-prec-1',
        isCorrect: true,
        isAnnulled: false,
        timeSpentSeconds: 30,
        answeredAt: new Date(),
        question: { subject: 'Direito Administrativo', difficulty: 'EASY', topic: 'Atos' },
      });

      const attempts = await mockRepo.getQuestionAttemptsWithMetadata(USER_A);
      expect(attempts).toHaveLength(1);
      // O snapshot prevalece soberanamente
      expect(attempts[0].isAnnulled).toBe(true);

      const stats = await service.getStudentAnalytics(USER_A);
      // Sendo anulada, é neutralizada das métricas pedagógicas
      expect(stats.globalStats.pedagogicalAnsweredQuestions).toBe(0);
      expect(stats.globalStats.pedagogicalCorrectAnswers).toBe(0);
    });

    // 2. Tentativa com isAnnulled: true, snapshot false -> resultado false
    it('2. Precedência de Snapshot: tentativa com isAnnulled: true e snapshot false deve resolver para isAnnulled === false', async () => {
      const simId = 'sim-prec-2';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 100,
        correctCount: 1,
        wrongCount: 0,
        durationSeconds: 60,
        finishedAt: new Date(),
      });
      // Snapshot oficial afirma que a questão é REGULAR
      mockRepo.simulationQuestions.push({
        simulationId: simId,
        questionId: 'q-prec-2',
        isAnnulledSnapshot: false,
      });
      // Tentativa local declara isAnnulled: true
      mockRepo.questionAttempts.push({
        id: 'att-prec-2',
        userId: USER_A,
        simulationId: simId,
        questionId: 'q-prec-2',
        isCorrect: true,
        isAnnulled: true,
        timeSpentSeconds: 30,
        answeredAt: new Date(),
        question: { subject: 'Direito Constitucional', difficulty: 'MEDIUM', topic: 'Poderes' },
      });

      const attempts = await mockRepo.getQuestionAttemptsWithMetadata(USER_A);
      expect(attempts).toHaveLength(1);
      // O snapshot prevalece soberanamente
      expect(attempts[0].isAnnulled).toBe(false);

      const stats = await service.getStudentAnalytics(USER_A);
      // Sendo regular, computa integralmente no domínio pedagógico
      expect(stats.globalStats.pedagogicalAnsweredQuestions).toBe(1);
      expect(stats.globalStats.pedagogicalCorrectAnswers).toBe(1);
      expect(stats.globalStats.pedagogicalAccuracyPercentage).toBe(100.0);
    });

    // 3. Tentativa com isAnnulled: false, snapshot ausente -> resultado null
    it('3. Precedência de Snapshot: tentativa com isAnnulled: false e snapshot ausente deve resolver para isAnnulled === null', async () => {
      const simId = 'sim-prec-3';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 100,
        correctCount: 1,
        wrongCount: 0,
        durationSeconds: 60,
        finishedAt: new Date(),
      });
      // NÃO existe entrada em simulationQuestions (snapshot ausente / órfã)
      // Tentativa local declara isAnnulled: false (não deve ser aceito como verdade tácita)
      mockRepo.questionAttempts.push({
        id: 'att-prec-3',
        userId: USER_A,
        simulationId: simId,
        questionId: 'q-prec-3',
        isCorrect: true,
        isAnnulled: false,
        timeSpentSeconds: 30,
        answeredAt: new Date(),
        question: { subject: 'Informática', difficulty: 'EASY', topic: 'Redes' },
      });

      const attempts = await mockRepo.getQuestionAttemptsWithMetadata(USER_A);
      expect(attempts).toHaveLength(1);
      expect(attempts[0].isAnnulled).toBeNull();

      const stats = await service.getStudentAnalytics(USER_A);
      // Estado desconhecido (null) é neutralizado conservadoramente
      expect(stats.globalStats.pedagogicalAnsweredQuestions).toBe(0);
      expect(stats.globalStats.pedagogicalCorrectAnswers).toBe(0);
    });

    // 4. Tentativa sem isAnnulled, snapshot ausente -> resultado null
    it('4. Precedência de Snapshot: tentativa sem isAnnulled e snapshot ausente deve resolver para isAnnulled === null', async () => {
      const simId = 'sim-prec-4';
      mockRepo.simulations.push({
        id: simId,
        userId: USER_A,
        status: 'COMPLETED',
        scorePercentage: 100,
        correctCount: 1,
        wrongCount: 0,
        durationSeconds: 60,
        finishedAt: new Date(),
      });
      // isAnnulled não informado e snapshot ausente
      mockRepo.questionAttempts.push({
        id: 'att-prec-4',
        userId: USER_A,
        simulationId: simId,
        questionId: 'q-prec-4',
        isCorrect: true,
        timeSpentSeconds: 30,
        answeredAt: new Date(),
        question: { subject: 'Português', difficulty: 'HARD', topic: 'Crase' },
      });

      const attempts = await mockRepo.getQuestionAttemptsWithMetadata(USER_A);
      expect(attempts).toHaveLength(1);
      expect(attempts[0].isAnnulled).toBeNull();

      const stats = await service.getStudentAnalytics(USER_A);
      expect(stats.globalStats.pedagogicalAnsweredQuestions).toBe(0);
      expect(stats.globalStats.pedagogicalCorrectAnswers).toBe(0);
    });

    // 5. Mesma questão em simulados distintos com snapshots diferentes
    it('5. Chave composta: mesma questão em simulados distintos resolve snapshots independentes sem colisão', async () => {
      const sim1 = 'sim-diff-snap-1';
      const sim2 = 'sim-diff-snap-2';
      const sharedQuestionId = 'q-shared-concurso';

      mockRepo.simulations.push(
        { id: sim1, userId: USER_A, status: 'COMPLETED', scorePercentage: 100, correctCount: 1, wrongCount: 0, durationSeconds: 60, finishedAt: new Date('2026-03-01T10:00:00Z') },
        { id: sim2, userId: USER_A, status: 'COMPLETED', scorePercentage: 100, correctCount: 1, wrongCount: 0, durationSeconds: 60, finishedAt: new Date('2026-03-02T10:00:00Z') }
      );

      // No Simulado 1, a questão era regular (snapshot false)
      // No Simulado 2 (aplicação posterior pós-recurso), a mesma questão foi anulada (snapshot true)
      mockRepo.simulationQuestions.push(
        { simulationId: sim1, questionId: sharedQuestionId, isAnnulledSnapshot: false },
        { simulationId: sim2, questionId: sharedQuestionId, isAnnulledSnapshot: true }
      );

      mockRepo.questionAttempts.push(
        { id: 'att-shared-s1', userId: USER_A, simulationId: sim1, questionId: sharedQuestionId, isCorrect: true, timeSpentSeconds: 35, answeredAt: new Date(), question: { subject: 'Direito Penal', difficulty: 'MEDIUM', topic: 'Tipicidade' } },
        { id: 'att-shared-s2', userId: USER_A, simulationId: sim2, questionId: sharedQuestionId, isCorrect: true, timeSpentSeconds: 35, answeredAt: new Date(), question: { subject: 'Direito Penal', difficulty: 'MEDIUM', topic: 'Tipicidade' } }
      );

      const attempts = await mockRepo.getQuestionAttemptsWithMetadata(USER_A);
      expect(attempts).toHaveLength(2);

      const attSim1 = attempts.find((a) => a.simulationId === sim1);
      const attSim2 = attempts.find((a) => a.simulationId === sim2);

      expect(attSim1?.isAnnulled).toBe(false);
      expect(attSim2?.isAnnulled).toBe(true);

      const stats = await service.getStudentAnalytics(USER_A);
      // Apenas a tentativa do sim1 computa pedagogicamente
      expect(stats.globalStats.pedagogicalAnsweredQuestions).toBe(1);
      expect(stats.globalStats.pedagogicalCorrectAnswers).toBe(1);
      expect(stats.globalStats.pedagogicalAccuracyPercentage).toBe(100.0);
      // Ambas concedem ponto oficial nos simulados
      expect(stats.globalStats.officialTotalPoints).toBe(2);
    });

    // 6. Paridade entre Mock e Prisma para todos esses cenários
    it('6. Paridade estrita e absoluta entre Mock e Prisma para todos os cenários de precedência e chave composta', async () => {
      const scenarios = [
        { id: '1', simId: 'sim-p1', qId: 'q-p1', attemptIsAnnulled: false, snapshot: true, expected: true },
        { id: '2', simId: 'sim-p2', qId: 'q-p2', attemptIsAnnulled: true, snapshot: false, expected: false },
        { id: '3', simId: 'sim-p3', qId: 'q-p3', attemptIsAnnulled: false, snapshot: undefined, expected: null },
        { id: '4', simId: 'sim-p4', qId: 'q-p4', attemptIsAnnulled: undefined, snapshot: undefined, expected: null },
        { id: '5a', simId: 'sim-p5a', qId: 'q-shared', attemptIsAnnulled: undefined, snapshot: false, expected: false },
        { id: '5b', simId: 'sim-p5b', qId: 'q-shared', attemptIsAnnulled: undefined, snapshot: true, expected: true },
      ];

      // A. Mock Repository
      const parityMockRepo = new MockEducationalAnalyticsRepository();
      for (const sc of scenarios) {
        parityMockRepo.simulations.push({
          id: sc.simId,
          userId: USER_A,
          status: 'COMPLETED',
          scorePercentage: 100,
          correctCount: 1,
          wrongCount: 0,
          durationSeconds: 60,
          finishedAt: new Date(),
        });
        if (sc.snapshot !== undefined) {
          parityMockRepo.simulationQuestions.push({
            simulationId: sc.simId,
            questionId: sc.qId,
            isAnnulledSnapshot: sc.snapshot,
          });
        }
        parityMockRepo.questionAttempts.push({
          id: `att-${sc.id}`,
          userId: USER_A,
          simulationId: sc.simId,
          questionId: sc.qId,
          isCorrect: true,
          isAnnulled: sc.attemptIsAnnulled,
          timeSpentSeconds: 30,
          answeredAt: new Date(),
          question: { subject: 'Direito', difficulty: 'EASY', topic: 'T' },
        });
      }
      const mockResults = await parityMockRepo.getQuestionAttemptsWithMetadata(USER_A);

      // B. Prisma Repository com PrismaClient mockado
      const rawPrismaAttempts = scenarios.map((sc) => ({
        id: `att-${sc.id}`,
        simulationId: sc.simId,
        questionId: sc.qId,
        isCorrect: true,
        timeSpentSeconds: 30,
        answeredAt: new Date(),
        question: { subject: 'Direito', difficulty: 'EASY', topic: 'T' },
      }));

      const simulationQuestionsInDb = scenarios
        .filter((sc) => sc.snapshot !== undefined)
        .map((sc) => ({
          simulationId: sc.simId,
          questionId: sc.qId,
          isAnnulledSnapshot: sc.snapshot!,
        }));

      const fakePrisma = {
        questionAttempt: {
          findMany: vi.fn().mockResolvedValueOnce(rawPrismaAttempts).mockResolvedValueOnce([]),
        },
        simulationQuestion: {
          findMany: vi.fn().mockResolvedValue(simulationQuestionsInDb),
        },
      } as any;

      const parityPrismaRepo = new PrismaEducationalAnalyticsRepository(fakePrisma);
      const prismaResults: QuestionAttemptWithMetadata[] = [];
      await parityPrismaRepo.processQuestionAttemptsInBatches(USER_A, (batch) => {
        prismaResults.push(...batch);
      });

      // Validação de paridade elemento a elemento
      expect(mockResults).toHaveLength(scenarios.length);
      expect(prismaResults).toHaveLength(scenarios.length);

      for (let i = 0; i < scenarios.length; i++) {
        const sc = scenarios[i];
        const mockItem = mockResults.find((m) => m.id === `att-${sc.id}`);
        const prismaItem = prismaResults.find((p) => p.id === `att-${sc.id}`);

        expect(mockItem).toBeDefined();
        expect(prismaItem).toBeDefined();

        // Ambos devem produzir exatamente o valor esperado
        expect(mockItem?.isAnnulled).toBe(sc.expected);
        expect(prismaItem?.isAnnulled).toBe(sc.expected);

        // Paridade estrita Mock === Prisma
        expect(mockItem?.isAnnulled).toBe(prismaItem?.isAnnulled);
      }
    });
  });
});
