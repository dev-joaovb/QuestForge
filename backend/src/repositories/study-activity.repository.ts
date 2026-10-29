import { Prisma, PrismaClient, type StudyActivity } from '@prisma/client';
import { getPrismaClient } from '../config/database.ts';
import {
  type IStudyActivityRepository,
  type RecordStudyActivityInput,
  type CreateActivityResult,
  type ListStudyActivitiesOptions,
  type StudyActivityType,
  StudyActivityDomainError,
} from '../types/activity.types.ts';

export type { IStudyActivityRepository, CreateActivityResult, ListStudyActivitiesOptions };

export class PrismaStudyActivityRepository implements IStudyActivityRepository {
  private readonly clientGetter: () => PrismaClient | Prisma.TransactionClient;

  constructor(client?: PrismaClient | Prisma.TransactionClient) {
    this.clientGetter = client ? () => client : () => getPrismaClient();
  }

  private get client(): PrismaClient | Prisma.TransactionClient {
    return this.clientGetter();
  }

  async create(data: RecordStudyActivityInput): Promise<CreateActivityResult> {
    try {
      const activity = await this.client.studyActivity.create({
        data: {
          userId: data.userId,
          type: data.type,
          simulationId: data.simulationId ?? null,
          questionId: data.questionId ?? null,
          examId: data.examId ?? null,
          durationSeconds: data.durationSeconds ?? null,
          scorePercentage: data.scorePercentage ?? null,
          correctCount: data.correctCount ?? null,
          wrongCount: data.wrongCount ?? null,
          unansweredCount: data.unansweredCount ?? null,
          completedAt: data.completedAt ?? new Date(),
        },
      });
      return { activity, wasCreated: true };
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Conflito de unicidade (ex: simulationId já possui atividade registrada)
        // Não executa outra consulta no mesmo client para não falhar em bloco abortado no PostgreSQL
        throw new StudyActivityDomainError(
          'ACTIVITY_ALREADY_EXISTS',
          'Já existe uma atividade registrada para este evento.',
          409,
          { error }
        );
      }
      throw error;
    }
  }

  async findBySimulationId(simulationId: string): Promise<StudyActivity | null> {
    return this.client.studyActivity.findUnique({
      where: { simulationId },
    });
  }

  async findById(id: string): Promise<StudyActivity | null> {
    return this.client.studyActivity.findUnique({
      where: { id },
    });
  }

  async findManyByUser(
    userId: string,
    options: ListStudyActivitiesOptions
  ): Promise<StudyActivity[]> {
    const where: Prisma.StudyActivityWhereInput = { userId };

    if (options.type) {
      where.type = options.type;
    }

    if (options.startDate || options.endDate) {
      where.completedAt = {};
      if (options.startDate) {
        where.completedAt.gte = options.startDate;
      }
      if (options.endDate) {
        where.completedAt.lte = options.endDate;
      }
    }

    return this.client.studyActivity.findMany({
      where,
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      take: Math.max(1, Math.min(100, options.limit)),
      skip: Math.max(0, options.offset),
    });
  }

  async countByUser(
    userId: string,
    filter?: { type?: StudyActivityType; startDate?: Date; endDate?: Date }
  ): Promise<number> {
    const where: Prisma.StudyActivityWhereInput = { userId };

    if (filter?.type) {
      where.type = filter.type;
    }

    if (filter?.startDate || filter?.endDate) {
      where.completedAt = {};
      if (filter.startDate) {
        where.completedAt.gte = filter.startDate;
      }
      if (filter.endDate) {
        where.completedAt.lte = filter.endDate;
      }
    }

    return this.client.studyActivity.count({ where });
  }

  async findByUser(userId: string, limit = 50): Promise<StudyActivity[]> {
    return this.findManyByUser(userId, { limit, offset: 0 });
  }
}

/**
 * Repositório em memória para testes unitários isolados.
 */
export class MockStudyActivityRepository implements IStudyActivityRepository {
  public activities: StudyActivity[] = [];

  async create(data: RecordStudyActivityInput): Promise<CreateActivityResult> {
    if (data.simulationId) {
      const existing = this.activities.find((a) => a.simulationId === data.simulationId);
      if (existing) {
        return { activity: existing, wasCreated: false };
      }
    }

    const activity: StudyActivity = {
      id: `act-${this.activities.length + 1}-${Date.now()}`,
      userId: data.userId,
      type: data.type,
      simulationId: data.simulationId ?? null,
      questionId: data.questionId ?? null,
      examId: data.examId ?? null,
      durationSeconds: data.durationSeconds ?? null,
      scorePercentage: data.scorePercentage ?? null,
      correctCount: data.correctCount ?? null,
      wrongCount: data.wrongCount ?? null,
      unansweredCount: data.unansweredCount ?? null,
      completedAt: data.completedAt ?? new Date(),
      createdAt: new Date(),
    };

    this.activities.push(activity);
    return { activity, wasCreated: true };
  }

  async findBySimulationId(simulationId: string): Promise<StudyActivity | null> {
    return this.activities.find((a) => a.simulationId === simulationId) ?? null;
  }

  async findById(id: string): Promise<StudyActivity | null> {
    return this.activities.find((a) => a.id === id) ?? null;
  }

  async findManyByUser(
    userId: string,
    options: ListStudyActivitiesOptions
  ): Promise<StudyActivity[]> {
    return this.activities
      .filter((a) => {
        if (a.userId !== userId) return false;
        if (options.type && a.type !== options.type) return false;
        if (options.startDate && a.completedAt.getTime() < options.startDate.getTime()) return false;
        if (options.endDate && a.completedAt.getTime() > options.endDate.getTime()) return false;
        return true;
      })
      .sort((a, b) => {
        const timeDiff = b.completedAt.getTime() - a.completedAt.getTime();
        if (timeDiff !== 0) return timeDiff;
        return b.id.localeCompare(a.id);
      })
      .slice(options.offset, options.offset + Math.max(1, Math.min(100, options.limit)));
  }

  async countByUser(
    userId: string,
    filter?: { type?: StudyActivityType; startDate?: Date; endDate?: Date }
  ): Promise<number> {
    return this.activities.filter((a) => {
      if (a.userId !== userId) return false;
      if (filter?.type && a.type !== filter.type) return false;
      if (filter?.startDate && a.completedAt.getTime() < filter.startDate.getTime()) return false;
      if (filter?.endDate && a.completedAt.getTime() > filter.endDate.getTime()) return false;
      return true;
    }).length;
  }

  async findByUser(userId: string, limit = 50): Promise<StudyActivity[]> {
    return this.findManyByUser(userId, { limit, offset: 0 });
  }
}
