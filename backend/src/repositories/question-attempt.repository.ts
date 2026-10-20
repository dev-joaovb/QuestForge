import type {
  Prisma,
  PrismaClient,
  QuestionAttempt,
} from '@prisma/client';
import { getPrismaClient } from '../config/database.ts';
import type { UpsertQuestionAttemptInput } from '../types/simulation.types.ts';

export interface IQuestionAttemptRepository {
  upsertAttempt(data: UpsertQuestionAttemptInput): Promise<QuestionAttempt>;
  findBySimulationAndQuestion(
    simulationId: string,
    questionId: string,
    userId?: string
  ): Promise<QuestionAttempt | null>;
  findManyBySimulation(
    simulationId: string,
    userId?: string
  ): Promise<QuestionAttempt[]>;
  countAttempts(
    simulationId: string,
    userId?: string
  ): Promise<{ total: number; correct: number; wrong: number }>;
  deleteBySimulation(simulationId: string): Promise<number>;
}

export class PrismaQuestionAttemptRepository implements IQuestionAttemptRepository {
  private readonly prismaGetter: () => PrismaClient | Prisma.TransactionClient;

  constructor(customClient?: PrismaClient | Prisma.TransactionClient) {
    this.prismaGetter = customClient ? () => customClient : () => getPrismaClient();
  }

  async upsertAttempt(data: UpsertQuestionAttemptInput): Promise<QuestionAttempt> {
    const prisma = this.prismaGetter();
    const answeredAt = data.answeredAt ?? new Date();

    return (prisma as PrismaClient).questionAttempt.upsert({
      where: {
        simulationId_questionId: {
          simulationId: data.simulationId,
          questionId: data.questionId,
        },
      },
      create: {
        userId: data.userId,
        simulationId: data.simulationId,
        questionId: data.questionId,
        selectedAlternativeId: data.selectedAlternativeId ?? null,
        selectedLetter: data.selectedLetter ?? null,
        isCorrect: data.isCorrect ?? null,
        timeSpentSeconds: data.timeSpentSeconds ?? null,
        answeredAt,
      },
      update: {
        selectedAlternativeId: data.selectedAlternativeId ?? null,
        selectedLetter: data.selectedLetter ?? null,
        isCorrect: data.isCorrect ?? null,
        timeSpentSeconds: data.timeSpentSeconds ?? null,
        answeredAt,
      },
    });
  }

  async findBySimulationAndQuestion(
    simulationId: string,
    questionId: string,
    userId?: string
  ): Promise<QuestionAttempt | null> {
    const prisma = this.prismaGetter();
    return (prisma as PrismaClient).questionAttempt.findFirst({
      where: {
        simulationId,
        questionId,
        ...(userId ? { userId } : {}),
      },
    });
  }

  async findManyBySimulation(
    simulationId: string,
    userId?: string
  ): Promise<QuestionAttempt[]> {
    const prisma = this.prismaGetter();
    return (prisma as PrismaClient).questionAttempt.findMany({
      where: {
        simulationId,
        ...(userId ? { userId } : {}),
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async countAttempts(
    simulationId: string,
    userId?: string
  ): Promise<{ total: number; correct: number; wrong: number }> {
    const prisma = this.prismaGetter();

    const where: Prisma.QuestionAttemptWhereInput = {
      simulationId,
      ...(userId ? { userId } : {}),
    };

    const [total, correct, wrong] = await Promise.all([
      (prisma as PrismaClient).questionAttempt.count({
        where,
      }),
      (prisma as PrismaClient).questionAttempt.count({
        where: {
          ...where,
          isCorrect: true,
        },
      }),
      (prisma as PrismaClient).questionAttempt.count({
        where: {
          ...where,
          isCorrect: false,
        },
      }),
    ]);

    return {
      total,
      correct,
      wrong,
    };
  }

  async deleteBySimulation(simulationId: string): Promise<number> {
    const prisma = this.prismaGetter();
    const result = await (prisma as PrismaClient).questionAttempt.deleteMany({
      where: { simulationId },
    });
    return result.count;
  }
}
