import { Prisma, PrismaClient, type UserStreak } from '@prisma/client';
import { getPrismaClient } from '../config/database.ts';
import {
  type IUserStreakRepository,
  StudyActivityDomainError,
} from '../types/activity.types.ts';

export type { IUserStreakRepository };

export class PrismaUserStreakRepository implements IUserStreakRepository {
  private readonly clientGetter: () => PrismaClient | Prisma.TransactionClient;

  constructor(client?: PrismaClient | Prisma.TransactionClient) {
    this.clientGetter = client ? () => client : () => getPrismaClient();
  }

  private get client(): PrismaClient | Prisma.TransactionClient {
    return this.clientGetter();
  }

  /**
   * Adquire bloqueio exclusivo de linha (row lock) no PostgreSQL sobre o usuário (`users`).
   * Como a linha do usuário autenticado sempre existe, isto garante serialização estrita
   * de todas as atividades e atualizações de streak do mesmo usuário, prevenindo condições
   * de corrida na criação inicial do registro UserStreak e updates perdidos.
   */
  async acquireUserLock(userId: string): Promise<void> {
    if ('$queryRaw' in this.client && typeof this.client.$queryRaw === 'function') {
      await this.client.$queryRaw`
        SELECT "id" FROM "users"
        WHERE "id" = ${userId}
        FOR UPDATE
      `;
    }
  }

  async findByUserId(userId: string): Promise<UserStreak | null> {
    return this.client.userStreak.findUnique({
      where: { userId },
    });
  }

  async upsert(
    userId: string,
    data: {
      currentStreak: number;
      longestStreak: number;
      lastActivityDate: string;
    }
  ): Promise<UserStreak> {
    try {
      return await this.client.userStreak.upsert({
        where: { userId },
        update: {
          currentStreak: data.currentStreak,
          longestStreak: data.longestStreak,
          lastActivityDate: data.lastActivityDate,
        },
        create: {
          userId,
          currentStreak: data.currentStreak,
          longestStreak: data.longestStreak,
          lastActivityDate: data.lastActivityDate,
        },
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new StudyActivityDomainError(
          'USER_NOT_FOUND',
          'Usuário associado ao streak não foi encontrado no sistema.',
          404,
          { userId }
        );
      }
      throw error;
    }
  }
}

/**
 * Repositório em memória para testes unitários com suporte a serialização lógica.
 */
export class MockUserStreakRepository implements IUserStreakRepository {
  public streaks: Map<string, UserStreak> = new Map();
  private userLocks: Map<string, Promise<void>> = new Map();

  async acquireUserLock(userId: string): Promise<void> {
    // Simula lock com enfileiramento de promessas por userId
    while (this.userLocks.has(userId)) {
      await this.userLocks.get(userId);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.userLocks.set(userId, lockPromise);
    // Libera automaticamente em tick seguinte para não prender eternamente em mocks
    setTimeout(() => {
      this.releaseUserLock(userId);
      resolveLock();
    }, 5);
  }

  releaseUserLock(userId: string): void {
    this.userLocks.delete(userId);
  }

  async findByUserId(userId: string): Promise<UserStreak | null> {
    return this.streaks.get(userId) ?? null;
  }

  async upsert(
    userId: string,
    data: {
      currentStreak: number;
      longestStreak: number;
      lastActivityDate: string;
    }
  ): Promise<UserStreak> {
    const existing = this.streaks.get(userId);
    const now = new Date();
    const streak: UserStreak = {
      id: existing ? existing.id : `streak-${userId}`,
      userId,
      currentStreak: data.currentStreak,
      longestStreak: data.longestStreak,
      lastActivityDate: data.lastActivityDate,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    this.streaks.set(userId, streak);
    return streak;
  }
}
