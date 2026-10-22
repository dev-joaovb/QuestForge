import type {
  Prisma,
  PrismaClient,
  Simulation,
  SimulationStatus,
} from '@prisma/client';
import { getPrismaClient } from '../config/database.ts';
import {
  SimulationDomainError,
  type CreateSimulationInput,
  type CreateSimulationQuestionInput,
  type PaginatedSimulationsResult,
  type SimulationFilterParams,
  type SimulationWithFullDetails,
  type SimulationWithQuestions,
  type UpdateSimulationInput,
} from '../types/simulation.types.ts';
import {
  PrismaQuestionAttemptRepository,
  type IQuestionAttemptRepository,
} from './question-attempt.repository.ts';

function isPrismaUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { code?: unknown }).code === 'P2002';
}

function assertValidSimulationQuestions(
  totalQuestions: number,
  questions: readonly CreateSimulationQuestionInput[]
): void {
  if (questions.length !== totalQuestions) {
    throw new SimulationDomainError(
      'SIMULATION_INVALID_INPUT',
      `A quantidade de questões (${questions.length}) diverge do total especificado (${totalQuestions}).`,
      422
    );
  }

  const seenPositions = new Set<number>();
  const seenQuestionIds = new Set<string>();

  for (const q of questions) {
    if (seenPositions.has(q.position)) {
      throw new SimulationDomainError(
        'SIMULATION_INVALID_INPUT',
        `Posição duplicada detectada no simulado: posição ${q.position}.`,
        422
      );
    }
    seenPositions.add(q.position);

    if (seenQuestionIds.has(q.questionId)) {
      throw new SimulationDomainError(
        'SIMULATION_INVALID_INPUT',
        `Questão duplicada detectada no simulado: ${q.questionId}.`,
        422
      );
    }
    seenQuestionIds.add(q.questionId);
  }
}

export interface ISimulationRepository {
  create(data: CreateSimulationInput): Promise<SimulationWithQuestions>;
  findById(id: string): Promise<Simulation | null>;
  findByIdAndUser(id: string, userId: string): Promise<Simulation | null>;
  findByIdWithQuestions(id: string, userId: string): Promise<SimulationWithQuestions | null>;
  findByIdWithFullDetails(id: string, userId: string): Promise<SimulationWithFullDetails | null>;
  findManyByUser(userId: string, filters?: SimulationFilterParams): Promise<PaginatedSimulationsResult>;
  update(id: string, userId: string, data: UpdateSimulationInput): Promise<Simulation>;
  updateIfStatus?(
    id: string,
    userId: string,
    expectedStatuses: SimulationStatus[],
    data: UpdateSimulationInput
  ): Promise<Simulation | null>;
  delete(id: string, userId: string): Promise<boolean>;
  countByUserAndStatus(userId: string, status?: SimulationStatus): Promise<number>;
  executeInSimulationLock<T>(
    simulationId: string,
    userId: string,
    action: (
      txSimulationRepo: ISimulationRepository,
      txAttemptRepo: IQuestionAttemptRepository
    ) => Promise<T>
  ): Promise<T>;
}

export class PrismaSimulationRepository implements ISimulationRepository {
  private readonly prismaGetter: () => PrismaClient | Prisma.TransactionClient;

  constructor(customClient?: PrismaClient | Prisma.TransactionClient) {
    this.prismaGetter = customClient ? () => customClient : () => getPrismaClient();
  }

