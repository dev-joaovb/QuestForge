import type { StudyActivityDTO } from './activity.types.ts';

/**
 * Erro de domínio da camada de Dashboard.
 */
export class DashboardDomainError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(code: string, message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = 'DashboardDomainError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Dados brutos de agregação de simulados concluídos no banco de dados.
 */
export interface SimulationAggregationRaw {
  completedCount: number;
  totalCorrect: number;
  totalWrong: number;
  totalDurationSeconds: number;
}

/**
 * Ponto individual de evolução na série temporal de simulados concluídos.
 */
export interface SimulationEvolutionPointDTO {
  id: string;
  title: string | null;
  scorePercentage: number | null;
  correctCount: number;
  wrongCount: number;
  totalQuestions: number;
  durationSeconds: number | null;
  finishedAt: Date | null;
}

/**
 * DTO consolidado do resumo executivo do Dashboard (Sprint 8.1).
 *
 * Todas as métricas são derivadas estritamente de dados reais persistidos:
 * - completedSimulationsCount: Contagem estrita de simulados com status COMPLETED.
 * - totalAnsweredQuestions: Soma ponderada de (correctCount + wrongCount) em simulados COMPLETED.
 * - totalCorrectAnswers: Soma de correctCount em simulados COMPLETED.
 * - totalWrongAnswers: Soma de wrongCount em simulados COMPLETED.
 * - accuracyPercentage: Taxa ponderada real totalCorrect / (totalCorrect + totalWrong) * 100, arredondada a 1 casa decimal.
 * - totalDurationSeconds: Soma de durationSeconds em simulados COMPLETED (em segundos).
 * - currentStreak: Dias consecutivos de atividade em calendário UTC (ou 0 se sem atividade).
 * - longestStreak: Maior sequência histórica de dias (ou 0 se sem atividade).
 * - lastActivityDate: Data da última atividade em formato UTC (YYYY-MM-DD) ou null.
 * - recentSimulationsEvolution: Até 10 simulados mais recentes, ordenados cronologicamente (finishedAt asc, id asc).
 * - recentActivities: Até 5 atividades mais recentes do estudante, ordenadas por (completedAt desc, id desc).
 */
export interface DashboardSummaryDTO {
  completedSimulationsCount: number;
  totalAnsweredQuestions: number;
  totalCorrectAnswers: number;
  totalWrongAnswers: number;
  accuracyPercentage: number;
  totalDurationSeconds: number;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  recentSimulationsEvolution: SimulationEvolutionPointDTO[];
  recentActivities: StudyActivityDTO[];
}

/**
 * Contrato de repositório para agregações e consultas do Dashboard.
 */
export interface IDashboardRepository {
  /**
   * Realiza agregação nativa dos simulados com status COMPLETED do usuário.
   */
  getCompletedSimulationsAggregates(userId: string): Promise<SimulationAggregationRaw>;

  /**
   * Retorna os N simulados mais recentes (status COMPLETED), selecionados por
   * (finishedAt DESC, id DESC) e então ordenados cronologicamente para exibição.
   */
  getRecentCompletedSimulations(
    userId: string,
    limit?: number
  ): Promise<SimulationEvolutionPointDTO[]>;
}

/**
 * Função utilitária pura para cálculo determinístico do percentual ponderado de acertos.
 *
 * Fórmula: accuracyPercentage = (totalCorrect / (totalCorrect + totalWrong)) * 100
 * Regra: se o denominador for <= 0 ou inválido, retorna 0 (sem NaN ou Infinity).
 * Arredondamento: uma casa decimal (ex: 78.5).
 */
export function calculateAccuracyPercentage(totalCorrect: number, totalWrong: number): number {
  const total = totalCorrect + totalWrong;
  if (!Number.isFinite(total) || total <= 0) {
    return 0;
  }
  const safeCorrect = Number.isFinite(totalCorrect) && totalCorrect > 0 ? totalCorrect : 0;
  const rawPercentage = (safeCorrect / total) * 100;
  return Math.round(rawPercentage * 10) / 10;
}
