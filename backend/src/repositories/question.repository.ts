import type {
  Alternative,
  Prisma,
  PrismaClient,
  Question,
} from '@prisma/client';
import { getPrismaClient } from '../config/database.ts';
import type {
  AlternativeDTO,
  QuestionBaseDTO,
  QuestionOwnerDetailDTO,
  QuestionPublicViewDTO,
} from '../types/question.types.ts';
import type {
  ParsedCreateQuestionInput,
  ParsedListQuestionsQuery,
  ParsedUpdateQuestionInput,
} from '../validators/question.validator.ts';

export type QuestionWithAlternatives = Question & {
  alternatives: Alternative[];
};

export interface PaginatedQuestionEntities {
  items: QuestionWithAlternatives[];
  total: number;
}

export interface IQuestionRepository {
  create(userId: string, data: ParsedCreateQuestionInput): Promise<QuestionWithAlternatives>;
  findById(id: string): Promise<QuestionWithAlternatives | null>;
  findManyByUser(
    userId: string,
    query: ParsedListQuestionsQuery
  ): Promise<PaginatedQuestionEntities>;
  updateAtomically(
    id: string,
    data: ParsedUpdateQuestionInput
  ): Promise<QuestionWithAlternatives>;
  deleteById(id: string): Promise<void>;
}

