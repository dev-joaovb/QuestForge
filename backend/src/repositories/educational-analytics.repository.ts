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
 * Repositório Prisma para leitura de dados analíticos educacionais (Sprint 9.1 / 9.1.1).
 *
 * Todas as operações são estritamente somente de leitura (findMany, findUnique, count).
 * Não há mutações de dados nem escritas secundárias.
 *
 * Refinamentos da Sprint 9.1.1:
 * - ACH-01: Paginação por cursor em lotes estáveis (processQuestionAttemptsInBatches),
 *   garantindo consumo de memória O(1) sem truncamento silencioso de dados.
 * - ACH-03: Defesa em profundidade reforçando o filtro de isolamento tanto na raiz
 *   da QuestionAttempt quanto na relação aninhada Simulation (simulation: { status: 'COMPLETED', userId }).
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
   * Processa todas as tentativas de questões em lotes paginados estáveis (ACH-01 e ACH-03).
   *
   * Utiliza cursor ordenado por id para garantir que 100% dos registros sejam processados
   * de forma determinística, sem estourar o limite de memória Node.js em históricos volumosos.
   */
  async processQuestionAttemptsInBatches(
    userId: string,
    onBatch: (batch: QuestionAttemptWithMetadata[]) => Promise<void> | void,
    batchSize = 1000
  ): Promise<number> {
    const cleanId = userId?.trim();
    if (!cleanId) return 0;

    const safeBatchSize = Math.max(10, Math.min(5000, batchSize));
    let totalProcessed = 0;
    let cursor: string | undefined = undefined;

    while (true) {
      const rawBatch = await (this.client as PrismaClient).questionAttempt.findMany({
        where: {
          userId: cleanId,
          simulation: {
            status: 'COMPLETED',
            userId: cleanId, // ACH-03: Defesa em profundidade na relação relacional
          },
        },
        select: {
          id: true,
          simulationId: true,
          questionId: true,
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
        orderBy: { id: 'asc' },
        take: safeBatchSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });

      if (rawBatch.length === 0) break;

      // Sprint 9.5.1: Busca em lote único as SimulationQuestion correspondentes aos pares (simulationId, questionId)
      // Garantia total contra consultas N+1: apenas 1 consulta por lote de paginação
      const simulationIds = Array.from(new Set(rawBatch.map((item) => item.simulationId)));
      const questionIds = Array.from(new Set(rawBatch.map((item) => item.questionId)));

      const simulationQuestions = await (this.client as PrismaClient).simulationQuestion.findMany({
        where: {
          simulationId: { in: simulationIds },
          questionId: { in: questionIds },
        },
        select: {
          simulationId: true,
          questionId: true,
          isAnnulledSnapshot: true,
        },
      });

      const annulledMap = new Map<string, boolean>();
      for (const sq of simulationQuestions) {
        annulledMap.set(`${sq.simulationId}:${sq.questionId}`, sq.isAnnulledSnapshot);
      }

      const batch: QuestionAttemptWithMetadata[] = rawBatch.map((item) => {
        const snapshot = annulledMap.get(`${item.simulationId}:${item.questionId}`);
        // Sprint 10.1 (ACH-SEC-01): Classificação tri-estado conservadora de anulação:
        // - true: questão comprovadamente anulada no snapshot oficial de SimulationQuestion.
        // - false: questão comprovadamente regular no snapshot oficial de SimulationQuestion.
        // - null: estado desconhecido / ausência de snapshot correspondente (não assumir false).
        const isAnnulled = typeof snapshot === 'boolean' ? snapshot : null;
        return {
          id: item.id,
          simulationId: item.simulationId,
          questionId: item.questionId,
          isCorrect: item.isCorrect,
          timeSpentSeconds: item.timeSpentSeconds,
          answeredAt: item.answeredAt,
          isAnnulled,
          question: item.question,
        };
      });

      await onBatch(batch);
      totalProcessed += batch.length;
      cursor = batch[batch.length - 1].id;

      if (batch.length < safeBatchSize) break;
    }

    return totalProcessed;
  }

  /**
   * Obtém todas as tentativas de questões respondidas pelo estudante em simulados concluídos,
   * unindo os metadados da questão (disciplina, dificuldade e tópico).
   */
  async getQuestionAttemptsWithMetadata(userId: string): Promise<QuestionAttemptWithMetadata[]> {
    const allResults: QuestionAttemptWithMetadata[] = [];
    await this.processQuestionAttemptsInBatches(
      userId,
      (batch) => {
        allResults.push(...batch);
      },
      1000
    );
    return allResults;
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
    const cleanId = userId?.trim();
    const [streak, totalActivities] = await Promise.all([
      (this.client as PrismaClient).userStreak.findUnique({
        where: { userId: cleanId },
        select: {
          currentStreak: true,
          longestStreak: true,
          lastActivityDate: true,
        },
      }),
      (this.client as PrismaClient).studyActivity.count({
        where: { userId: cleanId },
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
  questionId?: string;
  isCorrect: boolean | null;
  timeSpentSeconds: number | null;
  answeredAt: Date | null;
  isAnnulled?: boolean | null;
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
 * Interface para questões de simulados no mock de testes.
 */
export interface MockSimulationQuestionItem {
  simulationId: string;
  questionId: string;
  isAnnulledSnapshot: boolean;
}

/**
 * Repositório em memória para testes unitários isolados e herméticos da camada de Analytics Educacional.
 */
export class MockEducationalAnalyticsRepository implements IEducationalAnalyticsRepository {
  public simulations: MockSimulationItem[] = [];
  public questionAttempts: MockQuestionAttemptItem[] = [];
  public simulationQuestions: MockSimulationQuestionItem[] = [];
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

  async processQuestionAttemptsInBatches(
    userId: string,
    onBatch: (batch: QuestionAttemptWithMetadata[]) => Promise<void> | void,
    batchSize = 1000
  ): Promise<number> {
    const attempts = await this.getQuestionAttemptsWithMetadata(userId);
    const safeBatchSize = Math.max(1, batchSize);
    let totalProcessed = 0;

    for (let i = 0; i < attempts.length; i += safeBatchSize) {
      const slice = attempts.slice(i, i + safeBatchSize);
      await onBatch(slice);
      totalProcessed += slice.length;
    }

    return totalProcessed;
  }

  async getQuestionAttemptsWithMetadata(userId: string): Promise<QuestionAttemptWithMetadata[]> {
    // ACH-03: Defesa em profundidade - os simulados devem ser do usuário e COMPLETED
    const validSimulations = new Map(
      this.simulations
        .filter((s) => s.userId === userId && s.status === 'COMPLETED')
        .map((s) => [s.id, s])
    );

    const annulledMap = new Map<string, boolean>();
    for (const sq of this.simulationQuestions) {
      annulledMap.set(`${sq.simulationId}:${sq.questionId}`, sq.isAnnulledSnapshot);
    }

    return this.questionAttempts
      .filter((qa) => {
        if (qa.userId !== userId) return false;
        const sim = validSimulations.get(qa.simulationId);
        return sim !== undefined && sim.userId === userId;
      })
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((qa) => {
        const qId = qa.questionId ?? qa.id;
        const snapshot = annulledMap.get(`${qa.simulationId}:${qId}`);
        // Sprint 10.1.1: O snapshot de SimulationQuestion é a única fonte da verdade,
        // garantindo paridade estrita e absoluta com o PrismaEducationalAnalyticsRepository.
        // O valor local qa.isAnnulled não sobrepõe nem atua como fallback quando ausente.
        const isAnnulled = typeof snapshot === 'boolean' ? snapshot : null;
        return {
          id: qa.id,
          simulationId: qa.simulationId,
          questionId: qId,
          isCorrect: qa.isCorrect,
          timeSpentSeconds: qa.timeSpentSeconds,
          answeredAt: qa.answeredAt,
          isAnnulled,
          question: {
            subject: qa.question.subject,
            difficulty: qa.question.difficulty,
            topic: qa.question.topic,
          },
        };
      });
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
