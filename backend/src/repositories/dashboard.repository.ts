import { Prisma, PrismaClient, type Simulation } from '@prisma/client';
import { getPrismaClient } from '../config/database.ts';
import type {
  IDashboardRepository,
  SimulationAggregationRaw,
  SimulationEvolutionPointDTO,
} from '../types/dashboard.types.ts';

export type { IDashboardRepository, SimulationAggregationRaw, SimulationEvolutionPointDTO };

/**
 * Repositório Prisma para agregações nativas de alta performance do Dashboard (Sprint 8.1).
 *
 * Utiliza prisma.simulation.aggregate para computar contagens e somatórios diretamente no
 * PostgreSQL através do índice @@index([userId, status]), evitando o carregamento de todas
 * as linhas na memória da aplicação.
 */
export class PrismaDashboardRepository implements IDashboardRepository {
  private readonly clientGetter: () => PrismaClient | Prisma.TransactionClient;

  constructor(client?: PrismaClient | Prisma.TransactionClient) {
    this.clientGetter = client ? () => client : () => getPrismaClient();
  }

  private get client(): PrismaClient | Prisma.TransactionClient {
    return this.clientGetter();
  }

  /**
   * Agregação nativa dos simulados concluídos do usuário.
   */
  async getCompletedSimulationsAggregates(userId: string): Promise<SimulationAggregationRaw> {
    const result = await (this.client as PrismaClient).simulation.aggregate({
      where: {
        userId,
        status: 'COMPLETED',
      },
      _count: {
        id: true,
      },
      _sum: {
        correctCount: true,
        wrongCount: true,
        durationSeconds: true,
      },
    });

    return {
      completedCount: result._count.id ?? 0,
      totalCorrect: result._sum.correctCount ?? 0,
      totalWrong: result._sum.wrongCount ?? 0,
      totalDurationSeconds: result._sum.durationSeconds ?? 0,
    };
  }

  /**
   * Busca os N simulados mais recentes (status COMPLETED) e os retorna ordenados cronologicamente.
   */
  async getRecentCompletedSimulations(
    userId: string,
    limit = 10
  ): Promise<SimulationEvolutionPointDTO[]> {
    const safeLimit = Math.max(1, Math.min(100, limit));

    // 1. Identifica primeiro os N simulados mais recentes no PostgreSQL por (finishedAt DESC, id DESC)
    const recentDesc = await (this.client as PrismaClient).simulation.findMany({
      where: {
        userId,
        status: 'COMPLETED',
      },
      select: {
        id: true,
        title: true,
        scorePercentage: true,
        correctCount: true,
        wrongCount: true,
        totalQuestions: true,
        durationSeconds: true,
        finishedAt: true,
      },
      orderBy: [
        { finishedAt: 'desc' },
        { id: 'desc' },
      ],
      take: safeLimit,
    });

    // 2. Ordena os N registros selecionados em ordem cronológica (ascendente) para a curva visual
    return recentDesc
      .sort((a, b) => {
        const timeA = a.finishedAt ? a.finishedAt.getTime() : 0;
        const timeB = b.finishedAt ? b.finishedAt.getTime() : 0;
        if (timeA !== timeB) return timeA - timeB;
        return a.id.localeCompare(b.id);
      })
      .map((sim) => ({
        id: sim.id,
        title: sim.title,
        scorePercentage: sim.scorePercentage,
        correctCount: sim.correctCount ?? 0,
        wrongCount: sim.wrongCount ?? 0,
        totalQuestions: sim.totalQuestions,
        durationSeconds: sim.durationSeconds,
        finishedAt: sim.finishedAt,
      }));
  }
}

/**
 * Repositório em memória para testes unitários isolados e herméticos da camada de Dashboard.
 */
export class MockDashboardRepository implements IDashboardRepository {
  public simulations: Simulation[] = [];

  // Rastreador de chamadas de escrita para validar a garantia estrita de ausência de mutações
  public writeCallCount = 0;

  async getCompletedSimulationsAggregates(userId: string): Promise<SimulationAggregationRaw> {
    const completed = this.simulations.filter(
      (s) => s.userId === userId && s.status === 'COMPLETED'
    );

    let totalCorrect = 0;
    let totalWrong = 0;
    let totalDurationSeconds = 0;

    for (const sim of completed) {
      totalCorrect += sim.correctCount ?? 0;
      totalWrong += sim.wrongCount ?? 0;
      totalDurationSeconds += sim.durationSeconds ?? 0;
    }

    return {
      completedCount: completed.length,
      totalCorrect,
      totalWrong,
      totalDurationSeconds,
    };
  }

  async getRecentCompletedSimulations(
    userId: string,
    limit = 10
  ): Promise<SimulationEvolutionPointDTO[]> {
    const safeLimit = Math.max(1, Math.min(100, limit));
    const completed = this.simulations.filter(
      (s) => s.userId === userId && s.status === 'COMPLETED'
    );

    // 1. Identifica primeiro os N simulados mais recentes ordenando (finishedAt DESC, id DESC)
    const recentDesc = completed
      .slice()
      .sort((a, b) => {
        const timeA = a.finishedAt ? a.finishedAt.getTime() : 0;
        const timeB = b.finishedAt ? b.finishedAt.getTime() : 0;
        if (timeB !== timeA) return timeB - timeA;
        return b.id.localeCompare(a.id);
      })
      .slice(0, safeLimit);

    // 2. Ordena os N registros selecionados em ordem cronológica (ascendente) para a curva visual
    return recentDesc
      .sort((a, b) => {
        const timeA = a.finishedAt ? a.finishedAt.getTime() : 0;
        const timeB = b.finishedAt ? b.finishedAt.getTime() : 0;
        if (timeA !== timeB) return timeA - timeB;
        return a.id.localeCompare(b.id);
      })
      .map((sim) => ({
        id: sim.id,
        title: sim.title,
        scorePercentage: sim.scorePercentage,
        correctCount: sim.correctCount ?? 0,
        wrongCount: sim.wrongCount ?? 0,
        totalQuestions: sim.totalQuestions,
        durationSeconds: sim.durationSeconds,
        finishedAt: sim.finishedAt,
      }));
  }
}
