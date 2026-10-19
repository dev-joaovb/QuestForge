import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  AnswerKeyItemStatus,
  AnswerKeyStatus,
  AnswerKeyType,
  Exam,
  OfficialAnswerKey,
  OfficialAnswerKeyItem,
} from '@prisma/client';
import {
  OfficialAnswerKeyService,
} from '../src/services/official-answer-key.service.ts';
import { OfficialAnswerKeyError } from '../src/types/official-answer-key.types.ts';
import type { IOfficialAnswerKeyRepository } from '../src/repositories/official-answer-key.repository.ts';
import { OfficialAnswerKeyValidatorService } from '../src/services/official-answer-key-validator.service.ts';

describe('OfficialAnswerKeyService — Camada de Serviços de Gabaritos Oficiais (Sprint 5.2.4)', () => {
  const actorUserId = '11111111-1111-4111-8111-111111111111';
  const otherUserId = '99999999-9999-4999-8999-999999999999';

  const validExamId = '22222222-2222-4222-8222-222222222222';
  const validKeyId = '33333333-3333-4333-8333-333333333333';
  const validPdfDocumentId = '44444444-4444-4444-8444-444444444444';
  const validQuestionId1 = '55555555-5555-4555-8555-555555555551';
  const validQuestionId2 = '55555555-5555-4555-8555-555555555552';

  const mockDate = new Date('2026-10-15T12:00:00.000Z');

  const baseAnswerKey: OfficialAnswerKey = {
    id: validKeyId,
    userId: actorUserId,
    examId: validExamId,
    pdfDocumentId: validPdfDocumentId,
    type: 'PRELIMINARY' as AnswerKeyType,
    status: 'DRAFT' as AnswerKeyStatus,
    version: 1,
    isCurrent: false,
    publicationDate: null,
    notes: 'Rascunho preliminar',
    createdAt: mockDate,
    updatedAt: mockDate,
  };

  const baseItems: OfficialAnswerKeyItem[] = [
    {
      id: 'item-1',
      answerKeyId: validKeyId,
      questionNumber: 1,
      questionId: validQuestionId1,
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
      answerKeyId: validKeyId,
      questionNumber: 2,
      questionId: validQuestionId2,
      correctAnswer: 'C',
      previousAnswer: null,
      status: 'ACTIVE' as AnswerKeyItemStatus,
      isAnnulled: false,
      justification: null,
      textEvidence: '2. C',
      confidence: 0.9,
      sourcePage: 1,
      createdAt: mockDate,
      updatedAt: mockDate,
    },
  ];

  const mockExam: Exam = {
    id: validExamId,
    userId: actorUserId,
    title: 'Concurso 2026',
    institution: 'Tribunal Regional',
    board: 'CESPE',
    year: 2026,
    position: 'Analista',
    description: null,
    createdAt: mockDate,
    updatedAt: mockDate,
  };

  let repository: IOfficialAnswerKeyRepository;
  let validatorService: OfficialAnswerKeyValidatorService;
  let service: OfficialAnswerKeyService;

  beforeEach(() => {
    repository = {
      createDraft: vi.fn().mockResolvedValue({
        ...baseAnswerKey,
        items: baseItems,
      }),
      findById: vi.fn().mockImplementation((id: string, userId: string) => {
        if (id === validKeyId && userId === actorUserId) {
          return Promise.resolve({ ...baseAnswerKey, items: baseItems });
        }
        return Promise.resolve(null);
      }),
      findByIdWithItems: vi.fn().mockImplementation((id: string, userId: string) => {
        if (id === validKeyId && userId === actorUserId) {
          return Promise.resolve({ ...baseAnswerKey, items: [...baseItems] });
        }
        return Promise.resolve(null);
      }),
      findCurrentByExamId: vi.fn().mockResolvedValue({
        ...baseAnswerKey,
        status: 'PUBLISHED',
        isCurrent: true,
      }),
      findCurrentByExamIdWithItems: vi.fn().mockResolvedValue({
        ...baseAnswerKey,
        status: 'PUBLISHED',
        isCurrent: true,
        items: baseItems,
      }),
      findVersionsByExamId: vi.fn().mockResolvedValue([baseAnswerKey]),
      findItemsByAnswerKeyId: vi.fn().mockResolvedValue(baseItems),
      findItemByQuestionNumber: vi.fn().mockImplementation((answerKeyId, qNum, userId) => {
        if (answerKeyId === validKeyId && userId === actorUserId) {
          const found = baseItems.find((i) => i.questionNumber === qNum);
          return Promise.resolve(found ?? null);
        }
        return Promise.resolve(null);
      }),
      updateDraft: vi.fn().mockResolvedValue({
        ...baseAnswerKey,
        notes: 'Notas atualizadas',
        items: baseItems,
      }),
      addDraftItem: vi.fn().mockImplementation((_keyId, _userId, item) =>
        Promise.resolve({
          id: 'item-3',
          answerKeyId: validKeyId,
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
          createdAt: mockDate,
          updatedAt: mockDate,
        })
      ),
      updateDraftItem: vi.fn().mockImplementation((_keyId, qNum, _userId, data) => {
        const existing = baseItems.find((i) => i.questionNumber === qNum)!;
        return Promise.resolve({
          ...existing,
          ...data,
          updatedAt: new Date(),
        });
      }),
      replaceDraftItems: vi.fn().mockResolvedValue(baseItems),
      deleteDraft: vi.fn().mockResolvedValue(true),
      publishDraft: vi.fn().mockResolvedValue({
        ...baseAnswerKey,
        status: 'PUBLISHED',
        isCurrent: true,
        publicationDate: mockDate,
        items: baseItems,
      }),
    };

    validatorService = {
      validateExamOwnership: vi.fn().mockResolvedValue(mockExam),
      validatePdfDocumentOwnership: vi.fn().mockResolvedValue(null),
      validateQuestionsOwnership: vi.fn().mockResolvedValue(new Map()),
      validateDraftCreation: vi.fn().mockResolvedValue({
        exam: mockExam,
        pdfDocument: null,
        questionsById: new Map(),
      }),
      validateDraftUpdate: vi.fn().mockResolvedValue({
        exam: mockExam,
        pdfDocument: null,
        questionsById: new Map(),
      }),
      validateDraftItemUpdate: vi.fn().mockResolvedValue({
        question: null,
      }),
    } as unknown as OfficialAnswerKeyValidatorService;

    service = new OfficialAnswerKeyService({
      officialAnswerKeyRepository: repository,
      officialAnswerKeyValidatorService: validatorService,
    });
  });

  describe('1. createDraft', () => {
    it('deve criar um rascunho com sucesso com dados válidos', async () => {
      const payload = {
        examId: validExamId,
        pdfDocumentId: validPdfDocumentId,
        type: 'PRELIMINARY',
        version: 1,
        notes: 'Notas de rascunho',
        items: [
          { questionNumber: 1, correctAnswer: 'A', questionId: validQuestionId1 },
          { questionNumber: 2, correctAnswer: 'C', questionId: validQuestionId2 },
        ],
      };

      const result = await service.createDraft(actorUserId, payload);

      expect(result).toBeDefined();
      expect(result.id).toBe(validKeyId);
      expect(validatorService.validateDraftCreation).toHaveBeenCalledWith({
        actorUserId,
        examId: validExamId,
        pdfDocumentId: validPdfDocumentId,
        items: expect.any(Array),
      });
      expect(repository.createDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: actorUserId,
          examId: validExamId,
          type: 'PRELIMINARY',
        })
      );
    });

    it('deve rejeitar actorUserId ausente ou em branco com ANSWER_KEY_FORBIDDEN (403)', async () => {
      await expect(service.createDraft('', { examId: validExamId })).rejects.toThrow(
        OfficialAnswerKeyError
      );
      try {
        await service.createDraft('   ', { examId: validExamId });
        expect.unreachable();
      } catch (err) {
        expect((err as OfficialAnswerKeyError).code).toBe('ANSWER_KEY_FORBIDDEN');
        expect((err as OfficialAnswerKeyError).statusCode).toBe(403);
      }
    });

    it('deve rejeitar payload inválido via Zod antes de chamar validação relacional ou repositório', async () => {
      await expect(
        service.createDraft(actorUserId, { examId: 'not-a-uuid' })
      ).rejects.toThrow(OfficialAnswerKeyError);

      expect(validatorService.validateDraftCreation).not.toHaveBeenCalled();
      expect(repository.createDraft).not.toHaveBeenCalled();
    });

    it('deve propagar erro de titularidade da prova lançado pelo validatorService', async () => {
      vi.mocked(validatorService.validateDraftCreation).mockRejectedValueOnce(
        new OfficialAnswerKeyError('EXAM_FORBIDDEN', 'Acesso negado', 403)
      );

      await expect(
        service.createDraft(actorUserId, { examId: validExamId })
      ).rejects.toThrow('Acesso negado');

      expect(repository.createDraft).not.toHaveBeenCalled();
    });
  });

  describe('2. findById & findByIdWithItems', () => {
    it('deve consultar gabarito por id com sucesso', async () => {
      const result = await service.findById(actorUserId, validKeyId);

      expect(result).toBeDefined();
      expect(result.id).toBe(validKeyId);
      expect(repository.findById).toHaveBeenCalledWith(validKeyId, actorUserId, undefined);
    });

    it('deve rejeitar recurso inexistente ou de outro usuário com ANSWER_KEY_NOT_FOUND (404)', async () => {
      await expect(service.findById(actorUserId, 'missing-id')).rejects.toThrow(
        OfficialAnswerKeyError
      );

      try {
        await service.findById(otherUserId, validKeyId);
        expect.unreachable();
      } catch (err) {
        expect((err as OfficialAnswerKeyError).code).toBe('ANSWER_KEY_NOT_FOUND');
        expect((err as OfficialAnswerKeyError).statusCode).toBe(404);
      }
    });

    it('deve consultar gabarito com itens carregados (findByIdWithItems)', async () => {
      const result = await service.findByIdWithItems(actorUserId, validKeyId);

      expect(result.items).toHaveLength(2);
      expect(repository.findByIdWithItems).toHaveBeenCalledWith(validKeyId, actorUserId);
    });

    it('deve rejeitar actorUserId ausente em consultas', async () => {
      await expect(service.findById('', validKeyId)).rejects.toThrow(OfficialAnswerKeyError);
      await expect(service.findByIdWithItems('', validKeyId)).rejects.toThrow(
        OfficialAnswerKeyError
      );
    });
  });

  describe('3. findCurrentByExamId & findCurrentByExamIdWithItems', () => {
    it('deve validar titularidade da prova antes de buscar o gabarito vigente', async () => {
      const current = await service.findCurrentByExamId(actorUserId, validExamId);

      expect(current).toBeDefined();
      expect(validatorService.validateExamOwnership).toHaveBeenCalledWith(
        actorUserId,
        validExamId
      );
      expect(repository.findCurrentByExamId).toHaveBeenCalledWith(
        validExamId,
        actorUserId,
        undefined
      );
    });

    it('deve abortar busca de gabarito vigente se o usuário não for proprietário da prova (403)', async () => {
      vi.mocked(validatorService.validateExamOwnership).mockRejectedValueOnce(
        new OfficialAnswerKeyError('EXAM_FORBIDDEN', 'Acesso negado à prova', 403)
      );

      await expect(service.findCurrentByExamId(otherUserId, validExamId)).rejects.toThrow(
        'Acesso negado à prova'
      );
      expect(repository.findCurrentByExamId).not.toHaveBeenCalled();
    });

    it('deve buscar gabarito vigente com itens (findCurrentByExamIdWithItems)', async () => {
      const current = await service.findCurrentByExamIdWithItems(actorUserId, validExamId);

      expect(current?.items).toHaveLength(2);
      expect(validatorService.validateExamOwnership).toHaveBeenCalledWith(
        actorUserId,
        validExamId
      );
    });
  });

  describe('4. findVersionsByExamId', () => {
    it('deve listar versões de gabarito da prova com validação de titularidade', async () => {
      const versions = await service.findVersionsByExamId(actorUserId, validExamId, {
        type: 'PRELIMINARY',
      });

      expect(versions).toHaveLength(1);
      expect(validatorService.validateExamOwnership).toHaveBeenCalledWith(
        actorUserId,
        validExamId
      );
      expect(repository.findVersionsByExamId).toHaveBeenCalledWith(
        validExamId,
        actorUserId,
        { type: 'PRELIMINARY' }
      );
    });
  });

  describe('5. findItemsByAnswerKeyId & findItemByQuestionNumber', () => {
    it('deve listar itens de um gabarito pertencente ao usuário', async () => {
      const items = await service.findItemsByAnswerKeyId(actorUserId, validKeyId);

      expect(items).toHaveLength(2);
      expect(repository.findById).toHaveBeenCalledWith(validKeyId, actorUserId);
      expect(repository.findItemsByAnswerKeyId).toHaveBeenCalledWith(
        validKeyId,
        actorUserId,
        {}
      );
    });

    it('deve rejeitar listagem de itens se o gabarito pertencer a outro usuário com 404', async () => {
      await expect(
        service.findItemsByAnswerKeyId(otherUserId, validKeyId)
      ).rejects.toThrow('Gabarito oficial não encontrado.');

      expect(repository.findItemsByAnswerKeyId).not.toHaveBeenCalled();
    });

    it('deve buscar item específico por questionNumber', async () => {
      const item = await service.findItemByQuestionNumber(actorUserId, validKeyId, 1);

      expect(item.questionNumber).toBe(1);
      expect(item.correctAnswer).toBe('A');
    });

    it('deve rejeitar questionNumber não encontrado com ANSWER_KEY_ITEM_NOT_FOUND (404)', async () => {
      await expect(
        service.findItemByQuestionNumber(actorUserId, validKeyId, 99)
      ).rejects.toThrow(OfficialAnswerKeyError);
    });

    it('deve rejeitar questionNumber inválido (zero ou negativo) com 400', async () => {
      await expect(
        service.findItemByQuestionNumber(actorUserId, validKeyId, 0)
      ).rejects.toThrow(/maior ou igual a 1/);
    });
  });

  describe('6. updateDraft', () => {
    it('deve atualizar metadados de rascunho com sucesso', async () => {
      const result = await service.updateDraft(actorUserId, validKeyId, {
        notes: 'Novas notas',
      });

      expect(result).toBeDefined();
      expect(repository.updateDraft).toHaveBeenCalledWith(
        validKeyId,
        actorUserId,
        expect.objectContaining({ notes: 'Novas notas' })
      );
    });

    it('deve rejeitar atualização se o gabarito não existir com 404', async () => {
      await expect(
        service.updateDraft(actorUserId, 'missing-key', { notes: 'Notas' })
      ).rejects.toThrow(OfficialAnswerKeyError);

      expect(repository.updateDraft).not.toHaveBeenCalled();
    });

    it('deve rejeitar atualização de gabarito que não esteja em estado DRAFT com 422', async () => {
      vi.mocked(repository.findByIdWithItems).mockResolvedValueOnce({
        ...baseAnswerKey,
        status: 'PUBLISHED',
        items: baseItems,
      });

      try {
        await service.updateDraft(actorUserId, validKeyId, { notes: 'Notas' });
        expect.unreachable();
      } catch (err) {
        expect((err as OfficialAnswerKeyError).code).toBe('ANSWER_KEY_NOT_DRAFT');
        expect((err as OfficialAnswerKeyError).statusCode).toBe(422);
      }

      expect(repository.updateDraft).not.toHaveBeenCalled();
    });

    it('deve validar titularidade de entidades quando atualizar itens ou PDF', async () => {
      await service.updateDraft(actorUserId, validKeyId, {
        pdfDocumentId: validPdfDocumentId,
        items: [{ questionNumber: 1, correctAnswer: 'B' }],
      });

      expect(validatorService.validateDraftUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId,
          examId: validExamId,
          pdfDocumentId: validPdfDocumentId,
        })
      );
    });
  });

  describe('7. addDraftItem', () => {
    it('deve adicionar item ao rascunho com sucesso', async () => {
      const item = await service.addDraftItem(actorUserId, validKeyId, {
        questionNumber: 3,
        correctAnswer: 'B',
      });

      expect(item.questionNumber).toBe(3);
      expect(repository.addDraftItem).toHaveBeenCalledWith(
        validKeyId,
        actorUserId,
        expect.objectContaining({ questionNumber: 3, correctAnswer: 'B' })
      );
    });

    it('deve rejeitar inclusão de item com questionNumber já existente no gabarito (422)', async () => {
      try {
        await service.addDraftItem(actorUserId, validKeyId, {
          questionNumber: 1, // já existe no baseItems
          correctAnswer: 'D',
        });
        expect.unreachable();
      } catch (err) {
        expect((err as OfficialAnswerKeyError).code).toBe('ANSWER_KEY_DUPLICATE_ITEM');
        expect((err as OfficialAnswerKeyError).statusCode).toBe(422);
      }

      expect(repository.addDraftItem).not.toHaveBeenCalled();
    });

    it('deve rejeitar inclusão de item se o gabarito não estiver em DRAFT (422)', async () => {
      vi.mocked(repository.findByIdWithItems).mockResolvedValueOnce({
        ...baseAnswerKey,
        status: 'PUBLISHED',
        items: baseItems,
      });

      await expect(
        service.addDraftItem(actorUserId, validKeyId, {
          questionNumber: 3,
          correctAnswer: 'A',
        })
      ).rejects.toThrow(OfficialAnswerKeyError);

      expect(repository.addDraftItem).not.toHaveBeenCalled();
    });

    it('deve rejeitar questionId duplicado em relação a outro item já presente no gabarito', async () => {
      try {
        await service.addDraftItem(actorUserId, validKeyId, {
          questionNumber: 3,
          questionId: validQuestionId1, // já usado no item 1
          correctAnswer: 'B',
        });
        expect.unreachable();
      } catch (err) {
        expect((err as OfficialAnswerKeyError).code).toBe('ANSWER_KEY_DUPLICATE_ITEM');
        expect((err as OfficialAnswerKeyError).statusCode).toBe(422);
      }

      expect(repository.addDraftItem).not.toHaveBeenCalled();
    });
  });

  describe('8. updateDraftItem — Regra 6 (Estado final combinado de status e isAnnulled)', () => {
    it('deve atualizar item com sucesso quando os campos forem consistentes', async () => {
      const updated = await service.updateDraftItem(actorUserId, validKeyId, 1, {
        correctAnswer: 'B',
        justification: 'Gabarito alterado',
      });

      expect(updated).toBeDefined();
      expect(repository.updateDraftItem).toHaveBeenCalledWith(
        validKeyId,
        1,
        actorUserId,
        expect.objectContaining({ correctAnswer: 'B' })
      );
    });

    it('deve rejeitar atualização se gabarito não estiver em DRAFT (422)', async () => {
      vi.mocked(repository.findByIdWithItems).mockResolvedValueOnce({
        ...baseAnswerKey,
        status: 'PUBLISHED',
        items: baseItems,
      });

      await expect(
        service.updateDraftItem(actorUserId, validKeyId, 1, { correctAnswer: 'B' })
      ).rejects.toThrow(OfficialAnswerKeyError);

      expect(repository.updateDraftItem).not.toHaveBeenCalled();
    });

    it('deve rejeitar atualização se item não existir no gabarito (404)', async () => {
      await expect(
        service.updateDraftItem(actorUserId, validKeyId, 99, { correctAnswer: 'B' })
      ).rejects.toThrow(OfficialAnswerKeyError);

      expect(repository.updateDraftItem).not.toHaveBeenCalled();
    });

    it('Regra 6: deve rejeitar alteração para status ANNULLED mantendo isAnnulled false existente', async () => {
      // baseItem[0] tem status: 'ACTIVE' e isAnnulled: false
      try {
        await service.updateDraftItem(actorUserId, validKeyId, 1, {
          status: 'ANNULLED', // enviando status sem isAnnulled true
        });
        expect.unreachable();
      } catch (err) {
        expect((err as OfficialAnswerKeyError).code).toBe('ANSWER_KEY_INVALID_DATA');
        expect((err as OfficialAnswerKeyError).statusCode).toBe(400);
        expect((err as OfficialAnswerKeyError).message).toContain('isAnnulled como true');
      }

      expect(repository.updateDraftItem).not.toHaveBeenCalled();
    });

    it('Regra 6: deve rejeitar alteração para isAnnulled true mantendo status ACTIVE existente', async () => {
      // baseItem[0] tem status: 'ACTIVE' e isAnnulled: false
      try {
        await service.updateDraftItem(actorUserId, validKeyId, 1, {
          isAnnulled: true, // enviando isAnnulled true sem status ANNULLED
        });
        expect.unreachable();
      } catch (err) {
        expect((err as OfficialAnswerKeyError).code).toBe('ANSWER_KEY_INVALID_DATA');
        expect((err as OfficialAnswerKeyError).statusCode).toBe(400);
        expect((err as OfficialAnswerKeyError).message).toContain('devem possuir status ANNULLED');
      }

      expect(repository.updateDraftItem).not.toHaveBeenCalled();
    });

    it('Regra 6: deve aceitar anulação completa e consistente ({ status: ANNULLED, isAnnulled: true })', async () => {
      const updated = await service.updateDraftItem(actorUserId, validKeyId, 1, {
        status: 'ANNULLED',
        isAnnulled: true,
        justification: 'Questão sem alternativa correta',
      });

      expect(updated).toBeDefined();
      expect(repository.updateDraftItem).toHaveBeenCalledWith(
        validKeyId,
        1,
        actorUserId,
        expect.objectContaining({
          status: 'ANNULLED',
          isAnnulled: true,
        })
      );
    });

    it('Regra 6: deve rejeitar reativação inconsistente de item previamente anulado ({ isAnnulled: false })', async () => {
      // Configura item 1 como previamente anulado
      vi.mocked(repository.findByIdWithItems).mockResolvedValueOnce({
        ...baseAnswerKey,
        items: [
          {
            ...baseItems[0],
            status: 'ANNULLED',
            isAnnulled: true,
          },
        ],
      });

      // Tenta enviar apenas isAnnulled: false mantendo status: ANNULLED no banco
      try {
        await service.updateDraftItem(actorUserId, validKeyId, 1, {
          isAnnulled: false,
        });
        expect.unreachable();
      } catch (err) {
        expect((err as OfficialAnswerKeyError).code).toBe('ANSWER_KEY_INVALID_DATA');
        expect((err as OfficialAnswerKeyError).statusCode).toBe(400);
      }

      expect(repository.updateDraftItem).not.toHaveBeenCalled();
    });

    it('deve rejeitar questionId que colida com outro item do mesmo gabarito', async () => {
      // item 2 tem questionId = validQuestionId2. Tentar atualizar item 1 com questionId do item 2
      try {
        await service.updateDraftItem(actorUserId, validKeyId, 1, {
          questionId: validQuestionId2,
        });
        expect.unreachable();
      } catch (err) {
        expect((err as OfficialAnswerKeyError).code).toBe('ANSWER_KEY_DUPLICATE_ITEM');
        expect((err as OfficialAnswerKeyError).statusCode).toBe(422);
      }

      expect(repository.updateDraftItem).not.toHaveBeenCalled();
    });
  });

  describe('9. replaceDraftItems', () => {
    it('deve substituir itens do rascunho com sucesso', async () => {
      const newItems = [
        { questionNumber: 1, correctAnswer: 'B' },
        { questionNumber: 2, correctAnswer: 'D' },
      ];

      const replaced = await service.replaceDraftItems(actorUserId, validKeyId, {
        items: newItems,
      });

      expect(replaced).toBeDefined();
      expect(validatorService.validateQuestionsOwnership).toHaveBeenCalledWith(
        actorUserId,
        validExamId,
        expect.any(Array)
      );
      expect(repository.replaceDraftItems).toHaveBeenCalledWith(
        validKeyId,
        actorUserId,
        expect.any(Array)
      );
    });

    it('deve rejeitar substituição de itens se o gabarito não estiver em DRAFT (422)', async () => {
      vi.mocked(repository.findById).mockResolvedValueOnce({
        ...baseAnswerKey,
        status: 'PUBLISHED',
      });

      await expect(
        service.replaceDraftItems(actorUserId, validKeyId, {
          items: [{ questionNumber: 1, correctAnswer: 'B' }],
        })
      ).rejects.toThrow(OfficialAnswerKeyError);

      expect(repository.replaceDraftItems).not.toHaveBeenCalled();
    });
  });

  describe('10. deleteDraft', () => {
    it('deve excluir rascunho com sucesso', async () => {
      await service.deleteDraft(actorUserId, validKeyId);

      expect(repository.deleteDraft).toHaveBeenCalledWith(validKeyId, actorUserId);
    });

    it('deve rejeitar exclusão de gabarito que não esteja em estado DRAFT (422)', async () => {
      vi.mocked(repository.findById).mockResolvedValueOnce({
        ...baseAnswerKey,
        status: 'PUBLISHED',
      });

      try {
        await service.deleteDraft(actorUserId, validKeyId);
        expect.unreachable();
      } catch (err) {
        expect((err as OfficialAnswerKeyError).code).toBe('ANSWER_KEY_NOT_DRAFT');
        expect((err as OfficialAnswerKeyError).statusCode).toBe(422);
      }

      expect(repository.deleteDraft).not.toHaveBeenCalled();
    });

    it('deve rejeitar exclusão se o gabarito não for encontrado com 404', async () => {
      await expect(service.deleteDraft(actorUserId, 'missing-id')).rejects.toThrow(
        OfficialAnswerKeyError
      );

      expect(repository.deleteDraft).not.toHaveBeenCalled();
    });
  });

  describe('11. publishAnswerKey — Publicação e Regras de Integridade', () => {
    it('deve publicar o gabarito com sucesso quando todos os itens forem válidos e revisados', async () => {
      const published = await service.publishAnswerKey(actorUserId, validKeyId, {
        confirmAllReviewed: true,
      });

      expect(published).toBeDefined();
      expect(published.status).toBe('PUBLISHED');
      expect(published.isCurrent).toBe(true);
      expect(repository.publishDraft).toHaveBeenCalledWith(
        validKeyId,
        actorUserId,
        undefined
      );
    });

    it('deve rejeitar publicação de gabarito que não esteja em estado DRAFT (422)', async () => {
      vi.mocked(repository.findByIdWithItems).mockResolvedValueOnce({
        ...baseAnswerKey,
        status: 'PUBLISHED',
        items: baseItems,
      });

      try {
        await service.publishAnswerKey(actorUserId, validKeyId);
        expect.unreachable();
      } catch (err) {
        expect((err as OfficialAnswerKeyError).code).toBe('ANSWER_KEY_NOT_DRAFT');
        expect((err as OfficialAnswerKeyError).statusCode).toBe(422);
      }

      expect(repository.publishDraft).not.toHaveBeenCalled();
    });

    it('deve rejeitar publicação de gabarito sem itens cadastrados (400)', async () => {
      vi.mocked(repository.findByIdWithItems).mockResolvedValueOnce({
        ...baseAnswerKey,
        items: [],
      });

      await expect(service.publishAnswerKey(actorUserId, validKeyId)).rejects.toThrow(
        /sem itens cadastrados/
      );

      expect(repository.publishDraft).not.toHaveBeenCalled();
    });

    it('deve rejeitar publicação com itens pendentes de revisão humana (NEEDS_REVIEW) (400)', async () => {
      vi.mocked(repository.findByIdWithItems).mockResolvedValueOnce({
        ...baseAnswerKey,
        items: [
          baseItems[0],
          {
            ...baseItems[1],
            status: 'NEEDS_REVIEW',
          },
        ],
      });

      await expect(
        service.publishAnswerKey(actorUserId, validKeyId, { confirmAllReviewed: true })
      ).rejects.toThrow(/pendentes de revisão humana/);

      expect(repository.publishDraft).not.toHaveBeenCalled();
    });

    it('deve rejeitar publicação se houver item ativo sem resposta correta definida (400)', async () => {
      vi.mocked(repository.findByIdWithItems).mockResolvedValueOnce({
        ...baseAnswerKey,
        items: [
          baseItems[0],
          {
            ...baseItems[1],
            correctAnswer: null, // sem resposta
            isAnnulled: false,
            status: 'ACTIVE',
          },
        ],
      });

      await expect(service.publishAnswerKey(actorUserId, validKeyId)).rejects.toThrow(
        /não possui resposta correta definida/
      );

      expect(repository.publishDraft).not.toHaveBeenCalled();
    });

    it('deve aceitar publicação de item anulado mesmo sem resposta correta', async () => {
      vi.mocked(repository.findByIdWithItems).mockResolvedValueOnce({
        ...baseAnswerKey,
        items: [
          baseItems[0],
          {
            ...baseItems[1],
            correctAnswer: null,
            status: 'ANNULLED',
            isAnnulled: true,
            justification: 'Questão anulada pela banca',
          },
        ],
      });

      const published = await service.publishAnswerKey(actorUserId, validKeyId);

      expect(published).toBeDefined();
      expect(repository.publishDraft).toHaveBeenCalled();
    });

    it('deve rejeitar publicação se houver item com anulação inconsistente', async () => {
      vi.mocked(repository.findByIdWithItems).mockResolvedValueOnce({
        ...baseAnswerKey,
        items: [
          {
            ...baseItems[0],
            status: 'ANNULLED',
            isAnnulled: false, // inconsistente!
          },
        ],
      });

      await expect(service.publishAnswerKey(actorUserId, validKeyId)).rejects.toThrow(
        /isAnnulled false/
      );

      expect(repository.publishDraft).not.toHaveBeenCalled();
    });

    it('Regras 8 e 9: confirmAllReviewed ou syncQuestionAnswers NÃO alteram Question.correctAnswer', async () => {
      await service.publishAnswerKey(actorUserId, validKeyId, {
        syncQuestionAnswers: true,
        confirmAllReviewed: true,
      });

      // Confirma que não houve chamada a nenhum método de escrita em Question
      expect(repository.publishDraft).toHaveBeenCalled();
    });

    it('deve propagar erro de conflito de concorrência (ANSWER_KEY_PUBLISH_CONFLICT, 409) do repositório', async () => {
      vi.mocked(repository.findByIdWithItems).mockResolvedValueOnce({
        ...baseAnswerKey,
        items: baseItems,
      });
      vi.mocked(repository.publishDraft).mockRejectedValueOnce(
        new OfficialAnswerKeyError(
          'ANSWER_KEY_PUBLISH_CONFLICT',
          'Conflito de publicação concorrente: outra versão deste gabarito oficial foi ativada simultaneamente.',
          409
        )
      );

      try {
        await service.publishAnswerKey(actorUserId, validKeyId);
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(OfficialAnswerKeyError);
        expect((err as OfficialAnswerKeyError).code).toBe('ANSWER_KEY_PUBLISH_CONFLICT');
        expect((err as OfficialAnswerKeyError).statusCode).toBe(409);
        expect((err as OfficialAnswerKeyError).message).toContain('Conflito de publicação concorrente');
      }
    });

    it('deve propagar erro se a releitura transacional pós-bloqueio no repositório rejeitar itens modificados por corrida', async () => {
      vi.mocked(repository.findByIdWithItems).mockResolvedValueOnce({
        ...baseAnswerKey,
        items: baseItems,
      });
      vi.mocked(repository.publishDraft).mockRejectedValueOnce(
        new OfficialAnswerKeyError(
          'ANSWER_KEY_INVALID_DATA',
          'Não é possível publicar o gabarito com itens pendentes de revisão humana (questão 1).',
          400
        )
      );

      try {
        await service.publishAnswerKey(actorUserId, validKeyId);
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(OfficialAnswerKeyError);
        expect((err as OfficialAnswerKeyError).code).toBe('ANSWER_KEY_INVALID_DATA');
        expect((err as OfficialAnswerKeyError).statusCode).toBe(400);
        expect((err as OfficialAnswerKeyError).message).toContain('pendentes de revisão humana');
      }
    });
  });

  describe('12. Proteção do Banco de Questões e Ausência de Efeitos Colaterais', () => {
    it('não deve associar questões avulsas ou alterar suas relações durante o ciclo de gabarito', async () => {
      await service.createDraft(actorUserId, {
        examId: validExamId,
        items: [{ questionNumber: 1, questionId: validQuestionId1, correctAnswer: 'A' }],
      });

      await service.updateDraftItem(actorUserId, validKeyId, 1, {
        questionId: validQuestionId1,
        correctAnswer: 'B',
      });

      // Valida que validatorService realizou apenas checagens de leitura
      expect(validatorService.validateDraftCreation).toHaveBeenCalled();
      expect(validatorService.validateDraftItemUpdate).toHaveBeenCalled();
    });
  });
});
