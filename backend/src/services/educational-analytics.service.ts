import {
  type EducationalStudentStatsDTO,
  type IEducationalAnalyticsRepository,
  type SubjectPerformanceItemDTO,
  type DifficultyPerformanceItemDTO,
  type QuestionDifficultyCategory,
  EducationalAnalyticsDomainError,
  calculateAccuracyPercentage,
  determineTemporalTrend,
  MIN_QUESTIONS_FOR_DESCRIPTIVE_STATS,
  MIN_SIMULATIONS_FOR_TREND_ANALYSIS,
  MIN_QUESTIONS_PER_SUBJECT_FOR_RELIABILITY,
  MIN_SIMULATIONS_FOR_DEEP_ANALYSIS,
} from '../types/educational-analytics.types.ts';
import { PrismaEducationalAnalyticsRepository } from '../repositories/educational-analytics.repository.ts';

export interface EducationalAnalyticsServiceDependencies {
  educationalAnalyticsRepository?: IEducationalAnalyticsRepository;
}

/**
 * Serviço de Analytics Educacional (Sprint 9.1).
 *
 * Responsável por computar e agregar o perfil estatístico de desempenho do estudante
 * a partir de dados reais persistidos no PostgreSQL, sem mutações e sem exposição de PII.
 */
export class EducationalAnalyticsService {
  private readonly repository: IEducationalAnalyticsRepository;

  constructor(deps: EducationalAnalyticsServiceDependencies = {}) {
    this.repository =
      deps.educationalAnalyticsRepository ?? new PrismaEducationalAnalyticsRepository();
  }

