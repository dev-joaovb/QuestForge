import { Prisma, PrismaClient, type StudyActivity } from '@prisma/client';
import { getPrismaClient } from '../config/database.ts';
import {
  type IStudyActivityRepository,
  type RecordStudyActivityInput,
  type CreateActivityResult,
  StudyActivityDomainError,
} from '../types/activity.types.ts';

export type { IStudyActivityRepository, CreateActivityResult };

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

  async findByUser(userId: string, limit = 50): Promise<StudyActivity[]> {
    return this.client.studyActivity.findMany({
      where: { userId },
      orderBy: { completedAt: 'desc' },
      take: Math.max(1, Math.min(100, limit)),
    });
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

  async findByUser(userId: string, limit = 50): Promise<StudyActivity[]> {
    return this.activities
      .filter((a) => a.userId === userId)
      .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
      .slice(0, limit);
  }
}
