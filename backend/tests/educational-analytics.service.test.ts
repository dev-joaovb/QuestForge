import { describe, it, expect, beforeEach } from 'vitest';
import { EducationalAnalyticsService } from '../src/services/educational-analytics.service.ts';
import {
  MockEducationalAnalyticsRepository,
  type MockSimulationItem,
  type MockQuestionAttemptItem,
} from '../src/repositories/educational-analytics.repository.ts';
import {
  EducationalAnalyticsDomainError,
  calculateAccuracyPercentage,
  determineTemporalTrend,
} from '../src/types/educational-analytics.types.ts';

describe('EducationalAnalyticsService & Aggregation (Sprint 9.1)', () => {
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
      // Simulado 1: 1 acerto de 1 questão (100%)
      // Simulado 2: 0 acertos de 9 questões (0%)
      // Média de médias seria (100 + 0) / 2 = 50%.
      // Precisão real ponderada é 1 / 10 = 10.0%.
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

      const result = await service.getStudentAnalytics(USER_A);

      expect(result.globalStats.totalCorrectAnswers).toBe(1);
      expect(result.globalStats.totalAnsweredQuestions).toBe(10);
      expect(result.globalStats.globalAccuracyPercentage).toBe(10.0);
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
      // 3 simulados: notas 60%, 70%, 85%
      // recent = 85%, historical = média(60, 70) = 65%
      // delta = +20% > 3% => IMPROVING
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
      // 3 simulados: notas 90%, 80%, 65%
      // recent = 65%, historical = média(90, 80) = 85%
      // delta = -20% < -3% => DECLINING
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
      // Notas: 70%, 72% => delta = +2% <= +3%
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

      // Tentativas do simulado IN_PROGRESS não devem entrar na agregação de questões
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
      expect(result.globalStats.totalAnsweredQuestions).toBe(10); // Apenas do simulado concluído
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
      expect(math?.averageTimeSpentSeconds).toBe(55); // (40 + 60 + 50 + 70) / 4 = 55s
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
      expect(statsA.globalStats.totalCorrectAnswers).toBe(9);
      expect(statsA.consistency.currentStreak).toBe(5);
      expect(statsA.consistency.totalStudyActivitiesCount).toBe(12);

      expect(statsB.globalStats.completedSimulationsCount).toBe(1);
      expect(statsB.globalStats.totalCorrectAnswers).toBe(3);
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

      // Verifica no nível das subestruturas
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
});
