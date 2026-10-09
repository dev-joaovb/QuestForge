import type { PrismaClient, User, UserSession } from '@prisma/client';
import { getPrismaClient } from '../config/database.ts';
import type { SessionInfoDTO } from '../types/auth.types.ts';

export interface CreateSessionData {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export type SessionWithUser = UserSession & { user: User };

export interface ISessionRepository {
  create(data: CreateSessionData): Promise<UserSession>;
  findByTokenHashWithUser(tokenHash: string): Promise<SessionWithUser | null>;
  touchLastUsed(sessionId: string, usedAt: Date): Promise<void>;
  deleteByTokenHash(tokenHash: string): Promise<boolean>;
  deleteById(sessionId: string): Promise<void>;
  deleteAllForUser(userId: string): Promise<number>;
}

/**
 * Converte a entidade interna UserSession para o DTO seguro de sessão,
 * omitindo `tokenHash`.
 */
export function toSessionInfoDTO(session: UserSession): SessionInfoDTO {
  return {
    id: session.id,
    userId: session.userId,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
  };
}

export class PrismaSessionRepository implements ISessionRepository {
  private readonly prismaGetter: () => Pick<PrismaClient, 'userSession'>;

  constructor(customClient?: Pick<PrismaClient, 'userSession'>) {
    this.prismaGetter = customClient ? () => customClient : () => getPrismaClient();
  }

  async create(data: CreateSessionData): Promise<UserSession> {
    return this.prismaGetter().userSession.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
      },
    });
  }

  async findByTokenHashWithUser(tokenHash: string): Promise<SessionWithUser | null> {
    return this.prismaGetter().userSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  }

  async touchLastUsed(sessionId: string, usedAt: Date): Promise<void> {
    await this.prismaGetter().userSession.update({
      where: { id: sessionId },
      data: { lastUsedAt: usedAt },
    });
  }

  async deleteByTokenHash(tokenHash: string): Promise<boolean> {
    const result = await this.prismaGetter().userSession.deleteMany({
      where: { tokenHash },
    });
    return result.count > 0;
  }

  async deleteById(sessionId: string): Promise<void> {
    await this.prismaGetter().userSession.deleteMany({
      where: { id: sessionId },
    });
  }

  async deleteAllForUser(userId: string): Promise<number> {
    const result = await this.prismaGetter().userSession.deleteMany({
      where: { userId },
    });
    return result.count;
  }
}
