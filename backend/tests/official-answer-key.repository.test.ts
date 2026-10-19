import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  AnswerKeyItemStatus,
  AnswerKeyStatus,
  AnswerKeyType,
  OfficialAnswerKey,
  OfficialAnswerKeyItem,
  PrismaClient,
} from '@prisma/client';
import {
  PrismaOfficialAnswerKeyRepository,
} from '../src/repositories/official-answer-key.repository.ts';
import {
  OfficialAnswerKeyError,
  type CreateOfficialAnswerKeyDraftInput,
  type CreateOfficialAnswerKeyItemInput,
  type UpdateOfficialAnswerKeyDraftInput,
  type UpdateOfficialAnswerKeyItemInput,
} from '../src/types/official-answer-key.types.ts';

describe('PrismaOfficialAnswerKeyRepository (backend/src/repositories/official-answer-key.repository.ts)', () => {
  let mockPrisma: any;
  let repository: PrismaOfficialAnswerKeyRepository;

  const mockDate = new Date('2026-10-14T12:00:00.000Z');

  const baseAnswerKey: OfficialAnswerKey = {
    id: 'key-123',
    userId: 'user-owner-1',
    examId: 'exam-456',
    pdfDocumentId: 'pdf-789',
    type: 'PRELIMINARY' as AnswerKeyType,
    status: 'DRAFT' as AnswerKeyStatus,
    version: 1,
    isCurrent: false,
    publicationDate: null,
    notes: 'Rascunho inicial do gabarito preliminar',
    createdAt: mockDate,
    updatedAt: mockDate,
  };

  const baseItems: OfficialAnswerKeyItem[] = [
    {
      id: 'item-1',
      answerKeyId: 'key-123',
      questionNumber: 1,
      questionId: 'q-1',
      correctAnswer: 'A',
      previousAnswer: null,
      status: 'ACTIVE' as AnswerKeyItemStatus,
      isAnnulled: false,
      justification: null,
      textEvidence: '1. A',
      confidence: 0.95,
      sourcePage: 1,
      createdAt: mockDate,
      updatedAt: mockDate,
    },
    {
      id: 'item-2',
      answerKeyId: 'key-123',
      questionNumber: 2,
      questionId: 'q-2',
      correctAnswer: 'C',
      previousAnswer: null,
      status: 'ACTIVE' as AnswerKeyItemStatus,
      isAnnulled: false,
      justification: null,
      textEvidence: '2. C',
      confidence: 0.92,
      sourcePage: 1,
      createdAt: mockDate,
      updatedAt: mockDate,
    },
  ];

  beforeEach(() => {
    mockPrisma = {
      officialAnswerKey: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
      officialAnswerKeyItem: {
        create: vi.fn(),
        createMany: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn(async (arg: unknown) => {
        if (typeof arg === 'function') {
          return (arg as (tx: unknown) => Promise<unknown>)(mockPrisma);
        }
        if (Array.isArray(arg)) {
          return Promise.all(arg);
        }
        return arg;
      }),
    };

    repository = new PrismaOfficialAnswerKeyRepository(mockPrisma as unknown as PrismaClient);
  });

  describe('1. createDraft', () => {
    it('deve criar um gabarito em estado DRAFT com valores padrão e isCurrent false', async () => {
      const input: CreateOfficialAnswerKeyDraftInput = {
        userId: 'user-owner-1',
        examId: 'exam-456',
        pdfDocumentId: 'pdf-789',
        notes: 'Notas de rascunho',
      };

      mockPrisma.officialAnswerKey.create.mockResolvedValue({
        ...baseAnswerKey,
        items: [],
      });

      const result = await repository.createDraft(input);

      expect(mockPrisma.officialAnswerKey.create).toHaveBeenCalledTimes(1);
      const callArg = mockPrisma.officialAnswerKey.create.mock.calls[0][0];

      expect(callArg.data.userId).toBe('user-owner-1');
      expect(callArg.data.examId).toBe('exam-456');
      expect(callArg.data.pdfDocumentId).toBe('pdf-789');
      expect(callArg.data.status).toBe('DRAFT');
      expect(callArg.data.isCurrent).toBe(false);
      expect(callArg.data.version).toBe(1);
      expect(callArg.data.type).toBe('PRELIMINARY');
      expect(callArg.include).toEqual({
        items: { orderBy: { questionNumber: 'asc' } },
      });
      expect(result.id).toBe('key-123');
      expect(result.status).toBe('DRAFT');
    });

    it('deve persistir itens em lote aninhados na criação quando fornecidos', async () => {
      const itemsInput: CreateOfficialAnswerKeyItemInput[] = [
        {
          questionNumber: 1,
          correctAnswer: 'B',
          status: 'ACTIVE',
          textEvidence: 'Questão 1: B',
          confidence: 0.98,
        },
        {
          questionNumber: 2,
          correctAnswer: null,
          isAnnulled: true,
          status: 'ANNULLED',
          justification: 'Recurso deferido pela banca',
        },
      ];

      const input: CreateOfficialAnswerKeyDraftInput = {
        userId: 'user-owner-1',
        examId: 'exam-456',
        type: 'FINAL',
        version: 2,
        items: itemsInput,
      };

      mockPrisma.officialAnswerKey.create.mockResolvedValue({
        ...baseAnswerKey,
        type: 'FINAL',
        version: 2,
        items: baseItems,
      });

      const result = await repository.createDraft(input);

      expect(mockPrisma.officialAnswerKey.create).toHaveBeenCalledTimes(1);
      const callArg = mockPrisma.officialAnswerKey.create.mock.calls[0][0];

      expect(callArg.data.type).toBe('FINAL');
      expect(callArg.data.version).toBe(2);
      expect(callArg.data.status).toBe('DRAFT');
      expect(callArg.data.items).toBeDefined();
      expect(callArg.data.items.create).toHaveLength(2);
      expect(callArg.data.items.create[0].questionNumber).toBe(1);
      expect(callArg.data.items.create[0].correctAnswer).toBe('B');
      expect(callArg.data.items.create[1].isAnnulled).toBe(true);
      expect(result.items).toHaveLength(2);
    });

    it('deve rejeitar itens com questionNumber duplicado na criação antes de chamar o Prisma', async () => {
      const duplicateItems: CreateOfficialAnswerKeyItemInput[] = [
        { questionNumber: 1, correctAnswer: 'A' },
        { questionNumber: 1, correctAnswer: 'B' },
      ];

      const input: CreateOfficialAnswerKeyDraftInput = {
        userId: 'user-owner-1',
        examId: 'exam-456',
        items: duplicateItems,
      };

      await expect(repository.createDraft(input)).rejects.toMatchObject({
        code: 'ANSWER_KEY_DUPLICATE_ITEM',
        statusCode: 422,
      });

      expect(mockPrisma.officialAnswerKey.create).not.toHaveBeenCalled();
    });

    it('deve converter erro de restrição de unicidade (P2002) em OfficialAnswerKeyError (409)', async () => {
      const prismaError = new Error('Unique constraint failed on the fields: (examId, type, version)');
      (prismaError as any).code = 'P2002';
      (prismaError as any).meta = { target: ['examId', 'type', 'version'] };
      mockPrisma.officialAnswerKey.create.mockRejectedValue(prismaError);

      try {
        await repository.createDraft({
          userId: 'user-owner-1',
          examId: 'exam-456',
          type: 'PRELIMINARY',
          version: 1,
        });
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(OfficialAnswerKeyError);
        expect((err as OfficialAnswerKeyError).code).toBe('ANSWER_KEY_DUPLICATE_VERSION');
        expect((err as OfficialAnswerKeyError).statusCode).toBe(409);
      }
    });
  });

  describe('2. findById & findByIdWithItems (Isolamento Obrigatório por userId)', () => {
    it('deve retornar gabarito existente com filtro obrigatório de userId sem itens quando omitido', async () => {
      mockPrisma.officialAnswerKey.findFirst.mockResolvedValue(baseAnswerKey);

      const result = await repository.findById('key-123', 'user-owner-1');

      expect(mockPrisma.officialAnswerKey.findFirst).toHaveBeenCalledWith({
        where: { id: 'key-123', userId: 'user-owner-1' },
      });
      expect(result).toEqual(baseAnswerKey);
    });

    it('deve retornar gabarito com itens quando includeItems for true', async () => {
      mockPrisma.officialAnswerKey.findFirst.mockResolvedValue({
        ...baseAnswerKey,
        items: baseItems,
      });

      const result = await repository.findById('key-123', 'user-owner-1', { includeItems: true });

      expect(mockPrisma.officialAnswerKey.findFirst).toHaveBeenCalledWith({
        where: { id: 'key-123', userId: 'user-owner-1' },
        include: {
          items: { orderBy: { questionNumber: 'asc' } },
        },
      });
      expect(result?.items).toHaveLength(2);
    });

    it('deve retornar null quando gabarito pertencer a outro usuário', async () => {
      mockPrisma.officialAnswerKey.findFirst.mockResolvedValue(null);

      const result = await repository.findById('key-123', 'user-outro');

      expect(mockPrisma.officialAnswerKey.findFirst).toHaveBeenCalledWith({
        where: { id: 'key-123', userId: 'user-outro' },
      });
      expect(result).toBeNull();
    });

    it('findByIdWithItems deve sempre exigir userId e incluir itens ordenados', async () => {
      mockPrisma.officialAnswerKey.findFirst.mockResolvedValue({
        ...baseAnswerKey,
        items: baseItems,
      });

      const result = await repository.findByIdWithItems('key-123', 'user-owner-1');

      expect(mockPrisma.officialAnswerKey.findFirst).toHaveBeenCalledWith({
        where: { id: 'key-123', userId: 'user-owner-1' },
        include: {
          items: { orderBy: { questionNumber: 'asc' } },
        },
      });
      expect(result?.items).toHaveLength(2);
    });
  });

  describe('3. findCurrentByExamId & findCurrentByExamIdWithItems', () => {
    it('deve consultar gabarito atual filtrando obrigatoriamente por examId, userId e isCurrent: true', async () => {
      const currentAnswerKey: OfficialAnswerKey = {
        ...baseAnswerKey,
        status: 'PUBLISHED' as AnswerKeyStatus,
        isCurrent: true,
      };

      mockPrisma.officialAnswerKey.findFirst.mockResolvedValue(currentAnswerKey);

      const result = await repository.findCurrentByExamId('exam-456', 'user-owner-1');

      expect(mockPrisma.officialAnswerKey.findFirst).toHaveBeenCalledWith({
        where: { examId: 'exam-456', userId: 'user-owner-1', isCurrent: true },
      });
      expect(result?.isCurrent).toBe(true);
    });

    it('findCurrentByExamIdWithItems deve carregar itens ordenados com filtro de tenant', async () => {
      mockPrisma.officialAnswerKey.findFirst.mockResolvedValue({
        ...baseAnswerKey,
        isCurrent: true,
        items: baseItems,
      });

      const result = await repository.findCurrentByExamIdWithItems('exam-456', 'user-owner-1');

      expect(mockPrisma.officialAnswerKey.findFirst).toHaveBeenCalledWith({
        where: { examId: 'exam-456', userId: 'user-owner-1', isCurrent: true },
        include: { items: { orderBy: { questionNumber: 'asc' } } },
      });
      expect(result?.items).toHaveLength(2);
    });
  });

  describe('4. findVersionsByExamId', () => {
    it('deve listar versões de uma prova filtrando obrigatoriamente por examId e userId', async () => {
      const v1: OfficialAnswerKey = { ...baseAnswerKey, version: 1 };
      const v2: OfficialAnswerKey = { ...baseAnswerKey, id: 'key-124', version: 2 };

      mockPrisma.officialAnswerKey.findMany.mockResolvedValue([v2, v1]);

      const results = await repository.findVersionsByExamId('exam-456', 'user-owner-1');

      expect(mockPrisma.officialAnswerKey.findMany).toHaveBeenCalledWith({
        where: { examId: 'exam-456', userId: 'user-owner-1' },
        orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      });
      expect(results).toHaveLength(2);
      expect(results[0].version).toBe(2);
    });

    it('deve permitir filtro adicional por type com userId obrigatório', async () => {
      mockPrisma.officialAnswerKey.findMany.mockResolvedValue([]);

      await repository.findVersionsByExamId('exam-456', 'user-owner-1', {
        type: 'RECTIFIED',
      });

      expect(mockPrisma.officialAnswerKey.findMany).toHaveBeenCalledWith({
        where: {
          examId: 'exam-456',
          userId: 'user-owner-1',
          type: 'RECTIFIED',
        },
        orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      });
    });
  });

  describe('5. findItemsByAnswerKeyId & findItemByQuestionNumber', () => {
    it('deve filtrar itens de gabarito garantindo isolamento relacional via answerKey.userId', async () => {
      mockPrisma.officialAnswerKeyItem.findMany.mockResolvedValue(baseItems);

      const items = await repository.findItemsByAnswerKeyId('key-123', 'user-owner-1');

      expect(mockPrisma.officialAnswerKeyItem.findMany).toHaveBeenCalledWith({
        where: {
          answerKeyId: 'key-123',
          answerKey: { userId: 'user-owner-1' },
        },
        orderBy: { questionNumber: 'asc' },
      });
      expect(items).toHaveLength(2);
    });

    it('deve filtrar itens por status mantendo isolamento de tenant', async () => {
      mockPrisma.officialAnswerKeyItem.findMany.mockResolvedValue([baseItems[1]]);

      const items = await repository.findItemsByAnswerKeyId('key-123', 'user-owner-1', {
        status: 'NEEDS_REVIEW',
      });

      expect(mockPrisma.officialAnswerKeyItem.findMany).toHaveBeenCalledWith({
        where: {
          answerKeyId: 'key-123',
          status: 'NEEDS_REVIEW',
          answerKey: { userId: 'user-owner-1' },
        },
        orderBy: { questionNumber: 'asc' },
      });
      expect(items).toHaveLength(1);
    });

    it('findItemByQuestionNumber deve aplicar isolamento relacional por tenant', async () => {
      mockPrisma.officialAnswerKeyItem.findFirst.mockResolvedValue(baseItems[0]);

      const item = await repository.findItemByQuestionNumber('key-123', 1, 'user-owner-1');

      expect(mockPrisma.officialAnswerKeyItem.findFirst).toHaveBeenCalledWith({
        where: {
          answerKeyId: 'key-123',
          questionNumber: 1,
          answerKey: { userId: 'user-owner-1' },
        },
      });
      expect(item?.questionNumber).toBe(1);
    });
  });

  describe('6. updateDraft (Concorrência, Bloqueio Atômico e Respeito a DRAFT)', () => {
    it('deve atualizar metadados executando bloqueio condicional atômico dentro de transação', async () => {
      mockPrisma.officialAnswerKey.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.officialAnswerKey.findFirst.mockResolvedValue({
        ...baseAnswerKey,
        notes: 'Notas atualizadas',
        items: baseItems,
      });

      const updateData: UpdateOfficialAnswerKeyDraftInput = {
        notes: 'Notas atualizadas',
      };

      const result = await repository.updateDraft('key-123', 'user-owner-1', updateData);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.officialAnswerKey.updateMany).toHaveBeenCalledWith({
        where: { id: 'key-123', userId: 'user-owner-1', status: 'DRAFT' },
        data: expect.objectContaining({ notes: 'Notas atualizadas' }),
      });
      expect(result.notes).toBe('Notas atualizadas');
    });

    it('deve rejeitar e abortar quando updateMany retornar count 0 e gabarito for PUBLISHED', async () => {
      mockPrisma.officialAnswerKey.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.officialAnswerKey.findFirst.mockResolvedValue({
        id: 'key-123',
        status: 'PUBLISHED',
      });

      await expect(
        repository.updateDraft('key-123', 'user-owner-1', { notes: 'Tentativa concorrente' })
      ).rejects.toMatchObject({
        code: 'ANSWER_KEY_NOT_DRAFT',
        statusCode: 422,
      });

      expect(mockPrisma.officialAnswerKeyItem.deleteMany).not.toHaveBeenCalled();
    });

    it('deve rejeitar com ANSWER_KEY_NOT_FOUND quando gabarito não pertencer ao usuário', async () => {
      mockPrisma.officialAnswerKey.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.officialAnswerKey.findFirst.mockResolvedValue(null);

      await expect(
        repository.updateDraft('key-123', 'user-invasor', { notes: 'Tentativa indevida' })
      ).rejects.toMatchObject({
        code: 'ANSWER_KEY_NOT_FOUND',
        statusCode: 404,
      });
    });

    it('deve rejeitar questionNumbers duplicados em updateDraft antes de iniciar transação', async () => {
      const duplicateItems: CreateOfficialAnswerKeyItemInput[] = [
        { questionNumber: 5, correctAnswer: 'A' },
        { questionNumber: 5, correctAnswer: 'B' },
      ];

      await expect(
        repository.updateDraft('key-123', 'user-owner-1', { items: duplicateItems })
      ).rejects.toMatchObject({
        code: 'ANSWER_KEY_DUPLICATE_ITEM',
        statusCode: 422,
      });

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('deve substituir itens atomicamente em transação após validação de bloqueio', async () => {
      mockPrisma.officialAnswerKey.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.officialAnswerKeyItem.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.officialAnswerKeyItem.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.officialAnswerKey.findFirst.mockResolvedValue({
        ...baseAnswerKey,
        items: [{ ...baseItems[0], correctAnswer: 'D' }],
      });

      const updateData: UpdateOfficialAnswerKeyDraftInput = {
        items: [{ questionNumber: 1, correctAnswer: 'D', status: 'ACTIVE' }],
      };

      const result = await repository.updateDraft('key-123', 'user-owner-1', updateData);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.officialAnswerKeyItem.deleteMany).toHaveBeenCalledWith({
        where: { answerKeyId: 'key-123' },
      });
      expect(mockPrisma.officialAnswerKeyItem.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ questionNumber: 1, correctAnswer: 'D' })],
      });
      expect(result.items[0].correctAnswer).toBe('D');
    });
  });

  describe('7. updateDraftItem (Validação Transacional e Concorrência)', () => {
    it('deve atualizar item individual após bloquear e validar gabarito pai em DRAFT', async () => {
      mockPrisma.officialAnswerKey.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.officialAnswerKeyItem.findFirst.mockResolvedValue(baseItems[0]);
      mockPrisma.officialAnswerKeyItem.update.mockResolvedValue({
        ...baseItems[0],
        correctAnswer: 'E',
        status: 'CHANGED' as AnswerKeyItemStatus,
      });

      const updateItemInput: UpdateOfficialAnswerKeyItemInput = {
        correctAnswer: 'E',
        status: 'CHANGED',
        justification: 'Alterado após verificação',
      };

      const result = await repository.updateDraftItem(
        'key-123',
        1,
        'user-owner-1',
        updateItemInput
      );

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.officialAnswerKey.updateMany).toHaveBeenCalledWith({
        where: { id: 'key-123', userId: 'user-owner-1', status: 'DRAFT' },
        data: expect.objectContaining({ updatedAt: expect.any(Date) }),
      });
      expect(mockPrisma.officialAnswerKeyItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: expect.objectContaining({ correctAnswer: 'E', status: 'CHANGED' }),
      });
      expect(result.correctAnswer).toBe('E');
    });

    it('deve rejeitar atualização de item se gabarito pai não for mais DRAFT no momento da mutação', async () => {
      mockPrisma.officialAnswerKey.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.officialAnswerKey.findFirst.mockResolvedValue({
        id: 'key-123',
        status: 'PUBLISHED',
      });

      await expect(
        repository.updateDraftItem('key-123', 1, 'user-owner-1', { correctAnswer: 'B' })
      ).rejects.toMatchObject({
        code: 'ANSWER_KEY_NOT_DRAFT',
        statusCode: 422,
      });

      expect(mockPrisma.officialAnswerKeyItem.update).not.toHaveBeenCalled();
    });

    it('deve rejeitar com ANSWER_KEY_ITEM_NOT_FOUND se o item não existir dentro do rascunho', async () => {
      mockPrisma.officialAnswerKey.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.officialAnswerKeyItem.findFirst.mockResolvedValue(null);

      await expect(
        repository.updateDraftItem('key-123', 99, 'user-owner-1', { correctAnswer: 'B' })
      ).rejects.toMatchObject({
        code: 'ANSWER_KEY_ITEM_NOT_FOUND',
        statusCode: 404,
      });
    });
  });

  describe('8. replaceDraftItems (Validação Prévia de Duplicatas e Transação)', () => {
    it('deve rejeitar questionNumbers duplicados antes de executar qualquer transação ou deleção', async () => {
      const duplicateItems: CreateOfficialAnswerKeyItemInput[] = [
        { questionNumber: 1, correctAnswer: 'A' },
        { questionNumber: 2, correctAnswer: 'B' },
        { questionNumber: 1, correctAnswer: 'C' }, // duplicado
      ];

      await expect(
        repository.replaceDraftItems('key-123', 'user-owner-1', duplicateItems)
      ).rejects.toMatchObject({
        code: 'ANSWER_KEY_DUPLICATE_ITEM',
        statusCode: 422,
      });

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.officialAnswerKeyItem.deleteMany).not.toHaveBeenCalled();
    });

    it('deve bloquear gabarito pai em DRAFT e substituir itens atomicamente em transação', async () => {
      mockPrisma.officialAnswerKey.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.officialAnswerKeyItem.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.officialAnswerKeyItem.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.officialAnswerKeyItem.findMany.mockResolvedValue([
        { ...baseItems[0], correctAnswer: 'B' },
      ]);

      const newItems: CreateOfficialAnswerKeyItemInput[] = [
        { questionNumber: 1, correctAnswer: 'B', status: 'ACTIVE' },
      ];

      const result = await repository.replaceDraftItems('key-123', 'user-owner-1', newItems);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.officialAnswerKey.updateMany).toHaveBeenCalledWith({
        where: { id: 'key-123', userId: 'user-owner-1', status: 'DRAFT' },
        data: expect.objectContaining({ updatedAt: expect.any(Date) }),
      });
      expect(mockPrisma.officialAnswerKeyItem.deleteMany).toHaveBeenCalledWith({
        where: { answerKeyId: 'key-123' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].correctAnswer).toBe('B');
    });

    it('deve propagar erro e abortar transação se createMany falhar no meio da substituição', async () => {
      mockPrisma.officialAnswerKey.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.officialAnswerKeyItem.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.officialAnswerKeyItem.createMany.mockRejectedValue(
        new Error('Database disk error or foreign key violation')
      );

      const newItems: CreateOfficialAnswerKeyItemInput[] = [
        { questionNumber: 1, correctAnswer: 'B' },
      ];

      await expect(
        repository.replaceDraftItems('key-123', 'user-owner-1', newItems)
      ).rejects.toThrow('Database disk error');
    });

    it('deve rejeitar com ANSWER_KEY_NOT_DRAFT se o gabarito for SUPERSEDED no momento da substituição', async () => {
      mockPrisma.officialAnswerKey.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.officialAnswerKey.findFirst.mockResolvedValue({
        id: 'key-123',
        status: 'SUPERSEDED',
      });

      await expect(
        repository.replaceDraftItems('key-123', 'user-owner-1', [
          { questionNumber: 1, correctAnswer: 'A' },
        ])
      ).rejects.toMatchObject({
        code: 'ANSWER_KEY_NOT_DRAFT',
        statusCode: 422,
      });

      expect(mockPrisma.officialAnswerKeyItem.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('9. deleteDraft (Exclusão Atômica Condicional)', () => {
    it('deve excluir gabarito atomicamente via deleteMany com id, userId e status DRAFT', async () => {
      mockPrisma.officialAnswerKey.deleteMany.mockResolvedValue({ count: 1 });

      const deleted = await repository.deleteDraft('key-123', 'user-owner-1');

      expect(mockPrisma.officialAnswerKey.deleteMany).toHaveBeenCalledWith({
        where: { id: 'key-123', userId: 'user-owner-1', status: 'DRAFT' },
      });
      expect(deleted).toBe(true);
    });

    it('deve retornar false se o gabarito não existir para o usuário', async () => {
      mockPrisma.officialAnswerKey.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.officialAnswerKey.findFirst.mockResolvedValue(null);

      const deleted = await repository.deleteDraft('non-existent', 'user-owner-1');

      expect(deleted).toBe(false);
    });

    it('deve lançar ANSWER_KEY_NOT_DRAFT e não remover registro se gabarito estiver PUBLISHED', async () => {
      mockPrisma.officialAnswerKey.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.officialAnswerKey.findFirst.mockResolvedValue({
        id: 'key-123',
        status: 'PUBLISHED',
      });

      await expect(repository.deleteDraft('key-123', 'user-owner-1')).rejects.toMatchObject({
        code: 'ANSWER_KEY_NOT_DRAFT',
        statusCode: 422,
      });
    });
  });

  describe('10. Garantias de Não-Publicação e Não-Modificação de Question.correctAnswer', () => {
    it('não deve possuir métodos de publicação isolada no repositório', () => {
      const repoMethods = Object.getOwnPropertyNames(
        PrismaOfficialAnswerKeyRepository.prototype
      );

      expect(repoMethods).not.toContain('publish');
      expect(repoMethods).not.toContain('publishAnswerKey');
      expect(repoMethods).not.toContain('setOfficialAnswerKey');
    });

    it('não deve referenciar question.update ou alterar Question.correctAnswer', async () => {
      mockPrisma.question = { update: vi.fn(), updateMany: vi.fn() };

      mockPrisma.officialAnswerKey.create.mockResolvedValue({
        ...baseAnswerKey,
        items: [],
      });

      await repository.createDraft({
        userId: 'user-owner-1',
        examId: 'exam-456',
      });

      expect(mockPrisma.question.update).not.toHaveBeenCalled();
      expect(mockPrisma.question.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('8. addDraftItem', () => {
    it('deve adicionar um item ao rascunho com sucesso quando o gabarito for DRAFT', async () => {
      mockPrisma.officialAnswerKey.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.officialAnswerKeyItem.findFirst.mockResolvedValue(null);
      mockPrisma.officialAnswerKeyItem.create.mockResolvedValue({
        id: 'item-3',
        answerKeyId: 'key-123',
        questionNumber: 3,
        questionId: 'q-3',
        correctAnswer: 'B',
        previousAnswer: null,
        status: 'ACTIVE',
        isAnnulled: false,
        justification: null,
        textEvidence: null,
        confidence: null,
        sourcePage: null,
        createdAt: mockDate,
        updatedAt: mockDate,
      });

      const result = await repository.addDraftItem('key-123', 'user-owner-1', {
        questionNumber: 3,
        questionId: 'q-3',
        correctAnswer: 'B',
      });

      expect(result.questionNumber).toBe(3);
      expect(mockPrisma.officialAnswerKey.updateMany).toHaveBeenCalledWith({
        where: { id: 'key-123', userId: 'user-owner-1', status: 'DRAFT' },
        data: expect.objectContaining({ updatedAt: expect.any(Date) }),
      });
      expect(mockPrisma.officialAnswerKeyItem.create).toHaveBeenCalled();
    });

    it('deve rejeitar adição de item com questionNumber duplicado no mesmo gabarito', async () => {
      mockPrisma.officialAnswerKey.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.officialAnswerKeyItem.findFirst.mockResolvedValue(baseItems[0]);

      await expect(
        repository.addDraftItem('key-123', 'user-owner-1', {
          questionNumber: 1,
          correctAnswer: 'A',
        })
      ).rejects.toThrow(OfficialAnswerKeyError);
    });

    it('deve rejeitar adição de item quando gabarito não for DRAFT (422)', async () => {
      mockPrisma.officialAnswerKey.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.officialAnswerKey.findFirst.mockResolvedValue({
        id: 'key-123',
        status: 'PUBLISHED',
      });

      await expect(
        repository.addDraftItem('key-123', 'user-owner-1', {
          questionNumber: 3,
          correctAnswer: 'B',
        })
      ).rejects.toThrow(OfficialAnswerKeyError);
    });
  });

  describe('9. publishDraft', () => {
    it('deve publicar o rascunho executando na ordem correta: bloqueio do pai, releitura dos itens, validação, desativação da versão anterior e ativação da nova', async () => {
      mockPrisma.officialAnswerKey.updateMany
        .mockResolvedValueOnce({ count: 1 }) // parentLock
        .mockResolvedValueOnce({ count: 1 }); // deactivation of old current
      mockPrisma.officialAnswerKey.findFirst
        .mockResolvedValueOnce({ id: 'key-123', examId: 'exam-456' }) // targetDraft
        .mockResolvedValueOnce({
          ...baseAnswerKey,
          status: 'PUBLISHED',
          isCurrent: true,
          items: baseItems,
        }); // final published record
      mockPrisma.officialAnswerKeyItem.findMany.mockResolvedValueOnce(baseItems); // Releitura transacional
      mockPrisma.officialAnswerKey.update.mockResolvedValue({
        ...baseAnswerKey,
        status: 'PUBLISHED',
        isCurrent: true,
      });

      const published = await repository.publishDraft('key-123', 'user-owner-1');

      expect(published.status).toBe('PUBLISHED');
      expect(published.isCurrent).toBe(true);

      // 1. Bloqueio condicional do pai
      expect(mockPrisma.officialAnswerKey.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'key-123', userId: 'user-owner-1', status: 'DRAFT' },
        data: expect.objectContaining({ updatedAt: expect.any(Date) }),
      });

      // 2. Releitura dos itens dentro da transação
      expect(mockPrisma.officialAnswerKeyItem.findMany).toHaveBeenCalledWith({
        where: { answerKeyId: 'key-123' },
        orderBy: { questionNumber: 'asc' },
      });

      // 3. Desativação de versão anterior vigente
      expect(mockPrisma.officialAnswerKey.updateMany).toHaveBeenNthCalledWith(2, {
        where: { examId: 'exam-456', isCurrent: true },
        data: expect.objectContaining({ isCurrent: false, status: 'SUPERSEDED' }),
      });

      // 4. Ativação da versão corrente
      expect(mockPrisma.officialAnswerKey.update).toHaveBeenCalledWith({
        where: { id: 'key-123' },
        data: expect.objectContaining({ status: 'PUBLISHED', isCurrent: true }),
      });
    });

    it('deve rejeitar publicação quando a releitura transacional encontrar lista vazia de itens (400)', async () => {
      mockPrisma.officialAnswerKey.updateMany.mockResolvedValueOnce({ count: 1 }); // parentLock
      mockPrisma.officialAnswerKey.findFirst.mockResolvedValueOnce({
        id: 'key-123',
        examId: 'exam-456',
      });
      mockPrisma.officialAnswerKeyItem.findMany.mockResolvedValueOnce([]); // Releitura vazia

      try {
        await repository.publishDraft('key-123', 'user-owner-1');
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(OfficialAnswerKeyError);
        expect((err as OfficialAnswerKeyError).code).toBe('ANSWER_KEY_INVALID_DATA');
        expect((err as OfficialAnswerKeyError).statusCode).toBe(400);
        expect((err as OfficialAnswerKeyError).message).toContain('sem itens cadastrados');
      }

      // Nenhuma mutação de desativação ou ativação deve ocorrer
      expect(mockPrisma.officialAnswerKey.update).not.toHaveBeenCalled();
      expect(mockPrisma.officialAnswerKey.updateMany).toHaveBeenCalledTimes(1); // Apenas parentLock
    });

    it('deve rejeitar publicação quando a releitura transacional encontrar item em NEEDS_REVIEW (400)', async () => {
      mockPrisma.officialAnswerKey.updateMany.mockResolvedValueOnce({ count: 1 }); // parentLock
      mockPrisma.officialAnswerKey.findFirst.mockResolvedValueOnce({
        id: 'key-123',
        examId: 'exam-456',
      });
      mockPrisma.officialAnswerKeyItem.findMany.mockResolvedValueOnce([
        baseItems[0],
        { ...baseItems[1], status: 'NEEDS_REVIEW' },
      ]);

      try {
        await repository.publishDraft('key-123', 'user-owner-1');
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(OfficialAnswerKeyError);
        expect((err as OfficialAnswerKeyError).code).toBe('ANSWER_KEY_INVALID_DATA');
        expect((err as OfficialAnswerKeyError).statusCode).toBe(400);
        expect((err as OfficialAnswerKeyError).message).toContain('pendentes de revisão humana');
      }

      expect(mockPrisma.officialAnswerKey.update).not.toHaveBeenCalled();
      expect(mockPrisma.officialAnswerKey.updateMany).toHaveBeenCalledTimes(1);
    });

    it('deve rejeitar publicação quando a releitura transacional encontrar item ativo sem resposta correta (400)', async () => {
      mockPrisma.officialAnswerKey.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.officialAnswerKey.findFirst.mockResolvedValueOnce({
        id: 'key-123',
        examId: 'exam-456',
      });
      mockPrisma.officialAnswerKeyItem.findMany.mockResolvedValueOnce([
        baseItems[0],
        { ...baseItems[1], status: 'ACTIVE', isAnnulled: false, correctAnswer: null },
      ]);

      try {
        await repository.publishDraft('key-123', 'user-owner-1');
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(OfficialAnswerKeyError);
        expect((err as OfficialAnswerKeyError).code).toBe('ANSWER_KEY_INVALID_DATA');
        expect((err as OfficialAnswerKeyError).statusCode).toBe(400);
        expect((err as OfficialAnswerKeyError).message).toContain('não possui resposta correta definida');
      }

      expect(mockPrisma.officialAnswerKey.update).not.toHaveBeenCalled();
      expect(mockPrisma.officialAnswerKey.updateMany).toHaveBeenCalledTimes(1);
    });

    it('deve rejeitar publicação quando a releitura transacional encontrar anulação inconsistente (400)', async () => {
      mockPrisma.officialAnswerKey.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.officialAnswerKey.findFirst.mockResolvedValueOnce({
        id: 'key-123',
        examId: 'exam-456',
      });
      mockPrisma.officialAnswerKeyItem.findMany.mockResolvedValueOnce([
        { ...baseItems[0], status: 'ANNULLED', isAnnulled: false },
      ]);

      try {
        await repository.publishDraft('key-123', 'user-owner-1');
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(OfficialAnswerKeyError);
        expect((err as OfficialAnswerKeyError).code).toBe('ANSWER_KEY_INVALID_DATA');
        expect((err as OfficialAnswerKeyError).statusCode).toBe(400);
        expect((err as OfficialAnswerKeyError).message).toContain('isAnnulled false');
      }

      expect(mockPrisma.officialAnswerKey.update).not.toHaveBeenCalled();
      expect(mockPrisma.officialAnswerKey.updateMany).toHaveBeenCalledTimes(1);
    });

    it('deve converter conflito de publicação concorrente (P2002 no índice parcial exam_current_unique) em ANSWER_KEY_PUBLISH_CONFLICT (409)', async () => {
      mockPrisma.officialAnswerKey.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });
      mockPrisma.officialAnswerKey.findFirst.mockResolvedValueOnce({
        id: 'key-123',
        examId: 'exam-456',
      });
      mockPrisma.officialAnswerKeyItem.findMany.mockResolvedValueOnce(baseItems);

      const p2002Error = new Error('Unique constraint failed on the constraint: official_answer_keys_exam_current_unique');
      (p2002Error as any).code = 'P2002';
      (p2002Error as any).meta = { constraint: 'official_answer_keys_exam_current_unique', target: ['examId'] };
      mockPrisma.officialAnswerKey.update.mockRejectedValueOnce(p2002Error);

      try {
        await repository.publishDraft('key-123', 'user-owner-1');
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(OfficialAnswerKeyError);
        expect((err as OfficialAnswerKeyError).code).toBe('ANSWER_KEY_PUBLISH_CONFLICT');
        expect((err as OfficialAnswerKeyError).statusCode).toBe(409);
        expect((err as OfficialAnswerKeyError).message).toContain('Conflito de publicação concorrente');
      }
    });

    it('deve converter erro P2002 de versão duplicada em ANSWER_KEY_DUPLICATE_VERSION (409)', async () => {
      mockPrisma.officialAnswerKey.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });
      mockPrisma.officialAnswerKey.findFirst.mockResolvedValueOnce({
        id: 'key-123',
        examId: 'exam-456',
      });
      mockPrisma.officialAnswerKeyItem.findMany.mockResolvedValueOnce(baseItems);

      const p2002Error = new Error('Unique constraint failed on version');
      (p2002Error as any).code = 'P2002';
      (p2002Error as any).meta = { target: ['examId', 'type', 'version'] };
      mockPrisma.officialAnswerKey.update.mockRejectedValueOnce(p2002Error);

      try {
        await repository.publishDraft('key-123', 'user-owner-1');
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(OfficialAnswerKeyError);
        expect((err as OfficialAnswerKeyError).code).toBe('ANSWER_KEY_DUPLICATE_VERSION');
        expect((err as OfficialAnswerKeyError).statusCode).toBe(409);
      }
    });

    it('deve rejeitar publicação de gabarito inexistente com 404', async () => {
      mockPrisma.officialAnswerKey.updateMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.officialAnswerKey.findFirst.mockResolvedValueOnce(null);

      await expect(repository.publishDraft('key-missing', 'user-owner-1')).rejects.toThrow(
        OfficialAnswerKeyError
      );
    });

    it('deve rejeitar publicação de gabarito que não esteja em DRAFT com 422', async () => {
      mockPrisma.officialAnswerKey.updateMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.officialAnswerKey.findFirst.mockResolvedValueOnce({
        id: 'key-123',
        status: 'PUBLISHED',
      });

      await expect(repository.publishDraft('key-123', 'user-owner-1')).rejects.toThrow(
        OfficialAnswerKeyError
      );
    });
  });
});