  /**
   * Computa e retorna o perfil analítico consolidado do estudante.
   *
   * @param userId Identificador único do estudante autenticado.
   * @throws EducationalAnalyticsDomainError caso o userId seja inválido ou vazio.
   */
  async getStudentAnalytics(userId: string): Promise<EducationalStudentStatsDTO> {
    const cleanId = userId?.trim();
    if (!cleanId) {
      throw new EducationalAnalyticsDomainError(
        'INVALID_USER_ID',
        'Identificador de usuário obrigatório para consulta de analytics educacional.',
        400
      );
    }

    // Consulta paralela ao banco de dados com isolamento estrito
    const [completedSimulations, questionAttempts, metrics] = await Promise.all([
      this.repository.getCompletedSimulations(cleanId),
      this.repository.getQuestionAttemptsWithMetadata(cleanId),
      this.repository.getStreakAndActivityMetrics(cleanId),
    ]);

    // 1. Estatísticas Globais
    let totalCorrectAnswers = 0;
    let totalWrongAnswers = 0;
    let totalDurationSeconds = 0;
    const simulationScores: number[] = [];

    for (const sim of completedSimulations) {
      totalCorrectAnswers += sim.correctCount ?? 0;
      totalWrongAnswers += sim.wrongCount ?? 0;
      totalDurationSeconds += sim.durationSeconds ?? 0;
      if (typeof sim.scorePercentage === 'number' && !Number.isNaN(sim.scorePercentage)) {
        simulationScores.push(sim.scorePercentage);
      }
    }

    const totalAnsweredQuestions = totalCorrectAnswers + totalWrongAnswers;
    const globalAccuracyPercentage = calculateAccuracyPercentage(
      totalCorrectAnswers,
      totalAnsweredQuestions
    );

    const averageSimulationScore =
      simulationScores.length > 0
        ? Math.round(
            (simulationScores.reduce((sum, score) => sum + score, 0) /
              simulationScores.length) *
              10
          ) / 10
        : null;

    // Tempo médio gasto por questão respondida
    const validTimes = questionAttempts
      .map((qa) => qa.timeSpentSeconds)
      .filter((t): t is number => typeof t === 'number' && t > 0);

    const averageTimeSpentPerQuestionSeconds =
      validTimes.length > 0
        ? Math.round(validTimes.reduce((sum, t) => sum + t, 0) / validTimes.length)
        : null;

    // 2. Desempenho por Disciplina
    const subjectMap = new Map<
      string,
      {
        totalAnswered: number;
        correctCount: number;
        wrongCount: number;
        timeSpentList: number[];
      }
    >();

    for (const attempt of questionAttempts) {
      if (attempt.isCorrect === null || attempt.isCorrect === undefined) {
        // Questões não respondidas ou pendentes não afetam a taxa de acertos da disciplina
        continue;
      }

      const rawSubject = attempt.question.subject?.trim();
      const subject = rawSubject && rawSubject.length > 0 ? rawSubject : 'Não classificada';

      let stats = subjectMap.get(subject);
      if (!stats) {
        stats = {
          totalAnswered: 0,
          correctCount: 0,
          wrongCount: 0,
          timeSpentList: [],
        };
        subjectMap.set(subject, stats);
      }

      stats.totalAnswered += 1;
      if (attempt.isCorrect === true) {
        stats.correctCount += 1;
      } else {
        stats.wrongCount += 1;
      }

      if (typeof attempt.timeSpentSeconds === 'number' && attempt.timeSpentSeconds > 0) {
        stats.timeSpentList.push(attempt.timeSpentSeconds);
      }
    }

    const subjectPerformance: SubjectPerformanceItemDTO[] = Array.from(subjectMap.entries())
      .map(([subject, stats]) => {
        const accuracy = calculateAccuracyPercentage(stats.correctCount, stats.totalAnswered);
        const avgTime =
          stats.timeSpentList.length > 0
            ? Math.round(
                stats.timeSpentList.reduce((sum, t) => sum + t, 0) /
                  stats.timeSpentList.length
              )
            : null;

        return {
          subject,
          totalAnswered: stats.totalAnswered,
          correctCount: stats.correctCount,
          wrongCount: stats.wrongCount,
          accuracyPercentage: accuracy,
          averageTimeSpentSeconds: avgTime,
          isReliable: stats.totalAnswered >= MIN_QUESTIONS_PER_SUBJECT_FOR_RELIABILITY,
        };
      })
      .sort((a, b) => {
        if (b.totalAnswered !== a.totalAnswered) {
          return b.totalAnswered - a.totalAnswered;
        }
        return a.subject.localeCompare(b.subject);
      });

    // 3. Desempenho por Nível de Dificuldade
    const difficultyBuckets: Record<
      QuestionDifficultyCategory,
      { totalAnswered: number; correctCount: number; wrongCount: number }
    > = {
      EASY: { totalAnswered: 0, correctCount: 0, wrongCount: 0 },
      MEDIUM: { totalAnswered: 0, correctCount: 0, wrongCount: 0 },
      HARD: { totalAnswered: 0, correctCount: 0, wrongCount: 0 },
      UNSPECIFIED: { totalAnswered: 0, correctCount: 0, wrongCount: 0 },
    };

    for (const attempt of questionAttempts) {
      if (attempt.isCorrect === null || attempt.isCorrect === undefined) {
        continue;
      }

      let category: QuestionDifficultyCategory = 'UNSPECIFIED';
      const rawDifficulty = attempt.question.difficulty?.toUpperCase();
      if (rawDifficulty === 'EASY' || rawDifficulty === 'MEDIUM' || rawDifficulty === 'HARD') {
        category = rawDifficulty;
      }

      const bucket = difficultyBuckets[category];
      bucket.totalAnswered += 1;
      if (attempt.isCorrect === true) {
        bucket.correctCount += 1;
      } else {
        bucket.wrongCount += 1;
      }
    }

    const standardDifficulties: QuestionDifficultyCategory[] = [
      'EASY',
      'MEDIUM',
      'HARD',
      'UNSPECIFIED',
    ];

    const difficultyPerformance: DifficultyPerformanceItemDTO[] = standardDifficulties.map(
      (difficulty) => {
        const bucket = difficultyBuckets[difficulty];
        return {
          difficulty,
          totalAnswered: bucket.totalAnswered,
          correctCount: bucket.correctCount,
          wrongCount: bucket.wrongCount,
          accuracyPercentage: calculateAccuracyPercentage(
            bucket.correctCount,
            bucket.totalAnswered
          ),
        };
      }
    );

    // 4. Tendência Temporal
    const temporalTrend = determineTemporalTrend(
      completedSimulations.map((s) => ({
        scorePercentage: s.scorePercentage,
        finishedAt: s.finishedAt,
      }))
    );

    // 5. Consistência e Engajamento
    const consistency = {
      currentStreak: metrics.currentStreak,
      longestStreak: metrics.longestStreak,
      lastActivityDate: metrics.lastActivityDate,
      completedSimulationsCount: completedSimulations.length,
      totalStudyActivitiesCount: metrics.totalActivities,
    };

    // 6. Suficiência Amostral
    const hasMinQuestionsForDescriptiveStats =
      totalAnsweredQuestions >= MIN_QUESTIONS_FOR_DESCRIPTIVE_STATS;
    const hasMinSimulationsForTrend =
      completedSimulations.length >= MIN_SIMULATIONS_FOR_TREND_ANALYSIS;
    const isSufficientForDeepAnalysis =
      hasMinQuestionsForDescriptiveStats &&
      completedSimulations.length >= MIN_SIMULATIONS_FOR_DEEP_ANALYSIS;

    const insufficientDataReasons: string[] = [];
    if (!hasMinQuestionsForDescriptiveStats) {
      insufficientDataReasons.push(
        `Necessário responder pelo menos ${MIN_QUESTIONS_FOR_DESCRIPTIVE_STATS} questões para gerar estatísticas descritivas (atualmente: ${totalAnsweredQuestions}).`
      );
    }
    if (!hasMinSimulationsForTrend) {
      insufficientDataReasons.push(
        `Necessário concluir pelo menos ${MIN_SIMULATIONS_FOR_TREND_ANALYSIS} simulados para identificar tendências de evolução (atualmente: ${completedSimulations.length}).`
      );
    }
    if (
      !isSufficientForDeepAnalysis &&
      hasMinQuestionsForDescriptiveStats &&
      hasMinSimulationsForTrend
    ) {
      insufficientDataReasons.push(
        `Necessário concluir pelo menos ${MIN_SIMULATIONS_FOR_DEEP_ANALYSIS} simulados para diagnósticos aprofundados de IA (atualmente: ${completedSimulations.length}).`
      );
    }

    const sampleSufficiency = {
      totalAnsweredQuestions,
      completedSimulationsCount: completedSimulations.length,
      hasMinQuestionsForDescriptiveStats,
      hasMinSimulationsForTrend,
      isSufficientForDeepAnalysis,
      insufficientDataReasons,
    };

    return {
      globalStats: {
        completedSimulationsCount: completedSimulations.length,
        totalAnsweredQuestions,
        totalCorrectAnswers,
        totalWrongAnswers,
        globalAccuracyPercentage,
        averageSimulationScore,
        averageTimeSpentPerQuestionSeconds,
        totalDurationSeconds,
      },
      subjectPerformance,
      difficultyPerformance,
      temporalTrend,
      consistency,
      sampleSufficiency,
    };
  }
}
