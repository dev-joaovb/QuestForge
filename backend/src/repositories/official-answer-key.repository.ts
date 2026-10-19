import type {
  OfficialAnswerKey,
  OfficialAnswerKeyItem,
  PrismaClient,
} from '@prisma/client';
import { getPrismaClient } from '../config/database.ts';
import {
  OfficialAnswerKeyError,
  type CreateOfficialAnswerKeyDraftInput,
  type CreateOfficialAnswerKeyItemInput,
  type FindAnswerKeyItemsOptions,
  type FindAnswerKeyOptions,
  type FindAnswerKeyVersionsOptions,
  type OfficialAnswerKeyWithItems,
  type UpdateOfficialAnswerKeyDraftInput,
  type UpdateOfficialAnswerKeyItemInput,
} from '../types/official-answer-key.types.ts';

/**
 * Valida previamente em memória se a coleção de itens contém números de questão duplicados.
 * Impede que itens existentes sejam deletados ou modificados antes da detecção do erro.
 */
function assertUniqueQuestionNumbers(
  items: readonly CreateOfficialAnswerKeyItemInput[]
): void {
  const seenNumbers = new Set<number>();
  for (const item of items) {
    if (seenNumbers.has(item.questionNumber)) {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_DUPLICATE_ITEM',
        `Número de questão duplicado no gabarito: questão ${item.questionNumber}.`,
        422
      );
    }
    seenNumbers.add(item.questionNumber);
  }
}

/**
 * Verifica se um erro lançado pelo Prisma é de violação de restrição única (P2002).
 */
function isPrismaUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { code?: unknown }).code === 'P2002';
}

/**
 * Extrai o alvo da restrição única do erro do Prisma para mapeamento de domínio.
 */
function getPrismaConstraintTarget(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const candidate = error as {
    meta?: {
      target?: unknown;
      constraint?: unknown;
      modelName?: unknown;
    };
    message?: string;
  };
  const meta = candidate.meta;
  if (!meta) return candidate.message ?? '';

  if (Array.isArray(meta.target)) {
    return meta.target.join(',');
  }
  if (typeof meta.target === 'string') {
    return meta.target;
  }
  if (typeof meta.constraint === 'string') {
    return meta.constraint;
  }
  return candidate.message ?? '';
}

/**
 * Converte de forma controlada violações de unicidade do PostgreSQL/Prisma
 * em erros de domínio padronizados (OfficialAnswerKeyError), evitando expor
 * detalhes de conexão, SQL ou dados sensíveis ao cliente.
 */
function handlePrismaUniqueError(
  error: unknown,
  context: 'publish' | 'create_draft' | 'add_item'
): never {
  if (isPrismaUniqueConstraintError(error)) {
    const target = getPrismaConstraintTarget(error);

    // Conflito do índice parcial único: official_answer_keys_exam_current_unique (WHERE "isCurrent" = true)
    if (
      target.includes('official_answer_keys_exam_current_unique') ||
      target.includes('isCurrent') ||
      (context === 'publish' && target.includes('examId') && !target.includes('version'))
    ) {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_PUBLISH_CONFLICT',
        'Conflito de publicação concorrente: outra versão deste gabarito oficial foi ativada simultaneamente.',
        409,
        { cause: error }
      );
    }

    // Duplicidade de versão: @@unique([examId, type, version])
    if (
      target.includes('version') ||
      target.includes('official_answer_keys_examId_type_version_key') ||
      target.includes('examId,type,version')
    ) {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_DUPLICATE_VERSION',
        'Já existe um gabarito oficial com esta versão para esta prova.',
        409,
        { cause: error }
      );
    }

    // Duplicidade de item: @@unique([answerKeyId, questionNumber])
    if (
      target.includes('questionNumber') ||
      target.includes('official_answer_key_items_answerKeyId_questionNumber_key') ||
      target.includes('answerKeyId,questionNumber')
    ) {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_DUPLICATE_ITEM',
        'Já existe um item com este número de questão neste gabarito oficial.',
        context === 'add_item' ? 422 : 409,
        { cause: error }
      );
    }

    if (context === 'publish') {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_PUBLISH_CONFLICT',
        'Conflito de unicidade ao publicar o gabarito oficial.',
        409,
        { cause: error }
      );
    }
  }

  throw error;
}

