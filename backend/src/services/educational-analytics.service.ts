import {
  type EducationalStudentStatsDTO,
  type IEducationalAnalyticsRepository,
  type SubjectPerformanceItemDTO,
  type DifficultyPerformanceItemDTO,
  type QuestionDifficultyCategory,
  EducationalAnalyticsDomainError,
  calculateAccuracyPercentage,
  determineTemporalTrend,
  normalizeSubjectKey,
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
 * Serviço de Analytics Educacional (Sprint 9.1 / 9.1.1).
 *
 * Responsável por computar e agregar o perfil estatístico de desempenho do estudante
 * a partir de dados reais persistidos no PostgreSQL, sem mutações e sem exposição de PII.
 *
 * Refinamentos da Sprint 9.1.1:
 * - ACH-01: Processamento em lotes estáveis (processQuestionAttemptsInBatches),
 *   garantindo memória constante sem descartar histórico.
 * - ACH-02: Distinção formal e desacoplamento entre pontuação oficial do exame
 *   (regras de concurso) e acurácia pedagógica demonstrada (respostas reais).
 * - ACH-04: Normalização determinística e canônica de disciplinas, unificando variações
 *   de caixa ("Direito Constitucional", "direito constitucional") e espaçamentos múltiplos.
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

    // 1. Consulta paralela: simulados concluídos e métricas de streak/atividades
    const [completedSimulations, metrics] = await Promise.all([
      this.repository.getCompletedSimulations(cleanId),
      this.repository.getStreakAndActivityMetrics(cleanId),
    ]);

    // 2. Apuração oficial de simulados
    let officialTotalPoints = 0;
    let simTotalWrong = 0;
    let totalDurationSeconds = 0;
    const simulationScores: number[] = [];

    for (const sim of completedSimulations) {
      officialTotalPoints += sim.correctCount ?? 0;
      simTotalWrong += sim.wrongCount ?? 0;
      totalDurationSeconds += sim.durationSeconds ?? 0;
      if (typeof sim.scorePercentage === 'number' && !Number.isNaN(sim.scorePercentage)) {
        simulationScores.push(sim.scorePercentage);
      }
    }

    const averageSimulationScore =
      simulationScores.length > 0
        ? Math.round(
            (simulationScores.reduce((sum, score) => sum + score, 0) /
              simulationScores.length) *
              10
          ) / 10
        : null;

    // 3. Estruturas para apuração pedagógica e agrupamentos via processamento em lotes (ACH-01)
    let pedagogicalAnsweredQuestions = 0;
    let pedagogicalCorrectAnswers = 0;
    let pedagogicalWrongAnswers = 0;

    let timeSpentSecondsSum = 0;
    let timeSpentCount = 0;

    const subjectMap = new Map<
      string,
      {
        displayLabel: string;
        totalAnswered: number;
        correctCount: number;
        wrongCount: number;
        timeSpentSum: number;
        timeSpentCount: number;
      }
    >();

    const difficultyBuckets: Record<
      QuestionDifficultyCategory,
      { totalAnswered: number; correctCount: number; wrongCount: number }
    > = {
      EASY: { totalAnswered: 0, correctCount: 0, wrongCount: 0 },
      MEDIUM: { totalAnswered: 0, correctCount: 0, wrongCount: 0 },
      HARD: { totalAnswered: 0, correctCount: 0, wrongCount: 0 },
      UNSPECIFIED: { totalAnswered: 0, correctCount: 0, wrongCount: 0 },
    };

    // Processamento incremental em lotes estáveis (ACH-01)
    await this.repository.processQuestionAttemptsInBatches(
      cleanId,
      (batch) => {
        for (const attempt of batch) {
          if (attempt.isCorrect === null || attempt.isCorrect === undefined) {
            // Questões não respondidas ou deixadas em branco não constituem resposta pedagógica
            continue;
          }

          // Sprint 9.5.1 & Sprint 10.1 (ACH-SEC-01):
          // Apenas questões comprovadamente regulares (isAnnulled === false) são contabilizadas
          // nas métricas de domínio pedagógico demonstrado (acurácia, disciplinas e dificuldades).
          // - Se isAnnulled === true: questão anulada oficialmente (bonificação não reflete mérito pedagógico demonstrado).
          // - Se isAnnulled === null ou undefined: estado desconhecido / ausência de snapshot de anulação confiável.
          // Em ambos os casos, a tentativa é neutralizada conservadoramente e não pontua nem conta no total pedagógico.
          if (attempt.isAnnulled !== false) {
            continue;
          }

          // Métricas pedagógicas gerais (ACH-02)
          pedagogicalAnsweredQuestions += 1;
          if (attempt.isCorrect === true) {
            pedagogicalCorrectAnswers += 1;
          } else {
            pedagogicalWrongAnswers += 1;
          }

          if (typeof attempt.timeSpentSeconds === 'number' && attempt.timeSpentSeconds > 0) {
            timeSpentSecondsSum += attempt.timeSpentSeconds;
            timeSpentCount += 1;
          }

          // Agrupamento por disciplina normalizada (ACH-04)
          const { normalizedKey, displayLabel } = normalizeSubjectKey(attempt.question.subject);
          let subjectStats = subjectMap.get(normalizedKey);
          if (!subjectStats) {
            subjectStats = {
              displayLabel,
              totalAnswered: 0,
              correctCount: 0,
              wrongCount: 0,
              timeSpentSum: 0,
              timeSpentCount: 0,
            };
            subjectMap.set(normalizedKey, subjectStats);
          }

          subjectStats.totalAnswered += 1;
          if (attempt.isCorrect === true) {
            subjectStats.correctCount += 1;
          } else {
            subjectStats.wrongCount += 1;
          }

          if (typeof attempt.timeSpentSeconds === 'number' && attempt.timeSpentSeconds > 0) {
            subjectStats.timeSpentSum += attempt.timeSpentSeconds;
            subjectStats.timeSpentCount += 1;
          }

          // Agrupamento por dificuldade
          let category: QuestionDifficultyCategory = 'UNSPECIFIED';
          const rawDifficulty = attempt.question.difficulty?.toUpperCase();
          if (rawDifficulty === 'EASY' || rawDifficulty === 'MEDIUM' || rawDifficulty === 'HARD') {
            category = rawDifficulty;
          }

          const diffBucket = difficultyBuckets[category];
          diffBucket.totalAnswered += 1;
          if (attempt.isCorrect === true) {
            diffBucket.correctCount += 1;
          } else {
            diffBucket.wrongCount += 1;
          }
        }
      },
      1000
    );

    // 4. Taxas pedagógicas e conciliação de compatibilidade
    const pedagogicalAccuracyPercentage = calculateAccuracyPercentage(
      pedagogicalCorrectAnswers,
      pedagogicalAnsweredQuestions
    );

    // Em cenários de históricos sem tentativas tabuladas, recorre aos totais de simulados
    const totalAnsweredQuestions =
      pedagogicalAnsweredQuestions > 0
        ? pedagogicalAnsweredQuestions
        : officialTotalPoints + simTotalWrong;

    const totalCorrectAnswers =
      pedagogicalAnsweredQuestions > 0 ? pedagogicalCorrectAnswers : officialTotalPoints;

    const totalWrongAnswers =
      pedagogicalAnsweredQuestions > 0 ? pedagogicalWrongAnswers : simTotalWrong;

    const globalAccuracyPercentage =
      pedagogicalAnsweredQuestions > 0
        ? pedagogicalAccuracyPercentage
        : calculateAccuracyPercentage(totalCorrectAnswers, totalAnsweredQuestions);

    const averageTimeSpentPerQuestionSeconds =
      timeSpentCount > 0 ? Math.round(timeSpentSecondsSum / timeSpentCount) : null;

    // 5. Desempenho por Disciplina formatado
    const subjectPerformance: SubjectPerformanceItemDTO[] = Array.from(subjectMap.values())
      .map((stats) => {
        const accuracy = calculateAccuracyPercentage(stats.correctCount, stats.totalAnswered);
        const avgTime =
          stats.timeSpentCount > 0
            ? Math.round(stats.timeSpentSum / stats.timeSpentCount)
            : null;

        return {
          subject: stats.displayLabel,
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

    // 6. Desempenho por Nível de Dificuldade
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

    // 7. Tendência Temporal
    const temporalTrend = determineTemporalTrend(
      completedSimulations.map((s) => ({
        scorePercentage: s.scorePercentage,
        finishedAt: s.finishedAt,
      }))
    );

    // 8. Consistência e Engajamento
    const consistency = {
      currentStreak: metrics.currentStreak,
      longestStreak: metrics.longestStreak,
      lastActivityDate: metrics.lastActivityDate,
      completedSimulationsCount: completedSimulations.length,
      totalStudyActivitiesCount: metrics.totalActivities,
    };

    // 9. Suficiência Amostral
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
        averageSimulationScore,
        officialTotalPoints,
        pedagogicalAnsweredQuestions,
        pedagogicalCorrectAnswers,
        pedagogicalWrongAnswers,
        pedagogicalAccuracyPercentage,
        totalAnsweredQuestions,
        totalCorrectAnswers,
        totalWrongAnswers,
        globalAccuracyPercentage,
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
