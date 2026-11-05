/**
 * QuestForge — Camada de Analytics Educacional (Sprint 9.1 / 9.1.1)
 *
 * Contratos de tipos, DTOs e funções utilitárias matemáticas para agregação estatística
 * do estudante a partir de dados reais persistidos no PostgreSQL via Prisma.
 *
 * Regras estritas:
 * - Sem PII (Personally Identifiable Information): nomes, e-mails, senhas e tokens são omitidos.
 * - Precisão matemática ponderada: acertos / total respondido (nunca média de médias).
 * - Sem divisão por zero: valores protegidos contra NaN e Infinity.
 * - Limiares explícitos e documentados de suficiência amostral.
 * - Distinção formal entre pontuação oficial de concursos e acurácia pedagógica demonstrada.
 * - Normalização canônica e estável de nomes de disciplinas.
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
 * Agregação de desempenho pedagógico por disciplina.
 *
 * Baseada estritamente em questões ativamente resolvidas pelo estudante.
 * Questões não respondidas ou anuladas sem resolução ativa não distorcem
 * o percentual de domínio do conteúdo.
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
 * Agregação de desempenho pedagógico por nível de dificuldade.
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
 *
 * Formaliza a distinção entre:
 * 1. Pontuação oficial do simulado (regras de concurso onde anulações podem somar pontos ao exame).
 * 2. Domínio pedagógico demonstrado (acertos reais comprovados em respostas ativas).
 */
export interface GlobalStudentStatsDTO {
  completedSimulationsCount: number;
  // --- Métricas Oficiais de Exames / Simulados ---
  averageSimulationScore: number | null;
  officialTotalPoints: number; // Soma de correctCount nos simulados concluídos (inclui bônus oficial de anulações)
  // --- Métricas Pedagógicas Demonstradas (ACH-02) ---
  pedagogicalAnsweredQuestions: number; // Questões efetivamente respondidas com alternativa
  pedagogicalCorrectAnswers: number; // Questões acertadas por mérito demonstrado
  pedagogicalWrongAnswers: number; // Questões erradas
  pedagogicalAccuracyPercentage: number; // (pedagogicalCorrectAnswers / pedagogicalAnsweredQuestions) * 100
  // --- Campos mantidos para compatibilidade retroativa ---
  totalAnsweredQuestions: number;
  totalCorrectAnswers: number;
  totalWrongAnswers: number;
  globalAccuracyPercentage: number;
  averageTimeSpentPerQuestionSeconds: number | null;
  totalDurationSeconds: number;
}

/**
 * DTO consolidado do perfil estatístico educacional (Sprint 9.1 / 9.1.1).
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
 * Modelo intermediário de tentativa de questão com metadados da questão associada e status de anulação (Sprint 9.5.1).
 */
export interface QuestionAttemptWithMetadata {
  id: string;
  simulationId: string;
  questionId: string;
  isCorrect: boolean | null;
  timeSpentSeconds: number | null;
  answeredAt: Date | null;
  isAnnulled?: boolean;
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
   * Processa todas as tentativas de questões em lotes paginados estáveis (ACH-01),
   * garantindo uso limitado e constante de memória sem descartar histórico.
   */
  processQuestionAttemptsInBatches(
    userId: string,
    onBatch: (batch: QuestionAttemptWithMetadata[]) => Promise<void> | void,
    batchSize?: number
  ): Promise<number>;

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
 * Normaliza o nome da disciplina para agrupamento determinístico e insensível a capitalização/espaços (ACH-04).
 *
 * Regras:
 * - Remove espaços extras no início, fim e entre palavras.
 * - Cria chave minúscula única para comparação (ex: "direito constitucional").
 * - Constrói um rótulo canônico com Title Case determinístico em português (preserva preposições em minúsculas).
 * - Preserva acentos ortográficos (ex: "Língua Portuguesa").
 * - Retorna "Não classificada" para valores nulos, vazios ou apenas espaços.
 */
export function normalizeSubjectKey(rawSubject: string | null | undefined): {
  normalizedKey: string;
  displayLabel: string;
} {
  if (!rawSubject || typeof rawSubject !== 'string') {
    return { normalizedKey: 'nao_classificada', displayLabel: 'Não classificada' };
  }

  const clean = rawSubject.trim().replace(/\s+/g, ' ');
  if (!clean) {
    return { normalizedKey: 'nao_classificada', displayLabel: 'Não classificada' };
  }

  const normalizedKey = clean.toLowerCase();

  // Conectivos comuns em pt-BR que devem permanecer em minúsculas quando intermediários
  const minorWords = new Set([
    'de', 'da', 'do', 'das', 'dos', 'em', 'e', 'para', 'com', 'por', 'a', 'o', 'as', 'os'
  ]);

  const words = clean.split(' ');
  const displayLabel = words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && minorWords.has(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');

  return {
    normalizedKey,
    displayLabel,
  };
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
