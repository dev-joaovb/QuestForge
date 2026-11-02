/**
 * QuestForge — Camada de Analytics Educacional (Sprint 9.1)
 *
 * Contratos de tipos, DTOs e funções utilitárias matemáticas para agregação estatística
 * do estudante a partir de dados reais persistidos no PostgreSQL via Prisma.
 *
 * Regras estritas:
 * - Sem PII (Personally Identifiable Information): nomes, e-mails, senhas e tokens são omitidos.
 * - Precisão matemática ponderada: acertos / total respondido (nunca média de médias).
 * - Sem divisão por zero: valores protegidos contra NaN e Infinity.
 * - Limiares explícitos e documentados de suficiência amostral.
 */

export const MIN_QUESTIONS_FOR_DESCRIPTIVE_STATS = 5;
export const MIN_SIMULATIONS_FOR_TREND_ANALYSIS = 2;
export const MIN_QUESTIONS_PER_SUBJECT_FOR_RELIABILITY = 5;
export const MIN_SIMULATIONS_FOR_DEEP_ANALYSIS = 3;

/**
 * Erro de domínio da camada de Analytics Educacional.
 */
export class EducationalAnalyticsDomainError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(code: string, message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = 'EducationalAnalyticsDomainError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Direção da tendência temporal de desempenho do estudante.
 */
export type TrendDirection = 'IMPROVING' | 'STABLE' | 'DECLINING' | 'INSUFFICIENT_DATA';

/**
 * Dificuldade das questões catalogadas ou não especificadas.
 */
export type QuestionDifficultyCategory = 'EASY' | 'MEDIUM' | 'HARD' | 'UNSPECIFIED';

/**
 * Agregação de desempenho por disciplina.
 */
export interface SubjectPerformanceItemDTO {
  subject: string;
  totalAnswered: number;
  correctCount: number;
  wrongCount: number;
  accuracyPercentage: number;
  averageTimeSpentSeconds: number | null;
  isReliable: boolean;
}

/**
 * Agregação de desempenho por nível de dificuldade.
 */
export interface DifficultyPerformanceItemDTO {
  difficulty: QuestionDifficultyCategory;
  totalAnswered: number;
  correctCount: number;
  wrongCount: number;
  accuracyPercentage: number;
}

/**
 * Tendência temporal de evolução de notas em simulados concluídos.
 */
export interface TemporalTrendDTO {
  direction: TrendDirection;
  recentAverageScore: number | null;
  historicalAverageScore: number | null;
  deltaPercentage: number | null;
  completedSimulationsEvaluated: number;
}

/**
 * Métricas de consistência de estudo e engajamento.
 */
export interface StudyConsistencyDTO {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  completedSimulationsCount: number;
  totalStudyActivitiesCount: number;
}

/**
 * Avaliação da suficiência amostral para análise estatística e diagnósticos de IA.
 */
export interface SampleSufficiencyDTO {
  totalAnsweredQuestions: number;
  completedSimulationsCount: number;
  hasMinQuestionsForDescriptiveStats: boolean;
  hasMinSimulationsForTrend: boolean;
  isSufficientForDeepAnalysis: boolean;
  insufficientDataReasons: string[];
}

/**
 * Estatísticas globais consolidadas do estudante.
 */
export interface GlobalStudentStatsDTO {
  completedSimulationsCount: number;
  totalAnsweredQuestions: number;
  totalCorrectAnswers: number;
  totalWrongAnswers: number;
  globalAccuracyPercentage: number;
  averageSimulationScore: number | null;
  averageTimeSpentPerQuestionSeconds: number | null;
  totalDurationSeconds: number;
}

/**
 * DTO consolidado do perfil estatístico educacional (Sprint 9.1).
 * Destinado a subsidiar o motor de IA da Sprint 9.2 sem exposição de PII.
 */
export interface EducationalStudentStatsDTO {
  globalStats: GlobalStudentStatsDTO;
  subjectPerformance: SubjectPerformanceItemDTO[];
  difficultyPerformance: DifficultyPerformanceItemDTO[];
  temporalTrend: TemporalTrendDTO;
  consistency: StudyConsistencyDTO;
  sampleSufficiency: SampleSufficiencyDTO;
}

/**
 * Modelo intermediário de simulado concluído retornado pelo repositório.
 */
export interface CompletedSimulationMetric {
  id: string;
  scorePercentage: number | null;
  correctCount: number | null;
  wrongCount: number | null;
  durationSeconds: number | null;
  finishedAt: Date | null;
}

/**
 * Modelo intermediário de tentativa de questão com metadados da questão associada.
 */
export interface QuestionAttemptWithMetadata {
  id: string;
  isCorrect: boolean | null;
  timeSpentSeconds: number | null;
  answeredAt: Date | null;
  question: {
    subject: string | null;
    difficulty: string | null;
    topic: string | null;
  };
}

/**
 * Interface do repositório de analytics educacional (somente leitura).
 */
export interface IEducationalAnalyticsRepository {
  /**
   * Obtém os simulados concluídos (COMPLETED) do usuário, ordenados por data de conclusão (finishedAt asc).
   */
  getCompletedSimulations(userId: string, limit?: number): Promise<CompletedSimulationMetric[]>;

  /**
   * Obtém as tentativas de questões realizadas pelo usuário em simulados concluídos,
   * incluindo os metadados da questão (disciplina, dificuldade).
   */
  getQuestionAttemptsWithMetadata(userId: string): Promise<QuestionAttemptWithMetadata[]>;

  /**
   * Obtém dados consolidados de sequência (streak) e contagem total de atividades de estudo registradas.
   */
  getStreakAndActivityMetrics(userId: string): Promise<{
    currentStreak: number;
    longestStreak: number;
    lastActivityDate: string | null;
    totalActivities: number;
  }>;
}

/**
 * Utilitário puro para cálculo de precisão percentual com proteção estrita contra NaN e Infinity.
 *
 * Fórmula: (correctCount / totalAnswered) * 100
 * Retorna valor no intervalo [0, 100] com 1 casa decimal. Se total <= 0, retorna 0.
 */
export function calculateAccuracyPercentage(correctCount: number, totalAnswered: number): number {
  if (
    typeof correctCount !== 'number' ||
    typeof totalAnswered !== 'number' ||
    Number.isNaN(correctCount) ||
    Number.isNaN(totalAnswered) ||
    totalAnswered <= 0
  ) {
    return 0;
  }
  const ratio = (correctCount / totalAnswered) * 100;
  const clamped = Math.max(0, Math.min(100, ratio));
  return Math.round(clamped * 10) / 10;
}

/**
 * Utilitário puro para cálculo determinístico da tendência temporal.
 *
 * Regras:
 * - Menos de MIN_SIMULATIONS_FOR_TREND_ANALYSIS (2) simulados concluídos: retorna 'INSUFFICIENT_DATA'.
 * - 2 a 4 simulados: compara a última simulação com a média das simulações anteriores.
 * - 5+ simulados: compara a média dos últimos 3 simulados com a média dos anteriores (até 5).
 * - Threshold de sensibilidade:
 *     delta > +3.0%  => 'IMPROVING'
 *     delta < -3.0%  => 'DECLINING'
 *     caso contrário => 'STABLE'
 */
export function determineTemporalTrend(
  simulations: Array<{ scorePercentage: number | null; finishedAt: Date | null }>
): TemporalTrendDTO {
  // Filtra apenas simulados com nota válida (number !== null e não NaN)
  const validSimulations = simulations.filter(
    (s): s is { scorePercentage: number; finishedAt: Date | null } =>
      typeof s.scorePercentage === 'number' && !Number.isNaN(s.scorePercentage)
  );

  if (validSimulations.length < MIN_SIMULATIONS_FOR_TREND_ANALYSIS) {
    return {
      direction: 'INSUFFICIENT_DATA',
      recentAverageScore: validSimulations.length === 1 ? Math.round(validSimulations[0].scorePercentage * 10) / 10 : null,
      historicalAverageScore: null,
      deltaPercentage: null,
      completedSimulationsEvaluated: validSimulations.length,
    };
  }

  let recentScores: number[];
  let historicalScores: number[];

  if (validSimulations.length < 5) {
    // 2 a 4 simulados: o mais recente vs média dos anteriores
    recentScores = [validSimulations[validSimulations.length - 1].scorePercentage];
    historicalScores = validSimulations.slice(0, validSimulations.length - 1).map((s) => s.scorePercentage);
  } else {
    // 5 ou mais: janela recente dos últimos 3 vs janela anterior (até 5 simulados anteriores)
    recentScores = validSimulations.slice(-3).map((s) => s.scorePercentage);
    historicalScores = validSimulations.slice(-8, -3).map((s) => s.scorePercentage);
  }

  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((sum, n) => sum + n, 0) / arr.length : 0);
  const recentAvg = Math.round(avg(recentScores) * 10) / 10;
  const historicalAvg = Math.round(avg(historicalScores) * 10) / 10;
  const delta = Math.round((recentAvg - historicalAvg) * 10) / 10;

  let direction: TrendDirection = 'STABLE';
  if (delta > 3.0) {
    direction = 'IMPROVING';
  } else if (delta < -3.0) {
    direction = 'DECLINING';
  }

  return {
    direction,
    recentAverageScore: recentAvg,
    historicalAverageScore: historicalAvg,
    deltaPercentage: delta,
    completedSimulationsEvaluated: validSimulations.length,
  };
}