function mapBaseFields(entity: QuestionWithAlternatives): QuestionBaseDTO {
  const sortedAlternatives: AlternativeDTO[] = [...entity.alternatives]
    .sort((a, b) => a.position - b.position)
    .map((alt) => ({
      id: alt.id,
      letter: alt.letter,
      text: alt.text,
      position: alt.position,
    }));

  return {
    id: entity.id,
    userId: entity.userId,
    examId: entity.examId,
    originalNumber: entity.originalNumber,
    statement: entity.statement,
    type: entity.type,
    subject: entity.subject,
    topic: entity.topic,
    subtopic: entity.subtopic,
    board: entity.board,
    examTitle: entity.examTitle,
    year: entity.year,
    difficulty: entity.difficulty,
    sourcePage: entity.sourcePage,
    status: entity.status,
    hasAnswerKey: Boolean(entity.correctAnswer),
    hasExplanation: Boolean(entity.explanation),
    alternatives: sortedAlternatives,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

/**
 * Mapeia a entidade para o DTO público padrão de estudo (sem expor `correctAnswer` nem `explanation`).
 */
export function toQuestionPublicViewDTO(
  entity: QuestionWithAlternatives
): QuestionPublicViewDTO {
  return {
    ...mapBaseFields(entity),
    answerKeyRevealed: false,
  };
}

/**
 * Mapeia a entidade para o DTO completo autorizado ao proprietário (incluindo `correctAnswer` e `explanation`).
 */
export function toQuestionOwnerDetailDTO(
  entity: QuestionWithAlternatives
): QuestionOwnerDetailDTO {
  return {
    ...mapBaseFields(entity),
    answerKeyRevealed: true,
    correctAnswer: entity.correctAnswer,
    explanation: entity.explanation,
  };
}

export class PrismaQuestionRepository implements IQuestionRepository {
  private readonly prismaGetter: () => PrismaClient;

  constructor(customClient?: PrismaClient) {
    this.prismaGetter = customClient ? () => customClient : () => getPrismaClient();
  }

  async create(
    userId: string,
    data: ParsedCreateQuestionInput
  ): Promise<QuestionWithAlternatives> {
    const prisma = this.prismaGetter();

    return prisma.question.create({
      data: {
        userId,
        statement: data.statement,
        type: data.type,
        subject: data.subject,
        topic: data.topic ?? null,
        subtopic: data.subtopic ?? null,
        board: data.board ?? null,
        examTitle: data.examTitle ?? null,
        year: data.year ?? null,
        originalNumber: data.originalNumber ?? null,
        difficulty: data.difficulty ?? null,
        correctAnswer: data.correctAnswer ?? null,
        explanation: data.explanation ?? null,
        sourcePage: data.sourcePage ?? null,
        status: data.status,
        alternatives: {
          create: data.alternatives.map((alt, index) => ({
            letter: alt.letter,
            text: alt.text,
            position: index + 1,
          })),
        },
      },
      include: {
        alternatives: {
          orderBy: { position: 'asc' },
        },
      },
    });
  }

  async findById(id: string): Promise<QuestionWithAlternatives | null> {
    const prisma = this.prismaGetter();
    return prisma.question.findUnique({
      where: { id },
      include: {
        alternatives: {
          orderBy: { position: 'asc' },
        },
      },
    });
  }

  async findManyByUser(
    userId: string,
    query: ParsedListQuestionsQuery
  ): Promise<PaginatedQuestionEntities> {
    const prisma = this.prismaGetter();

    const where: Prisma.QuestionWhereInput = {
      userId,
      ...(query.subject
        ? { subject: { contains: query.subject, mode: 'insensitive' } }
        : {}),
      ...(query.topic ? { topic: { contains: query.topic, mode: 'insensitive' } } : {}),
      ...(query.board ? { board: { contains: query.board, mode: 'insensitive' } } : {}),
      ...(query.examTitle
        ? { examTitle: { contains: query.examTitle, mode: 'insensitive' } }
        : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(query.search
        ? {
            OR: [
              { statement: { contains: query.search, mode: 'insensitive' } },
              { subject: { contains: query.search, mode: 'insensitive' } },
              { topic: { contains: query.search, mode: 'insensitive' } },
              { board: { contains: query.search, mode: 'insensitive' } },
              { examTitle: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await prisma.$transaction([
      prisma.question.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          alternatives: {
            orderBy: { position: 'asc' },
          },
        },
      }),
      prisma.question.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Atualiza os metadados da questão e substitui suas alternativas de maneira atômica
   * dentro de uma transação do Prisma (`$transaction`).
   */
  async updateAtomically(
    id: string,
    data: ParsedUpdateQuestionInput
  ): Promise<QuestionWithAlternatives> {
    const prisma = this.prismaGetter();

    return prisma.$transaction(async (tx) => {
      if (data.alternatives !== undefined) {
        await tx.alternative.deleteMany({
          where: { questionId: id },
        });
      }

      return tx.question.update({
        where: { id },
        data: {
          ...(data.statement !== undefined ? { statement: data.statement } : {}),
          ...(data.type !== undefined ? { type: data.type } : {}),
          ...(data.subject !== undefined ? { subject: data.subject } : {}),
          ...(data.topic !== undefined ? { topic: data.topic } : {}),
          ...(data.subtopic !== undefined ? { subtopic: data.subtopic } : {}),
          ...(data.board !== undefined ? { board: data.board } : {}),
          ...(data.examTitle !== undefined ? { examTitle: data.examTitle } : {}),
          ...(data.year !== undefined ? { year: data.year } : {}),
          ...(data.originalNumber !== undefined
            ? { originalNumber: data.originalNumber }
            : {}),
          ...(data.difficulty !== undefined ? { difficulty: data.difficulty } : {}),
          ...(data.correctAnswer !== undefined ? { correctAnswer: data.correctAnswer } : {}),
          ...(data.explanation !== undefined ? { explanation: data.explanation } : {}),
          ...(data.sourcePage !== undefined ? { sourcePage: data.sourcePage } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.alternatives !== undefined
            ? {
                alternatives: {
                  create: data.alternatives.map((alt, index) => ({
                    letter: alt.letter,
                    text: alt.text,
                    position: index + 1,
                  })),
                },
              }
            : {}),
        },
        include: {
          alternatives: {
            orderBy: { position: 'asc' },
          },
        },
      });
    });
  }

  async deleteById(id: string): Promise<void> {
    const prisma = this.prismaGetter();
    await prisma.question.delete({
      where: { id },
    });
  }
}
