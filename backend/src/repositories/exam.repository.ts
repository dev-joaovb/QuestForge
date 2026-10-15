import type { Exam, PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../config/database.ts';

export interface IExamRepository {
  findById(id: string): Promise<Exam | null>;
  findByIdAndUser?(id: string, userId: string): Promise<Exam | null>;
}

export class PrismaExamRepository implements IExamRepository {
  private readonly prismaGetter: () => PrismaClient;

  constructor(customClient?: PrismaClient) {
    this.prismaGetter = customClient ? () => customClient : () => getPrismaClient();
  }

  async findById(id: string): Promise<Exam | null> {
    const prisma = this.prismaGetter();
    return prisma.exam.findUnique({
      where: { id },
    });
  }

  async findByIdAndUser(id: string, userId: string): Promise<Exam | null> {
    const prisma = this.prismaGetter();
    return prisma.exam.findFirst({
      where: { id, userId },
    });
  }
}
