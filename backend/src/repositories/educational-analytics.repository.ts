import { Prisma, PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../config/database.ts';
import type {
  IEducationalAnalyticsRepository,
  CompletedSimulationMetric,
  QuestionAttemptWithMetadata,
} from '../types/educational-analytics.types.ts';

export type {
  IEducationalAnalyticsRepository,
  CompletedSimulationMetric,
  QuestionAttemptWithMetadata,
};

/**
 * Repositório Prisma para leitura de dados analíticos educacionais (Sprint 9.1).
 *
 * Todas as operações são estritamente somente de leitura (findMany, findUnique, count).
 * Não há mutações de dados nem escritas secundárias.
 * Todas as queries utilizam o identificador obrigatório do usuário (userId) para isolamento multi-inquilino.
 */
export class PrismaEducationalAnalyticsRepository implements IEducationalAnalyticsRepository {
  private readonly clientGetter: () => PrismaClient | Prisma.TransactionClient;

  constructor(client?: PrismaClient | Prisma.TransactionClient) {
    this.clientGetter = client ? () => client : () => getPrismaClient();
  }

  private get client(): PrismaClient | Prisma.TransactionClient {
    return this.clientGetter();
  }

  /**
   * Obtém os simulados concluídos do estudante ordenados cronologicamente (finishedAt asc).
   */
  async getCompletedSimulations(
    userId: string,
    limit = 100
  ): Promise<CompletedSimulationMetric[]> {
    const safeLimit = Math.max(1, Math.min(200, limit));
    const results = await (this.client as PrismaClient).simulation.findMany({
      where: {
        userId,
        status: 'COMPLETED',
      },
      orderBy: [
        { finishedAt: 'asc' },
        { id: 'asc' },
      ],
      take: safeLimit,
      select: {
        id: true,
        scorePercentage: true,
        correctCount: true,
        wrongCount: true,
        durationSeconds: true,
        finishedAt: true,
      },
    });

    return results;
  }

  /**
   * Obtém todas as tentativas de questões respondidas pelo estudante em simulados concluídos,
   * unindo os metadados da questão (disciplina, dificuldade e tópico).
   */
  async getQuestionAttemptsWithMetadata(userId: string): Promise<QuestionAttemptWithMetadata[]> {
    const results = await (this.client as PrismaClient).questionAttempt.findMany({
      where: {
        userId,
        simulation: {
          status: 'COMPLETED',
        },
      },
      select: {
        id: true,
        isCorrect: true,
        timeSpentSeconds: true,
        answeredAt: true,
        question: {
          select: {
            subject: true,
            difficulty: true,
            topic: true,
          },
        },
      },
    });

    return results;
  }

  /**
   * Obtém as métricas de sequência (streak) e contagem total de atividades registradas.
   */
  async getStreakAndActivityMetrics(userId: string): Promise<{
    currentStreak: number;
    longestStreak: number;
    lastActivityDate: string | null;
    totalActivities: number;
  }> {
    const [streak, totalActivities] = await Promise.all([
      (this.client as PrismaClient).userStreak.findUnique({
        where: { userId },
        select: {
          currentStreak: true,
          longestStreak: true,
          lastActivityDate: true,
        },
      }),
      (this.client as PrismaClient).studyActivity.count({
        where: { userId },
      }),
    ]);

    return {
      currentStreak: streak?.currentStreak ?? 0,
      longestStreak: streak?.longestStreak ?? 0,
      lastActivityDate: streak?.lastActivityDate ?? null,
      totalActivities,
    };
  }
}

/**
 * Interface estendida para tentativas de questão no mock de testes.
 */
export interface MockQuestionAttemptItem {
  id: string;
  userId: string;
  simulationId: string;
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
 * Interface estendida para simulados no mock de testes.
 */
export interface MockSimulationItem {
  id: string;
  userId: string;
  status: 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED' | 'EXPIRED';
  scorePercentage: number | null;
  correctCount: number | null;
  wrongCount: number | null;
  durationSeconds: number | null;
  finishedAt: Date | null;
}

/**
 * Repositório em memória para testes unitários isolados e herméticos da camada de Analytics Educacional.
 */
export class MockEducationalAnalyticsRepository implements IEducationalAnalyticsRepository {
  public simulations: MockSimulationItem[] = [];
  public questionAttempts: MockQuestionAttemptItem[] = [];
  public streaks: Array<{
    userId: string;
    currentStreak: number;
    longestStreak: number;
    lastActivityDate: string | null;
  }> = [];
  public studyActivitiesCount: Map<string, number> = new Map();

  // Contador de chamadas de escrita para verificação de idempotência e imutabilidade
  public writeCallCount = 0;

  async getCompletedSimulations(
    userId: string,
    limit = 100
  ): Promise<CompletedSimulationMetric[]> {
    const safeLimit = Math.max(1, Math.min(200, limit));
    return this.simulations
      .filter((s) => s.userId === userId && s.status === 'COMPLETED')
      .slice()
      .sort((a, b) => {
        const timeA = a.finishedAt ? a.finishedAt.getTime() : 0;
        const timeB = b.finishedAt ? b.finishedAt.getTime() : 0;
        if (timeA !== timeB) return timeA - timeB;
        return a.id.localeCompare(b.id);
      })
      .slice(0, safeLimit)
      .map((s) => ({
        id: s.id,
        scorePercentage: s.scorePercentage,
        correctCount: s.correctCount,
        wrongCount: s.wrongCount,
        durationSeconds: s.durationSeconds,
        finishedAt: s.finishedAt,
      }));
  }

  async getQuestionAttemptsWithMetadata(userId: string): Promise<QuestionAttemptWithMetadata[]> {
    // Localiza os IDs de simulados COMPLETED do usuário
    const completedSimIds = new Set(
      this.simulations
        .filter((s) => s.userId === userId && s.status === 'COMPLETED')
        .map((s) => s.id)
    );

    return this.questionAttempts
      .filter((qa) => qa.userId === userId && completedSimIds.has(qa.simulationId))
      .map((qa) => ({
        id: qa.id,
        isCorrect: qa.isCorrect,
        timeSpentSeconds: qa.timeSpentSeconds,
        answeredAt: qa.answeredAt,
        question: {
          subject: qa.question.subject,
          difficulty: qa.question.difficulty,
          topic: qa.question.topic,
        },
      }));
  }

  async getStreakAndActivityMetrics(userId: string): Promise<{
    currentStreak: number;
    longestStreak: number;
    lastActivityDate: string | null;
    totalActivities: number;
  }> {
    const streak = this.streaks.find((s) => s.userId === userId);
    const totalActivities = this.studyActivitiesCount.get(userId) ?? 0;

    return {
      currentStreak: streak?.currentStreak ?? 0,
      longestStreak: streak?.longestStreak ?? 0,
      lastActivityDate: streak?.lastActivityDate ?? null,
      totalActivities,
    };
  }
}