export interface IOfficialAnswerKeyRepository {
  createDraft(data: CreateOfficialAnswerKeyDraftInput): Promise<OfficialAnswerKeyWithItems>;
  findById(
    id: string,
    userId: string,
    options?: FindAnswerKeyOptions
  ): Promise<(OfficialAnswerKey & { items?: OfficialAnswerKeyItem[] }) | null>;
  findByIdWithItems(id: string, userId: string): Promise<OfficialAnswerKeyWithItems | null>;
  findCurrentByExamId(
    examId: string,
    userId: string,
    options?: FindAnswerKeyOptions
  ): Promise<(OfficialAnswerKey & { items?: OfficialAnswerKeyItem[] }) | null>;
  findCurrentByExamIdWithItems(
    examId: string,
    userId: string
  ): Promise<OfficialAnswerKeyWithItems | null>;
  findVersionsByExamId(
    examId: string,
    userId: string,
    options?: FindAnswerKeyVersionsOptions
  ): Promise<OfficialAnswerKey[]>;
  findItemsByAnswerKeyId(
    answerKeyId: string,
    userId: string,
    options?: FindAnswerKeyItemsOptions
  ): Promise<OfficialAnswerKeyItem[]>;
  findItemByQuestionNumber(
    answerKeyId: string,
    questionNumber: number,
    userId: string
  ): Promise<OfficialAnswerKeyItem | null>;
  updateDraft(
    id: string,
    userId: string,
    data: UpdateOfficialAnswerKeyDraftInput
  ): Promise<OfficialAnswerKeyWithItems>;
  updateDraftItem(
    answerKeyId: string,
    questionNumber: number,
    userId: string,
    data: UpdateOfficialAnswerKeyItemInput
  ): Promise<OfficialAnswerKeyItem>;
  addDraftItem(
    answerKeyId: string,
    userId: string,
    item: CreateOfficialAnswerKeyItemInput
  ): Promise<OfficialAnswerKeyItem>;
  replaceDraftItems(
    answerKeyId: string,
    userId: string,
    items: CreateOfficialAnswerKeyItemInput[]
  ): Promise<OfficialAnswerKeyItem[]>;
  deleteDraft(id: string, userId: string): Promise<boolean>;
  publishDraft(
    id: string,
    userId: string,
    publicationDate?: Date | null
  ): Promise<OfficialAnswerKeyWithItems>;
}

export class PrismaOfficialAnswerKeyRepository implements IOfficialAnswerKeyRepository {
  private readonly prismaGetter: () => PrismaClient;

  constructor(customClient?: PrismaClient) {
    this.prismaGetter = customClient ? () => customClient : () => getPrismaClient();
  }

  /**
   * Cria um gabarito oficial garantindo que ele nasça estritamente no estado DRAFT
   * e com `isCurrent: false`.
   *
   * A publicação e ativação de vigência (`isCurrent = true`) são operações orquestradas
   * exclusivamente pela camada de serviço em transação de domínio.
   */
  async createDraft(
    data: CreateOfficialAnswerKeyDraftInput
  ): Promise<OfficialAnswerKeyWithItems> {
    const prisma = this.prismaGetter();

    if (data.items && data.items.length > 0) {
      assertUniqueQuestionNumbers(data.items);
    }

    try {
      return await prisma.officialAnswerKey.create({
        data: {
          userId: data.userId,
          examId: data.examId,
          pdfDocumentId: data.pdfDocumentId ?? null,
          type: data.type ?? 'PRELIMINARY',
          status: 'DRAFT',
          version: data.version ?? 1,
          isCurrent: false,
          publicationDate: data.publicationDate ?? null,
          notes: data.notes ?? null,
          items:
            data.items && data.items.length > 0
              ? {
                  create: data.items.map((item) => ({
                    questionNumber: item.questionNumber,
                    questionId: item.questionId ?? null,
                    correctAnswer: item.correctAnswer ?? null,
                    previousAnswer: item.previousAnswer ?? null,
                    status: item.status ?? 'ACTIVE',
                    isAnnulled: item.isAnnulled ?? false,
                    justification: item.justification ?? null,
                    textEvidence: item.textEvidence ?? null,
                    confidence: item.confidence ?? null,
                    sourcePage: item.sourcePage ?? null,
                  })),
                }
              : undefined,
        },
        include: {
          items: {
            orderBy: { questionNumber: 'asc' },
          },
        },
      });
    } catch (error) {
      if (error instanceof OfficialAnswerKeyError) {
        throw error;
      }
      handlePrismaUniqueError(error, 'create_draft');
    }
  }