  async create(data: CreateSimulationInput): Promise<SimulationWithQuestions> {
    assertValidSimulationQuestions(data.totalQuestions, data.questions);

    const prisma = this.prismaGetter();

    try {
      const created = await (prisma as PrismaClient).simulation.create({
        data: {
          userId: data.userId,
          title: data.title ?? null,
          timeLimitSeconds: data.timeLimitSeconds ?? null,
          totalQuestions: data.totalQuestions,
          status: data.status ?? 'CREATED',
          questions: {
            create: data.questions.map((q) => ({
              questionId: q.questionId,
              position: q.position,
              answerKeySnapshot: q.answerKeySnapshot ?? null,
              isAnnulledSnapshot: q.isAnnulledSnapshot ?? false,
              snapshotSource: q.snapshotSource ?? 'QUESTION_BANK',
              officialAnswerKeyId: q.officialAnswerKeyId ?? null,
              officialAnswerKeyItemId: q.officialAnswerKeyItemId ?? null,
              officialAnswerKeyVersion: q.officialAnswerKeyVersion ?? null,
            })),
          },
        },
        include: {
          questions: {
            include: {
              question: {
                include: {
                  alternatives: {
                    orderBy: {
                      position: 'asc',
                    },
                  },
                },
              },
            },
            orderBy: {
              position: 'asc',
            },
          },
        },
      });

      return created as unknown as SimulationWithQuestions;
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        throw new SimulationDomainError(
          'SIMULATION_INVALID_INPUT',
          'Conflito de unicidade nas questões ou posições do simulado.',
          409,
          undefined,
          { cause: error }
        );
      }
      throw error;
    }
  }

  async findById(id: string): Promise<Simulation | null> {
    const prisma = this.prismaGetter();
    return (prisma as PrismaClient).simulation.findUnique({
      where: { id },
    });
  }

  async findByIdAndUser(id: string, userId: string): Promise<Simulation | null> {
    const prisma = this.prismaGetter();
    return (prisma as PrismaClient).simulation.findFirst({
      where: { id, userId },
    });
  }

  async findByIdWithQuestions(
    id: string,
    userId: string
  ): Promise<SimulationWithQuestions | null> {
    const prisma = this.prismaGetter();
    const result = await (prisma as PrismaClient).simulation.findFirst({
      where: { id, userId },
      include: {
        questions: {
          include: {
            question: {
              include: {
                alternatives: {
                  orderBy: {
                    position: 'asc',
                  },
                },
              },
            },
          },
          orderBy: {
            position: 'asc',
          },
        },
      },
    });

    return result as unknown as SimulationWithQuestions | null;
  }

  async findByIdWithFullDetails(
    id: string,
    userId: string
  ): Promise<SimulationWithFullDetails | null> {
    const prisma = this.prismaGetter();
    const result = await (prisma as PrismaClient).simulation.findFirst({
      where: { id, userId },
      include: {
        questions: {
          include: {
            question: {
              include: {
                alternatives: {
                  orderBy: {
                    position: 'asc',
                  },
                },
              },
            },
          },
          orderBy: {
            position: 'asc',
          },
        },
        attempts: {
          include: {
            selectedAlternative: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    return result as unknown as SimulationWithFullDetails | null;
  }

  async findManyByUser(
    userId: string,
    filters?: SimulationFilterParams
  ): Promise<PaginatedSimulationsResult> {
    const prisma = this.prismaGetter();
    const limit = Math.max(1, Math.min(100, filters?.limit ?? 20));
    const offset = Math.max(0, filters?.offset ?? 0);

    const where: Prisma.SimulationWhereInput = {
      userId,
      ...(filters?.status ? { status: filters.status } : {}),
    };

    const [items, total] = await Promise.all([
      (prisma as PrismaClient).simulation.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
        skip: offset,
      }),
      (prisma as PrismaClient).simulation.count({
        where,
      }),
    ]);

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  async update(
    id: string,
    userId: string,
    data: UpdateSimulationInput
  ): Promise<Simulation> {
    const prisma = this.prismaGetter();

    const existing = await this.findByIdAndUser(id, userId);
    if (!existing) {
      throw new SimulationDomainError(
        'SIMULATION_NOT_FOUND',
        'Simulado não encontrado para atualização.',
        404
      );
    }

    const updateData: Prisma.SimulationUpdateInput = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.startedAt !== undefined) updateData.startedAt = data.startedAt;
    if (data.finishedAt !== undefined) updateData.finishedAt = data.finishedAt;
    if (data.durationSeconds !== undefined) updateData.durationSeconds = data.durationSeconds;
    if (data.scorePercentage !== undefined) updateData.scorePercentage = data.scorePercentage;
    if (data.correctCount !== undefined) updateData.correctCount = data.correctCount;
    if (data.wrongCount !== undefined) updateData.wrongCount = data.wrongCount;
    if (data.unansweredCount !== undefined) updateData.unansweredCount = data.unansweredCount;

    return (prisma as PrismaClient).simulation.update({
      where: { id },
      data: updateData,
    });
  }

  async updateIfStatus(
    id: string,
    userId: string,
    expectedStatuses: SimulationStatus[],
    data: UpdateSimulationInput
  ): Promise<Simulation | null> {
    const prisma = this.prismaGetter();

    const updateData: Prisma.SimulationUpdateInput = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.startedAt !== undefined) updateData.startedAt = data.startedAt;
    if (data.finishedAt !== undefined) updateData.finishedAt = data.finishedAt;
    if (data.durationSeconds !== undefined) updateData.durationSeconds = data.durationSeconds;
    if (data.scorePercentage !== undefined) updateData.scorePercentage = data.scorePercentage;
    if (data.correctCount !== undefined) updateData.correctCount = data.correctCount;
    if (data.wrongCount !== undefined) updateData.wrongCount = data.wrongCount;
    if (data.unansweredCount !== undefined) updateData.unansweredCount = data.unansweredCount;

    const result = await (prisma as PrismaClient).simulation.updateMany({
      where: {
        id,
        userId,
        status: { in: expectedStatuses },
      },
      data: updateData,
    });

    if (result.count === 0) {
      return null;
    }

    return (prisma as PrismaClient).simulation.findFirst({
      where: { id, userId },
    });
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const prisma = this.prismaGetter();

    const existing = await this.findByIdAndUser(id, userId);
    if (!existing) {
      return false;
    }

    await (prisma as PrismaClient).simulation.delete({
      where: { id },
    });

    return true;
  }

  async countByUserAndStatus(
    userId: string,
    status?: SimulationStatus
  ): Promise<number> {
    const prisma = this.prismaGetter();
    return (prisma as PrismaClient).simulation.count({
      where: {
        userId,
        ...(status ? { status } : {}),
      },
    });
  }

  /**
   * Executa uma operação coordenada sob uma transação interativa do Prisma com bloqueio exclusivo
   * de linha (row lock) no PostgreSQL (`SELECT ... FOR UPDATE`), serializando submissões, início,
   * finalização e abandono para o mesmo registro de simulado.
   */
  async executeInSimulationLock<T>(
    simulationId: string,
    userId: string,
    action: (
      txSimulationRepo: ISimulationRepository,
      txAttemptRepo: IQuestionAttemptRepository
    ) => Promise<T>
  ): Promise<T> {
    const prisma = this.prismaGetter();

    const runInTx = async (tx: Prisma.TransactionClient) => {
      // Adquire bloqueio exclusivo de linha (row lock) no PostgreSQL
      // Tabela física: "simulations" conforme @@map("simulations")
      // Colunas: "id", "userId" conforme schema e migration 20261015120000_add_simulations_engine
      await tx.$queryRaw`
        SELECT "id" FROM "simulations"
        WHERE "id" = ${simulationId} AND "userId" = ${userId}
        FOR UPDATE
      `;

      const txSimRepo = new PrismaSimulationRepository(tx);
      const txAttemptRepo = new PrismaQuestionAttemptRepository(tx);

      return action(txSimRepo, txAttemptRepo);
    };

    if ('$transaction' in prisma && typeof (prisma as PrismaClient).$transaction === 'function') {
      return (prisma as PrismaClient).$transaction(async (tx) => {
        return runInTx(tx);
      });
    }

    return runInTx(prisma as Prisma.TransactionClient);
  }
}
