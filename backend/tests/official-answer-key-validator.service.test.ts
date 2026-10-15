import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Exam, PdfDocument, DocumentType } from '@prisma/client';
import {
  OfficialAnswerKeyValidatorService,
} from '../src/services/official-answer-key-validator.service.ts';
import { OfficialAnswerKeyError } from '../src/types/official-answer-key.types.ts';
import type { IExamRepository } from '../src/repositories/exam.repository.ts';
import type { IPdfDocumentRepository } from '../src/repositories/pdf-document.repository.ts';
import type {
  IQuestionRepository,
  QuestionWithAlternatives,
} from '../src/repositories/question.repository.ts';

describe('OfficialAnswerKeyValidatorService — Validação Cruzada de Titularidade (Sprint 5.2.3)', () => {
  const actorUserId = '11111111-1111-4111-8111-111111111111';
  const otherUserId = '99999999-9999-4999-8999-999999999999';

  const validExamId = '22222222-2222-4222-8222-222222222222';
  const otherExamId = '22222222-2222-4222-8222-333333333333';

  const validPdfDocumentId = '44444444-4444-4444-8444-444444444444';
  const validQuestionId1 = '55555555-5555-4555-8555-555555555551';
  const validQuestionId2 = '55555555-5555-4555-8555-555555555552';

  const mockExam: Exam = {
    id: validExamId,
    userId: actorUserId,
    title: 'Concurso Público 2026',
    institution: 'Tribunal Regional',
    board: 'CESPE / CEBRASPE',
    year: 2026,
    position: 'Analista Judiciário',
    description: 'Prova aplicada para analista',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
  };

  const mockPdfDocument: PdfDocument = {
    id: validPdfDocumentId,
    userId: actorUserId,
    examId: validExamId,
    documentType: 'ANSWER_KEY' as DocumentType,
    originalName: 'gabarito_oficial_preliminar.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 102400,
    storageBucket: 'questforge-private',
    objectKey: `users/${actorUserId}/pdf/${validPdfDocumentId}.pdf`,
    checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    status: 'COMPLETED',
    pageCount: 3,
    extractedText: '1. A 2. B 3. C',
    extractedCharCount: 15,
    requiresOcr: false,
    errorMessage: null,
    processedAt: new Date('2026-01-03'),
    createdAt: new Date('2026-01-03'),
    updatedAt: new Date('2026-01-03'),
  };

  const mockQuestion1: QuestionWithAlternatives = {
    id: validQuestionId1,
    userId: actorUserId,
    examId: validExamId,
    originalNumber: 1,
    statement: 'Acerca dos princípios fundamentais...',
    type: 'MULTIPLE_CHOICE',
    subject: 'Direito Constitucional',
    topic: 'Princípios Fundamentais',
    subtopic: null,
    board: 'CESPE',
    examTitle: 'Concurso 2026',
    year: 2026,
    difficulty: 'MEDIUM',
    correctAnswer: 'A',
    explanation: 'A alternativa A é a correta...',
    sourcePage: 1,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-04'),
    updatedAt: new Date('2026-01-04'),
    alternatives: [
      { id: 'alt-1', questionId: validQuestionId1, letter: 'A', text: 'Opção A', position: 1 },
      { id: 'alt-2', questionId: validQuestionId1, letter: 'B', text: 'Opção B', position: 2 },
    ],
  };

  const mockQuestion2: QuestionWithAlternatives = {
    id: validQuestionId2,
    userId: actorUserId,
    examId: validExamId,
    originalNumber: 2,
    statement: 'Quanto aos direitos e garantias...',
    type: 'MULTIPLE_CHOICE',
    subject: 'Direito Constitucional',
    topic: 'Direitos Individuais',
    subtopic: null,
    board: 'CESPE',
    examTitle: 'Concurso 2026',
    year: 2026,
    difficulty: 'HARD',
    correctAnswer: 'C',
    explanation: 'A alternativa C é a correta...',
    sourcePage: 2,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-04'),
    updatedAt: new Date('2026-01-04'),
    alternatives: [
      { id: 'alt-3', questionId: validQuestionId2, letter: 'A', text: 'Opção A', position: 1 },
      { id: 'alt-4', questionId: validQuestionId2, letter: 'C', text: 'Opção C', position: 2 },
    ],
  };

  let examRepository: IExamRepository;
  let pdfDocumentRepository: IPdfDocumentRepository;
  let questionRepository: IQuestionRepository;
  let validator: OfficialAnswerKeyValidatorService;

  beforeEach(() => {
    examRepository = {
      findById: vi.fn().mockResolvedValue(mockExam),
    };

    pdfDocumentRepository = {
      findById: vi.fn().mockResolvedValue(mockPdfDocument),
      create: vi.fn(),
      findManyByUser: vi.fn(),
      markProcessing: vi.fn(),
      tryAcquireOcrProcessing: vi.fn(),
      markExtractionCompleted: vi.fn(),
      markFailed: vi.fn(),
      deleteById: vi.fn(),
    };

    questionRepository = {
      findById: vi.fn().mockImplementation((id: string) => {
        if (id === validQuestionId1) return Promise.resolve(mockQuestion1);
        if (id === validQuestionId2) return Promise.resolve(mockQuestion2);
        return Promise.resolve(null);
      }),
      create: vi.fn(),
      findManyByUser: vi.fn(),
      updateAtomically: vi.fn(),
      deleteById: vi.fn(),
    };

    validator = new OfficialAnswerKeyValidatorService({
      examRepository,
      pdfDocumentRepository,
      questionRepository,
    });
  });

  describe('1. Validação de Prova (Exam)', () => {
    it('deve validar com sucesso prova existente pertencente ao usuário autenticado', async () => {
      const exam = await validator.validateExamOwnership(actorUserId, validExamId);

      expect(exam).toBeDefined();
      expect(exam.id).toBe(validExamId);
      expect(exam.userId).toBe(actorUserId);
      expect(examRepository.findById).toHaveBeenCalledWith(validExamId);
    });

    it('deve rejeitar prova inexistente com EXAM_NOT_FOUND (404)', async () => {
      vi.mocked(examRepository.findById).mockResolvedValueOnce(null);

      await expect(
        validator.validateExamOwnership(actorUserId, 'non-existent-exam')
      ).rejects.toThrow(OfficialAnswerKeyError);

      try {
        await validator.validateExamOwnership(actorUserId, 'non-existent-exam');
      } catch (err) {
        expect(err).toBeInstanceOf(OfficialAnswerKeyError);
        const error = err as OfficialAnswerKeyError;
        expect(error.code).toBe('EXAM_NOT_FOUND');
        expect(error.statusCode).toBe(404);
        expect(error.message).toContain('Prova não encontrada');
      }
    });

    it('deve rejeitar prova pertencente a outro usuário com EXAM_FORBIDDEN (403) sem vazar dados', async () => {
      vi.mocked(examRepository.findById).mockResolvedValueOnce({
        ...mockExam,
        userId: otherUserId,
      });

      try {
        await validator.validateExamOwnership(actorUserId, validExamId);
        expect.unreachable('Deveria ter lançado erro');
      } catch (err) {
        expect(err).toBeInstanceOf(OfficialAnswerKeyError);
        const error = err as OfficialAnswerKeyError;
        expect(error.code).toBe('EXAM_FORBIDDEN');
        expect(error.statusCode).toBe(403);
        expect(error.message).toContain('Acesso negado');
        expect(error.message).not.toContain(otherUserId);
      }
    });

    it('deve rejeitar actorUserId ausente ou em branco com EXAM_FORBIDDEN (403)', async () => {
      await expect(validator.validateExamOwnership('', validExamId)).rejects.toThrow(
        /Usuário autenticado obrigatório/
      );
      await expect(validator.validateExamOwnership('   ', validExamId)).rejects.toThrow(
        /Usuário autenticado obrigatório/
      );
    });

    it('deve rejeitar examId ausente com ANSWER_KEY_INVALID_DATA (400)', async () => {
      await expect(validator.validateExamOwnership(actorUserId, '')).rejects.toThrow(
        /identificador da prova \(examId\) é obrigatório/
      );
    });

    it('deve adotar comportamento fail-closed caso o repositório lance erro inesperado', async () => {
      vi.mocked(examRepository.findById).mockRejectedValueOnce(
        new Error('Database connectivity lost')
      );

      await expect(validator.validateExamOwnership(actorUserId, validExamId)).rejects.toThrow(
        'Database connectivity lost'
      );
    });
  });

  describe('2. Validação de Documento PDF (PdfDocument)', () => {
    it('deve retornar null quando pdfDocumentId for nulo ou omitido sem consultar repositório', async () => {
      const res1 = await validator.validatePdfDocumentOwnership(actorUserId, null);
      const res2 = await validator.validatePdfDocumentOwnership(actorUserId, undefined);
      const res3 = await validator.validatePdfDocumentOwnership(actorUserId, '');

      expect(res1).toBeNull();
      expect(res2).toBeNull();
      expect(res3).toBeNull();
      expect(pdfDocumentRepository.findById).not.toHaveBeenCalled();
    });

    it('deve aceitar PDF válido de tipo ANSWER_KEY pertencente ao usuário e vinculado à prova', async () => {
      const doc = await validator.validatePdfDocumentOwnership(
        actorUserId,
        validPdfDocumentId,
        validExamId
      );

      expect(doc).toBeDefined();
      expect(doc?.id).toBe(validPdfDocumentId);
      expect(doc?.documentType).toBe('ANSWER_KEY');
      expect(doc?.userId).toBe(actorUserId);
    });

    it('deve aceitar PDF de tipo ANSWER_KEY sem examId predefinido (doc.examId === null)', async () => {
      vi.mocked(pdfDocumentRepository.findById).mockResolvedValueOnce({
        ...mockPdfDocument,
        examId: null,
      });

      const doc = await validator.validatePdfDocumentOwnership(
        actorUserId,
        validPdfDocumentId,
        validExamId
      );

      expect(doc).toBeDefined();
      expect(doc?.examId).toBeNull();
    });

    it('deve rejeitar PDF inexistente com DOCUMENT_NOT_FOUND (404)', async () => {
      vi.mocked(pdfDocumentRepository.findById).mockResolvedValueOnce(null);

      try {
        await validator.validatePdfDocumentOwnership(actorUserId, 'non-existent-pdf');
        expect.unreachable('Deveria ter lançado erro');
      } catch (err) {
        expect(err).toBeInstanceOf(OfficialAnswerKeyError);
        const error = err as OfficialAnswerKeyError;
        expect(error.code).toBe('DOCUMENT_NOT_FOUND');
        expect(error.statusCode).toBe(404);
        expect(error.message).toContain('Documento PDF não encontrado');
      }
    });

    it('deve rejeitar PDF pertencente a outro usuário com DOCUMENT_FORBIDDEN (403)', async () => {
      vi.mocked(pdfDocumentRepository.findById).mockResolvedValueOnce({
        ...mockPdfDocument,
        userId: otherUserId,
      });

      try {
        await validator.validatePdfDocumentOwnership(actorUserId, validPdfDocumentId);
        expect.unreachable('Deveria ter lançado erro');
      } catch (err) {
        expect(err).toBeInstanceOf(OfficialAnswerKeyError);
        const error = err as OfficialAnswerKeyError;
        expect(error.code).toBe('DOCUMENT_FORBIDDEN');
        expect(error.statusCode).toBe(403);
        expect(error.message).toContain('Acesso negado');
      }
    });

    it('deve rejeitar PDF com tipo incompatível (EXAM) com DOCUMENT_INVALID_TYPE (400)', async () => {
      vi.mocked(pdfDocumentRepository.findById).mockResolvedValueOnce({
        ...mockPdfDocument,
        documentType: 'EXAM' as DocumentType,
      });

      try {
        await validator.validatePdfDocumentOwnership(actorUserId, validPdfDocumentId);
        expect.unreachable('Deveria ter lançado erro');
      } catch (err) {
        expect(err).toBeInstanceOf(OfficialAnswerKeyError);
        const error = err as OfficialAnswerKeyError;
        expect(error.code).toBe('DOCUMENT_INVALID_TYPE');
        expect(error.statusCode).toBe(400);
        expect(error.message).toContain('tipo esperado: ANSWER_KEY');
      }
    });

    it('deve rejeitar PDF vinculado a outra prova com DOCUMENT_INVALID_TYPE (400)', async () => {
      vi.mocked(pdfDocumentRepository.findById).mockResolvedValueOnce({
        ...mockPdfDocument,
        examId: otherExamId,
      });

      try {
        await validator.validatePdfDocumentOwnership(
          actorUserId,
          validPdfDocumentId,
          validExamId
        );
        expect.unreachable('Deveria ter lançado erro');
      } catch (err) {
        expect(err).toBeInstanceOf(OfficialAnswerKeyError);
        const error = err as OfficialAnswerKeyError;
        expect(error.code).toBe('DOCUMENT_INVALID_TYPE');
        expect(error.statusCode).toBe(400);
        expect(error.message).toContain('vinculado a outra prova');
      }
    });

    it('deve rejeitar actorUserId ausente quando pdfDocumentId for fornecido', async () => {
      await expect(
        validator.validatePdfDocumentOwnership('', validPdfDocumentId)
      ).rejects.toThrow(/Usuário autenticado obrigatório/);
    });
  });

  describe('3. Validação de Questões (Question)', () => {
    it('deve retornar Map vazio quando items for vazio ou omitido sem consultar repositório', async () => {
      const map1 = await validator.validateQuestionsOwnership(actorUserId, validExamId, []);
      const map2 = await validator.validateQuestionsOwnership(actorUserId, validExamId, undefined);

      expect(map1.size).toBe(0);
      expect(map2.size).toBe(0);
      expect(questionRepository.findById).not.toHaveBeenCalled();
    });

    it('deve ignorar itens com questionId nulo ou indefinido sem lançar erro', async () => {
      const items = [
        { questionNumber: 1, questionId: null },
        { questionNumber: 2, questionId: undefined },
      ];

      const map = await validator.validateQuestionsOwnership(actorUserId, validExamId, items);

      expect(map.size).toBe(0);
      expect(questionRepository.findById).not.toHaveBeenCalled();
    });

    it('deve validar com sucesso questões pertencentes ao usuário e à mesma prova', async () => {
      const items = [
        { questionNumber: 1, questionId: validQuestionId1 },
        { questionNumber: 2, questionId: validQuestionId2 },
      ];

      const map = await validator.validateQuestionsOwnership(actorUserId, validExamId, items);

      expect(map.size).toBe(2);
      expect(map.get(validQuestionId1)?.id).toBe(validQuestionId1);
      expect(map.get(validQuestionId2)?.id).toBe(validQuestionId2);
      expect(questionRepository.findById).toHaveBeenCalledWith(validQuestionId1);
      expect(questionRepository.findById).toHaveBeenCalledWith(validQuestionId2);
    });

    it('deve aceitar questão do usuário que não tenha examId definido (question.examId === null)', async () => {
      vi.mocked(questionRepository.findById).mockResolvedValueOnce({
        ...mockQuestion1,
        examId: null,
      });

      const items = [{ questionNumber: 1, questionId: validQuestionId1 }];
      const map = await validator.validateQuestionsOwnership(actorUserId, validExamId, items);

      expect(map.has(validQuestionId1)).toBe(true);
    });

    it('deve rejeitar questão duplicada em múltiplos itens do payload com ANSWER_KEY_DUPLICATE_ITEM (422)', async () => {
      const items = [
        { questionNumber: 1, questionId: validQuestionId1 },
        { questionNumber: 2, questionId: validQuestionId1 }, // duplicado
      ];

      try {
        await validator.validateQuestionsOwnership(actorUserId, validExamId, items);
        expect.unreachable('Deveria ter lançado erro');
      } catch (err) {
        expect(err).toBeInstanceOf(OfficialAnswerKeyError);
        const error = err as OfficialAnswerKeyError;
        expect(error.code).toBe('ANSWER_KEY_DUPLICATE_ITEM');
        expect(error.statusCode).toBe(422);
        expect(error.message).toContain('duplicidade no mesmo gabarito');
      }

      // Garante que não fez consultas desnecessárias ao banco antes de validar integridade do payload
      expect(questionRepository.findById).not.toHaveBeenCalled();
    });

    it('deve rejeitar questão inexistente com QUESTION_NOT_FOUND (404)', async () => {
      const missingId = '55555555-5555-4555-8555-000000000000';
      const items = [{ questionNumber: 1, questionId: missingId }];

      try {
        await validator.validateQuestionsOwnership(actorUserId, validExamId, items);
        expect.unreachable('Deveria ter lançado erro');
      } catch (err) {
        expect(err).toBeInstanceOf(OfficialAnswerKeyError);
        const error = err as OfficialAnswerKeyError;
        expect(error.code).toBe('QUESTION_NOT_FOUND');
        expect(error.statusCode).toBe(404);
        expect(error.message).toContain(missingId);
      }
    });

    it('deve rejeitar questão de outro usuário com QUESTION_FORBIDDEN (403) sem vazar dados', async () => {
      vi.mocked(questionRepository.findById).mockResolvedValueOnce({
        ...mockQuestion1,
        userId: otherUserId,
      });

      const items = [{ questionNumber: 1, questionId: validQuestionId1 }];

      try {
        await validator.validateQuestionsOwnership(actorUserId, validExamId, items);
        expect.unreachable('Deveria ter lançado erro');
      } catch (err) {
        expect(err).toBeInstanceOf(OfficialAnswerKeyError);
        const error = err as OfficialAnswerKeyError;
        expect(error.code).toBe('QUESTION_FORBIDDEN');
        expect(error.statusCode).toBe(403);
        expect(error.message).toContain('Acesso negado');
        expect(error.message).not.toContain(otherUserId);
      }
    });

    it('deve rejeitar questão vinculada a outra prova com QUESTION_EXAM_MISMATCH (400)', async () => {
      vi.mocked(questionRepository.findById).mockResolvedValueOnce({
        ...mockQuestion1,
        examId: otherExamId,
      });

      const items = [{ questionNumber: 1, questionId: validQuestionId1 }];

      try {
        await validator.validateQuestionsOwnership(actorUserId, validExamId, items);
        expect.unreachable('Deveria ter lançado erro');
      } catch (err) {
        expect(err).toBeInstanceOf(OfficialAnswerKeyError);
        const error = err as OfficialAnswerKeyError;
        expect(error.code).toBe('QUESTION_EXAM_MISMATCH');
        expect(error.statusCode).toBe(400);
        expect(error.message).toContain('vinculada a outra prova');
      }
    });

    it('deve abortar atomicamente quando uma entre múltiplas questões for inválida', async () => {
      vi.mocked(questionRepository.findById).mockImplementation(async (id: string) => {
        if (id === validQuestionId1) return mockQuestion1;
        if (id === validQuestionId2) {
          // A segunda questão pertence a outro usuário
          return { ...mockQuestion2, userId: otherUserId };
        }
        return null;
      });

      const items = [
        { questionNumber: 1, questionId: validQuestionId1 },
        { questionNumber: 2, questionId: validQuestionId2 },
      ];

      await expect(
        validator.validateQuestionsOwnership(actorUserId, validExamId, items)
      ).rejects.toThrow(OfficialAnswerKeyError);
    });

    it('deve rejeitar actorUserId ausente na validação de questões', async () => {
      const items = [{ questionNumber: 1, questionId: validQuestionId1 }];
      await expect(
        validator.validateQuestionsOwnership('', validExamId, items)
      ).rejects.toThrow(/Usuário autenticado obrigatório/);
    });
  });

  describe('4. Validação Composta (validateDraftCreation & validateDraftUpdate & validateDraftItemUpdate)', () => {
    it('deve validar criação de rascunho com sucesso para prova, PDF e questões consistentes', async () => {
      const result = await validator.validateDraftCreation({
        actorUserId,
        examId: validExamId,
        pdfDocumentId: validPdfDocumentId,
        items: [
          { questionNumber: 1, questionId: validQuestionId1 },
          { questionNumber: 2, questionId: validQuestionId2 },
        ],
      });

      expect(result.exam.id).toBe(validExamId);
      expect(result.pdfDocument?.id).toBe(validPdfDocumentId);
      expect(result.questionsById.size).toBe(2);
    });

    it('deve falhar de forma fail-closed na criação se a prova falhar antes do PDF e questões', async () => {
      vi.mocked(examRepository.findById).mockResolvedValueOnce(null);

      await expect(
        validator.validateDraftCreation({
          actorUserId,
          examId: 'invalid-exam',
          pdfDocumentId: validPdfDocumentId,
          items: [{ questionNumber: 1, questionId: validQuestionId1 }],
        })
      ).rejects.toThrow(/Prova não encontrada/);

      expect(pdfDocumentRepository.findById).not.toHaveBeenCalled();
      expect(questionRepository.findById).not.toHaveBeenCalled();
    });

    it('deve falhar na criação se o PDF falhar antes das questões', async () => {
      vi.mocked(pdfDocumentRepository.findById).mockResolvedValueOnce(null);

      await expect(
        validator.validateDraftCreation({
          actorUserId,
          examId: validExamId,
          pdfDocumentId: 'invalid-pdf',
          items: [{ questionNumber: 1, questionId: validQuestionId1 }],
        })
      ).rejects.toThrow(/Documento PDF não encontrado/);

      expect(questionRepository.findById).not.toHaveBeenCalled();
    });

    it('deve validar atualização de rascunho (validateDraftUpdate)', async () => {
      const result = await validator.validateDraftUpdate({
        actorUserId,
        examId: validExamId,
        pdfDocumentId: null,
        items: [{ questionNumber: 1, questionId: validQuestionId1 }],
      });

      expect(result.exam.id).toBe(validExamId);
      expect(result.pdfDocument).toBeNull();
      expect(result.questionsById.size).toBe(1);
    });

    it('deve validar atualização pontual de item com questionId preenchido (validateDraftItemUpdate)', async () => {
      const result = await validator.validateDraftItemUpdate({
        actorUserId,
        examId: validExamId,
        questionId: validQuestionId1,
      });

      expect(result.question).toBeDefined();
      expect(result.question?.id).toBe(validQuestionId1);
    });

    it('deve validar atualização pontual de item sem questionId (retornando question null)', async () => {
      const result = await validator.validateDraftItemUpdate({
        actorUserId,
        examId: validExamId,
        questionId: null,
      });

      expect(result.question).toBeNull();
    });
  });

  describe('5. Garantia de Operações Somente-Leitura (Nenhuma Escrita Executada)', () => {
    it('deve garantir que nenhuma função de mutação/escrita foi chamada nos repositórios', async () => {
      await validator.validateDraftCreation({
        actorUserId,
        examId: validExamId,
        pdfDocumentId: validPdfDocumentId,
        items: [{ questionNumber: 1, questionId: validQuestionId1 }],
      });

      // Checa chamadas nos mocks de PDF
      expect(pdfDocumentRepository.create).not.toHaveBeenCalled();
      expect(pdfDocumentRepository.deleteById).not.toHaveBeenCalled();
      expect(pdfDocumentRepository.markProcessing).not.toHaveBeenCalled();
      expect(pdfDocumentRepository.markExtractionCompleted).not.toHaveBeenCalled();
      expect(pdfDocumentRepository.markFailed).not.toHaveBeenCalled();

      // Checa chamadas nos mocks de Questão
      expect(questionRepository.create).not.toHaveBeenCalled();
      expect(questionRepository.updateAtomically).not.toHaveBeenCalled();
      expect(questionRepository.deleteById).not.toHaveBeenCalled();
    });

    it('deve garantir que uma falha de validação no meio do fluxo não invoca escrita residual', async () => {
      vi.mocked(questionRepository.findById).mockResolvedValueOnce({
        ...mockQuestion1,
        userId: otherUserId,
      });

      await expect(
        validator.validateDraftCreation({
          actorUserId,
          examId: validExamId,
          pdfDocumentId: validPdfDocumentId,
          items: [{ questionNumber: 1, questionId: validQuestionId1 }],
        })
      ).rejects.toThrow(OfficialAnswerKeyError);

      expect(pdfDocumentRepository.create).not.toHaveBeenCalled();
      expect(questionRepository.create).not.toHaveBeenCalled();
    });
  });
});