  /**
   * Busca um gabarito oficial por ID com isolamento obrigatório de proprietário (userId)
   * e inclusão opcional dos itens associados.
   */
  async findById(
    id: string,
    userId: string,
    options?: FindAnswerKeyOptions
  ): Promise<(OfficialAnswerKey & { items?: OfficialAnswerKeyItem[] }) | null> {
    const prisma = this.prismaGetter();

    return prisma.officialAnswerKey.findFirst({
      where: {
        id,
        userId,
      },
      ...(options?.includeItems
        ? {
            include: {
              items: {
                orderBy: { questionNumber: 'asc' },
              },
            },
          }
        : {}),
    });
  }

  /**
   * Busca um gabarito oficial por ID com isolamento obrigatório de proprietário,
   * garantindo a inclusão de seus itens ordenados por `questionNumber`.
   */
  async findByIdWithItems(
    id: string,
    userId: string
  ): Promise<OfficialAnswerKeyWithItems | null> {
    const prisma = this.prismaGetter();

    return prisma.officialAnswerKey.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        items: {
          orderBy: { questionNumber: 'asc' },
        },
      },
    });
  }

  /**
   * Busca o gabarito oficial vigente (`isCurrent = true`) de uma prova específica,
   * com isolamento obrigatório de usuário e inclusão condicional de itens.
   */
  async findCurrentByExamId(
    examId: string,
    userId: string,
    options?: FindAnswerKeyOptions
  ): Promise<(OfficialAnswerKey & { items?: OfficialAnswerKeyItem[] }) | null> {
    const prisma = this.prismaGetter();

    return prisma.officialAnswerKey.findFirst({
      where: {
        examId,
        userId,
        isCurrent: true,
      },
      ...(options?.includeItems
        ? {
            include: {
              items: {
                orderBy: { questionNumber: 'asc' },
              },
            },
          }
        : {}),
    });
  }

  /**
   * Busca o gabarito oficial vigente de uma prova com isolamento obrigatório de usuário
   * e todos os itens carregados.
   */
  async findCurrentByExamIdWithItems(
    examId: string,
    userId: string
  ): Promise<OfficialAnswerKeyWithItems | null> {
    const prisma = this.prismaGetter();

    return prisma.officialAnswerKey.findFirst({
      where: {
        examId,
        userId,
        isCurrent: true,
      },
      include: {
        items: {
          orderBy: { questionNumber: 'asc' },
        },
      },
    });
  }

  /**
   * Lista o histórico de versões de gabarito para uma prova pertencente ao usuário,
   * ordenado decrescentemente por versão e data de criação.
   * Não carrega itens para manter a consulta rápida e leve.
   */
  async findVersionsByExamId(
    examId: string,
    userId: string,
    options?: FindAnswerKeyVersionsOptions
  ): Promise<OfficialAnswerKey[]> {
    const prisma = this.prismaGetter();

    return prisma.officialAnswerKey.findMany({
      where: {
        examId,
        userId,
        ...(options?.type ? { type: options.type } : {}),
      },
      orderBy: [
        { version: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  /**
   * Consulta os itens de um gabarito específico com isolamento obrigatório de tenant
   * via relação `answerKey.userId` e filtro opcional por status do item.
   */
  async findItemsByAnswerKeyId(
    answerKeyId: string,
    userId: string,
    options?: FindAnswerKeyItemsOptions
  ): Promise<OfficialAnswerKeyItem[]> {
    const prisma = this.prismaGetter();

    return prisma.officialAnswerKeyItem.findMany({
      where: {
        answerKeyId,
        ...(options?.status ? { status: options.status } : {}),
        answerKey: {
          userId,
        },
      },
      orderBy: { questionNumber: 'asc' },
    });
  }

  /**
   * Consulta um item específico por número de questão dentro de um gabarito
   * com isolamento de tenant.
   */
  async findItemByQuestionNumber(
    answerKeyId: string,
    questionNumber: number,
    userId: string
  ): Promise<OfficialAnswerKeyItem | null> {
    const prisma = this.prismaGetter();

    return prisma.officialAnswerKeyItem.findFirst({
      where: {
        answerKeyId,
        questionNumber,
        answerKey: {
          userId,
        },
      },
    });
  }

  /**
   * Atualiza metadados e opcionalmente substitui os itens de um gabarito em estado DRAFT.
   *
   * Mecanismo de concorrência:
   * Executa a mutação dentro de uma transação (`$transaction`), aplicando uma atualização
   * condicional atômica (`updateMany({ where: { id, userId, status: 'DRAFT' } })`).
   * No PostgreSQL, essa atualização adquire bloqueio exclusivo de escrita na linha (row lock).
   * Se o registro já tiver sido publicado ou pertencer a outro usuário, a atualização afeta
   * 0 linhas e a transação é abortada antes de tocar em qualquer item, prevenindo TOCTOU.
   */
  async updateDraft(
    id: string,
    userId: string,
    data: UpdateOfficialAnswerKeyDraftInput
  ): Promise<OfficialAnswerKeyWithItems> {
    const prisma = this.prismaGetter();

    if (data.items !== undefined) {
      assertUniqueQuestionNumbers(data.items);
    }

    return prisma.$transaction(async (tx) => {
      const updateResult = await tx.officialAnswerKey.updateMany({
        where: {
          id,
          userId,
          status: 'DRAFT',
        },
        data: {
          ...(data.type !== undefined ? { type: data.type } : {}),
          ...(data.version !== undefined ? { version: data.version } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.publicationDate !== undefined
            ? { publicationDate: data.publicationDate }
            : {}),
          ...(data.pdfDocumentId !== undefined
            ? { pdfDocumentId: data.pdfDocumentId }
            : {}),
          updatedAt: new Date(),
        },
      });

      if (updateResult.count === 0) {
        const existing = await tx.officialAnswerKey.findFirst({
          where: { id, userId },
          select: { id: true, status: true },
        });

        if (!existing) {
          throw new OfficialAnswerKeyError(
            'ANSWER_KEY_NOT_FOUND',
            'Gabarito oficial não encontrado.',
            404
          );
        }

        throw new OfficialAnswerKeyError(
          'ANSWER_KEY_NOT_DRAFT',
          `Apenas gabaritos em estado DRAFT podem ser editados. Status atual: ${existing.status}`,
          422
        );
      }

      if (data.items !== undefined) {
        await tx.officialAnswerKeyItem.deleteMany({
          where: { answerKeyId: id },
        });

        if (data.items.length > 0) {
          await tx.officialAnswerKeyItem.createMany({
            data: data.items.map((item) => ({
              answerKeyId: id,
              questionNumber: item.questionNumber,
              questionId: item.questionId ?? null,
              correctAnswer: item.correctAnswer ?? null,
              previousAnswer: item.previousAnswer ?? null,
              status: item.status ?? 'ACTIVE',
              isAnnulled: item.isAnnulled ?? false,
              justification: item.justification ?? null,
              textEvidence: item.textEvidence ?? null,
              confidence: item.confidence ?? null,
              sourcePage: item.sourcePage ?? null,
            })),
          });
        }
      }

      const updated = await tx.officialAnswerKey.findFirst({
        where: { id, userId },
        include: {
          items: {
            orderBy: { questionNumber: 'asc' },
          },
        },
      });

      return updated!;
    });
  }

  /**
   * Atualiza um item individual pertencente a um gabarito em estado DRAFT.
   *
   * Mecanismo de concorrência:
   * Executa a verificação do gabarito pai, a conferência do item e a mutação
   * no mesmo contexto transacional (`$transaction`).
   * A condição `status: 'DRAFT'` e o `userId` são validados atomicamente no gabarito pai
   * adquirindo o bloqueio da linha antes de aplicar o update do item.
   */
  async updateDraftItem(
    answerKeyId: string,
    questionNumber: number,
    userId: string,
    data: UpdateOfficialAnswerKeyItemInput
  ): Promise<OfficialAnswerKeyItem> {
    const prisma = this.prismaGetter();

    return prisma.$transaction(async (tx) => {
      const parentLock = await tx.officialAnswerKey.updateMany({
        where: {
          id: answerKeyId,
          userId,
          status: 'DRAFT',
        },
        data: {
          updatedAt: new Date(),
        },
      });

      if (parentLock.count === 0) {
        const parent = await tx.officialAnswerKey.findFirst({
          where: { id: answerKeyId, userId },
          select: { id: true, status: true },
        });

        if (!parent) {
          throw new OfficialAnswerKeyError(
            'ANSWER_KEY_NOT_FOUND',
            'Gabarito oficial não encontrado.',
            404
          );
        }

        throw new OfficialAnswerKeyError(
          'ANSWER_KEY_NOT_DRAFT',
          `Apenas itens de gabaritos em estado DRAFT podem ser modificados. Status atual: ${parent.status}`,
          422
        );
      }

      const existingItem = await tx.officialAnswerKeyItem.findFirst({
        where: {
          answerKeyId,
          questionNumber,
        },
      });

      if (!existingItem) {
        throw new OfficialAnswerKeyError(
          'ANSWER_KEY_ITEM_NOT_FOUND',
          `Item da questão ${questionNumber} não encontrado no gabarito oficial.`,
          404
        );
      }

      return tx.officialAnswerKeyItem.update({
        where: { id: existingItem.id },
        data: {
          ...(data.questionId !== undefined ? { questionId: data.questionId } : {}),
          ...(data.correctAnswer !== undefined ? { correctAnswer: data.correctAnswer } : {}),
          ...(data.previousAnswer !== undefined
            ? { previousAnswer: data.previousAnswer }
            : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.isAnnulled !== undefined ? { isAnnulled: data.isAnnulled } : {}),
          ...(data.justification !== undefined ? { justification: data.justification } : {}),
          ...(data.textEvidence !== undefined ? { textEvidence: data.textEvidence } : {}),
          ...(data.confidence !== undefined ? { confidence: data.confidence } : {}),
          ...(data.sourcePage !== undefined ? { sourcePage: data.sourcePage } : {}),
        },
      });
    });
  }

  /**
   * Substitui atomicamente todos os itens de um rascunho de gabarito oficial.
   *
   * Mecanismo de concorrência:
   * 1. Validação em memória de unicidade de `questionNumber` antes de iniciar a transação.
   * 2. Bloqueio e verificação condicional atômica (`status = 'DRAFT'` e `userId = userId`)
   *    do gabarito pai dentro da transação.
   * 3. Execução de `deleteMany` e `createMany` no mesmo cliente transacional `tx`.
   *    Se qualquer operação falhar, o PostgreSQL faz rollback de todas as mutações.
   */
  async replaceDraftItems(
    answerKeyId: string,
    userId: string,
    items: CreateOfficialAnswerKeyItemInput[]
  ): Promise<OfficialAnswerKeyItem[]> {
    const prisma = this.prismaGetter();

    assertUniqueQuestionNumbers(items);

    return prisma.$transaction(async (tx) => {
      const parentLock = await tx.officialAnswerKey.updateMany({
        where: {
          id: answerKeyId,
          userId,
          status: 'DRAFT',
        },
        data: {
          updatedAt: new Date(),
        },
      });

      if (parentLock.count === 0) {
        const parent = await tx.officialAnswerKey.findFirst({
          where: { id: answerKeyId, userId },
          select: { id: true, status: true },
        });

        if (!parent) {
          throw new OfficialAnswerKeyError(
            'ANSWER_KEY_NOT_FOUND',
            'Gabarito oficial não encontrado.',
            404
          );
        }

        throw new OfficialAnswerKeyError(
          'ANSWER_KEY_NOT_DRAFT',
          `Apenas itens de gabaritos em estado DRAFT podem ser substituídos. Status atual: ${parent.status}`,
          422
        );
      }

      await tx.officialAnswerKeyItem.deleteMany({
        where: { answerKeyId },
      });

      if (items.length === 0) {
        return [];
      }

      await tx.officialAnswerKeyItem.createMany({
        data: items.map((item) => ({
          answerKeyId,
          questionNumber: item.questionNumber,
          questionId: item.questionId ?? null,
          correctAnswer: item.correctAnswer ?? null,
          previousAnswer: item.previousAnswer ?? null,
          status: item.status ?? 'ACTIVE',
          isAnnulled: item.isAnnulled ?? false,
          justification: item.justification ?? null,
          textEvidence: item.textEvidence ?? null,
          confidence: item.confidence ?? null,
          sourcePage: item.sourcePage ?? null,
        })),
      });

      return tx.officialAnswerKeyItem.findMany({
        where: { answerKeyId },
        orderBy: { questionNumber: 'asc' },
      });
    });
  }

  /**
   * Exclui um gabarito oficial atomicamente e exclusivamente se ele pertencer ao usuário
   * e estiver em estado DRAFT.
   *
   * Mecanismo de concorrência:
   * Executa `deleteMany` com `where: { id, userId, status: 'DRAFT' }` em um único comando SQL.
   * Não há condição de corrida entre checar e deletar: se o gabarito foi publicado
   * concorrentemente, o comando afeta 0 linhas e não remove a versão publicada.
   */
  async deleteDraft(id: string, userId: string): Promise<boolean> {
    const prisma = this.prismaGetter();

    const deleteResult = await prisma.officialAnswerKey.deleteMany({
      where: {
        id,
        userId,
        status: 'DRAFT',
      },
    });

    if (deleteResult.count === 0) {
      const existing = await prisma.officialAnswerKey.findFirst({
        where: { id, userId },
        select: { id: true, status: true },
      });

      if (!existing) {
        return false;
      }

      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_NOT_DRAFT',
        `Apenas gabaritos em estado DRAFT podem ser excluídos pelo repositório. Status atual: ${existing.status}`,
        422
      );
    }

    return true;
  }

  /**
   * Adiciona um novo item individual a um gabarito em estado DRAFT de forma atômica.
   */
  async addDraftItem(
    answerKeyId: string,
    userId: string,
    item: CreateOfficialAnswerKeyItemInput
  ): Promise<OfficialAnswerKeyItem> {
    const prisma = this.prismaGetter();

    try {
      return await prisma.$transaction(async (tx) => {
        const parentLock = await tx.officialAnswerKey.updateMany({
          where: {
            id: answerKeyId,
            userId,
            status: 'DRAFT',
          },
          data: {
            updatedAt: new Date(),
          },
        });

        if (parentLock.count === 0) {
          const parent = await tx.officialAnswerKey.findFirst({
            where: { id: answerKeyId, userId },
            select: { id: true, status: true },
          });

          if (!parent) {
            throw new OfficialAnswerKeyError(
              'ANSWER_KEY_NOT_FOUND',
              'Gabarito oficial não encontrado.',
              404
            );
          }

          throw new OfficialAnswerKeyError(
            'ANSWER_KEY_NOT_DRAFT',
            `Apenas gabaritos em estado DRAFT podem receber novos itens. Status atual: ${parent.status}`,
            422
          );
        }

        const existingItem = await tx.officialAnswerKeyItem.findFirst({
          where: {
            answerKeyId,
            questionNumber: item.questionNumber,
          },
        });

        if (existingItem) {
          throw new OfficialAnswerKeyError(
            'ANSWER_KEY_DUPLICATE_ITEM',
            `Já existe um item com o número de questão ${item.questionNumber} neste gabarito oficial.`,
            422
          );
        }

        return tx.officialAnswerKeyItem.create({
          data: {
            answerKeyId,
            questionNumber: item.questionNumber,
            questionId: item.questionId ?? null,
            correctAnswer: item.correctAnswer ?? null,
            previousAnswer: item.previousAnswer ?? null,
            status: item.status ?? 'ACTIVE',
            isAnnulled: item.isAnnulled ?? false,
            justification: item.justification ?? null,
            textEvidence: item.textEvidence ?? null,
            confidence: item.confidence ?? null,
            sourcePage: item.sourcePage ?? null,
          },
        });
      });
    } catch (error) {
      if (error instanceof OfficialAnswerKeyError) {
        throw error;
      }
      handlePrismaUniqueError(error, 'add_item');
    }
  }

  /**
   * Publica atomicamente um gabarito oficial em estado DRAFT, ativando sua vigência (`isCurrent = true`).
   *
   * Ordem de execução e garantias de concorrência (Sprint 5.2.4-Fix):
   * 1. Adquire bloqueio exclusivo condicional sobre o pai (`updateMany({ id, userId, status: 'DRAFT' })`).
   * 2. Releitura de todos os itens do gabarito exclusivamente através do cliente transacional `tx`.
   * 3. Validação final rigorosa dos itens relidos (itens > 0, sem NEEDS_REVIEW, resposta obrigatória
   *    para itens ativos e coerência estrita de anulação). Em caso de violação, aborta e faz rollback.
   * 4. Desativa a versão vigente anterior da mesma prova (`isCurrent = false`, `status = 'SUPERSEDED'`).
   * 5. Ativa a nova versão como publicada e vigente (`status = 'PUBLISHED'`, `isCurrent = true`).
   * 6. Converte conflitos de concorrência ou unicidade do PostgreSQL/Prisma (P2002) em erros de domínio (409).
   */
  async publishDraft(
    id: string,
    userId: string,
    publicationDate?: Date | null
  ): Promise<OfficialAnswerKeyWithItems> {
    const prisma = this.prismaGetter();

    try {
      return await prisma.$transaction(async (tx) => {
        // 1. Adquire bloqueio condicional exclusivo no registro pai
        const parentLock = await tx.officialAnswerKey.updateMany({
          where: {
            id,
            userId,
            status: 'DRAFT',
          },
          data: {
            updatedAt: new Date(),
          },
        });

        if (parentLock.count === 0) {
          const existing = await tx.officialAnswerKey.findFirst({
            where: { id, userId },
            select: { id: true, status: true },
          });

          if (!existing) {
            throw new OfficialAnswerKeyError(
              'ANSWER_KEY_NOT_FOUND',
              'Gabarito oficial não encontrado.',
              404
            );
          }

          throw new OfficialAnswerKeyError(
            'ANSWER_KEY_NOT_DRAFT',
            `Apenas gabaritos em estado DRAFT podem ser publicados. Status atual: ${existing.status}`,
            422
          );
        }

        const targetDraft = await tx.officialAnswerKey.findFirst({
          where: { id, userId },
          select: { id: true, examId: true },
        });

        if (!targetDraft) {
          throw new OfficialAnswerKeyError(
            'ANSWER_KEY_NOT_FOUND',
            'Gabarito oficial não encontrado.',
            404
          );
        }

        // 2. Releitura dos itens usando exclusivamente o cliente transacional tx após o lock
        const currentItems = await tx.officialAnswerKeyItem.findMany({
          where: { answerKeyId: id },
          orderBy: { questionNumber: 'asc' },
        });

        // 3. Validação transacional do estado persistido mais recente antes de qualquer alteração
        if (!currentItems || currentItems.length === 0) {
          throw new OfficialAnswerKeyError(
            'ANSWER_KEY_INVALID_DATA',
            'Não é possível publicar um gabarito oficial sem itens cadastrados.',
            400
          );
        }

        for (const item of currentItems) {
          if (item.status === 'NEEDS_REVIEW') {
            throw new OfficialAnswerKeyError(
              'ANSWER_KEY_INVALID_DATA',
              `Não é possível publicar o gabarito com itens pendentes de revisão humana (questão ${item.questionNumber}).`,
              400
            );
          }

          if (!item.isAnnulled && item.status !== 'ANNULLED') {
            if (!item.correctAnswer || item.correctAnswer.trim() === '') {
              throw new OfficialAnswerKeyError(
                'ANSWER_KEY_INVALID_DATA',
                `Item da questão ${item.questionNumber} não possui resposta correta definida.`,
                400
              );
            }
          }

          if (item.status === 'ANNULLED' && !item.isAnnulled) {
            throw new OfficialAnswerKeyError(
              'ANSWER_KEY_INVALID_DATA',
              `Item da questão ${item.questionNumber} possui status ANNULLED mas isAnnulled false.`,
              400
            );
          }

          if (item.isAnnulled && item.status !== 'ANNULLED') {
            throw new OfficialAnswerKeyError(
              'ANSWER_KEY_INVALID_DATA',
              `Item da questão ${item.questionNumber} possui isAnnulled true mas status não é ANNULLED.`,
              400
            );
          }
        }

        // 4. Desativa versão vigente anterior da mesma prova para respeitar o índice único parcial
        await tx.officialAnswerKey.updateMany({
          where: {
            examId: targetDraft.examId,
            isCurrent: true,
          },
          data: {
            isCurrent: false,
            status: 'SUPERSEDED',
            updatedAt: new Date(),
          },
        });

        // 5. Ativa a nova versão como publicada e vigente
        await tx.officialAnswerKey.update({
          where: { id },
          data: {
            status: 'PUBLISHED',
            isCurrent: true,
            publicationDate: publicationDate ?? new Date(),
            updatedAt: new Date(),
          },
        });

        // 6. Retorna registro publicado com os itens transacionalmente validados
        const published = await tx.officialAnswerKey.findFirst({
          where: { id, userId },
          include: {
            items: {
              orderBy: { questionNumber: 'asc' },
            },
          },
        });

        return published!;
      });
    } catch (error) {
      if (error instanceof OfficialAnswerKeyError) {
        throw error;
      }
      handlePrismaUniqueError(error, 'publish');
    }
  }
}
