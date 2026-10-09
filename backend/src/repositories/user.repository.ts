import type { PrismaClient, User } from '@prisma/client';
import { getPrismaClient } from '../config/database.ts';
import type { PublicUserDTO } from '../types/auth.types.ts';

export interface CreateUserData {
  name: string;
  email: string;
  passwordHash: string;
  avatarUrl?: string | null;
}

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(data: CreateUserData): Promise<User>;
}

/**
 * Converte a entidade interna User do Prisma para o DTO público seguro,
 * garantindo que `passwordHash` nunca saia da camada de domínio.
 */
export function toPublicUserDTO(user: User): PublicUserDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export class PrismaUserRepository implements IUserRepository {
  private readonly prismaGetter: () => Pick<PrismaClient, 'user'>;

  constructor(customClient?: Pick<PrismaClient, 'user'>) {
    this.prismaGetter = customClient ? () => customClient : () => getPrismaClient();
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.trim().toLowerCase();
    return this.prismaGetter().user.findUnique({
      where: { email: normalizedEmail },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.prismaGetter().user.findUnique({
      where: { id },
    });
  }

  async create(data: CreateUserData): Promise<User> {
    return this.prismaGetter().user.create({
      data: {
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        passwordHash: data.passwordHash,
        avatarUrl: data.avatarUrl ?? null,
      },
    });
  }
}
