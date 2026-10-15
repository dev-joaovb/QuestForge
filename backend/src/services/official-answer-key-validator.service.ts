import type { Exam, PdfDocument } from '@prisma/client';
import {
  OfficialAnswerKeyError,
} from '../types/official-answer-key.types.ts';
import {
  type IExamRepository,
  PrismaExamRepository,
} from '../repositories/exam.repository.ts';
import {
  type IPdfDocumentRepository,
  PrismaPdfDocumentRepository,
} from '../repositories/pdf-document.repository.ts';
import {
  type IQuestionRepository,
  type QuestionWithAlternatives,
  PrismaQuestionRepository,
} from '../repositories/question.repository.ts';

export interface OfficialAnswerKeyValidatorDependencies {
  examRepository?: IExamRepository;
  pdfDocumentRepository?: IPdfDocumentRepository;
  questionRepository?: IQuestionRepository;
}

export interface ValidatedAnswerKeyRelations {
  exam: Exam;
  pdfDocument: PdfDocument | null;
  questionsById: Map<string, QuestionWithAlternatives>;
}

export interface ValidateDraftCreationInput {
  actorUserId: string;
  examId: string;
  pdfDocumentId?: string | null;
  items?: Array<{ questionId?: string | null; questionNumber?: number }>;
}

export interface ValidateDraftUpdateInput {
  actorUserId: string;
  examId: string;
  pdfDocumentId?: string | null;
  items?: Array<{ questionId?: string | null; questionNumber?: number }>;
}

export interface ValidateDraftItemUpdateInput {
  actorUserId: string;
  examId: string;
  questionId?: string | null;
}

/**
 * Módulo de Validação de Titularidade e Integridade Relacional (Sprint 5.2.3).
 *
 * Responsabilidades e Diretrizes de Segurança:
 * 1. Isolamento estrito de titularidade: exige obrigatoriamente `actorUserId` autenticado.
 *    Nunca aceita identidade provinda de payloads externos.
 * 2. Comportamento fail-closed: se a titularidade de qualquer entidade relacionada não puder
 *    ser comprovada categoricamente, a operação é bloqueada sem efeitos colaterais.
 * 3. Prova (`Exam`): confirma existência e pertença ao `actorUserId`.
 * 4. Documento PDF (`PdfDocument`): se informado, valida existência, titularidade, tipo `ANSWER_KEY`
 *    e integridade de vínculo com a prova.
 * 5. Questões (`Question`): valida existência, titularidade do usuário, unicidade no gabarito
 *    e compatibilidade relacional com a prova informada (quando `question.examId` estiver definido).
 * 6. Operações estritamente somente-leitura: nunca executa mutações no banco de dados.
 */
export class OfficialAnswerKeyValidatorService {
  private readonly examRepository: IExamRepository;
  private readonly pdfDocumentRepository: IPdfDocumentRepository;
  private readonly questionRepository: IQuestionRepository;

  constructor(deps: OfficialAnswerKeyValidatorDependencies = {}) {
    this.examRepository = deps.examRepository ?? new PrismaExamRepository();
    this.pdfDocumentRepository = deps.pdfDocumentRepository ?? new PrismaPdfDocumentRepository();
    this.questionRepository = deps.questionRepository ?? new PrismaQuestionRepository();
  }

  /**
   * Valida a existência e a titularidade da prova informada.
   * Lança 404 se a prova não existir ou 403 se pertencer a outro usuário.
   */
  async validateExamOwnership(actorUserId: string, examId: string): Promise<Exam> {
    if (!actorUserId || typeof actorUserId !== 'string' || actorUserId.trim() === '') {
      throw new OfficialAnswerKeyError(
        'EXAM_FORBIDDEN',
        'Usuário autenticado obrigatório para validar titularidade da prova.',
        403
      );
    }

    if (!examId || typeof examId !== 'string' || examId.trim() === '') {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_INVALID_DATA',
        'O identificador da prova (examId) é obrigatório.',
        400
      );
    }

    const exam = await this.examRepository.findById(examId.trim());

    if (!exam) {
      throw new OfficialAnswerKeyError('EXAM_NOT_FOUND', 'Prova não encontrada.', 404);
    }

    if (exam.userId !== actorUserId) {
      throw new OfficialAnswerKeyError(
        'EXAM_FORBIDDEN',
        'Acesso negado: a prova informada não pertence ao usuário autenticado.',
        403
      );
    }

    return exam;
  }

  /**
   * Valida o documento PDF associado (quando informado).
   * - Confirma existência e titularidade (`doc.userId === actorUserId`).
   * - Confirma que o tipo do documento é estritamente `ANSWER_KEY`.
   * - Se o documento já estiver vinculado a uma prova (`doc.examId`), valida correspondência com `examId`.
   */
  async validatePdfDocumentOwnership(
    actorUserId: string,
    pdfDocumentId?: string | null,
    examId?: string
  ): Promise<PdfDocument | null> {
    if (!pdfDocumentId || pdfDocumentId.trim() === '') {
      return null;
    }

    if (!actorUserId || typeof actorUserId !== 'string' || actorUserId.trim() === '') {
      throw new OfficialAnswerKeyError(
        'DOCUMENT_FORBIDDEN',
        'Usuário autenticado obrigatório para validar titularidade do documento PDF.',
        403
      );
    }

    const doc = await this.pdfDocumentRepository.findById(pdfDocumentId.trim());

    if (!doc) {
      throw new OfficialAnswerKeyError('DOCUMENT_NOT_FOUND', 'Documento PDF não encontrado.', 404);
    }

    if (doc.userId !== actorUserId) {
      throw new OfficialAnswerKeyError(
        'DOCUMENT_FORBIDDEN',
        'Acesso negado: o documento PDF informado não pertence ao usuário autenticado.',
        403
      );
    }

    if (doc.documentType !== 'ANSWER_KEY') {
      throw new OfficialAnswerKeyError(
        'DOCUMENT_INVALID_TYPE',
        'O documento PDF selecionado não é um gabarito oficial (tipo esperado: ANSWER_KEY).',
        400
      );
    }

    if (examId && doc.examId && doc.examId !== examId) {
      throw new OfficialAnswerKeyError(
        'DOCUMENT_INVALID_TYPE',
        'O documento PDF informado está vinculado a outra prova.',
        400
      );
    }

    return doc;
  }

  /**
   * Valida todas as questões referenciadas pelos itens do gabarito:
   * - Rejeita `questionId` duplicado no mesmo payload.
   * - Confirma existência de cada questão.
   * - Confirma que todas as questões pertencem a `actorUserId`.
   * - Se a questão possuir `examId` definido, confirma que corresponde exatamente a `examId`.
   */
  async validateQuestionsOwnership(
    actorUserId: string,
    examId: string,
    items?: Array<{ questionId?: string | null; questionNumber?: number }>
  ): Promise<Map<string, QuestionWithAlternatives>> {
    const questionsById = new Map<string, QuestionWithAlternatives>();

    if (!items || items.length === 0) {
      return questionsById;
    }

    if (!actorUserId || typeof actorUserId !== 'string' || actorUserId.trim() === '') {
      throw new OfficialAnswerKeyError(
        'QUESTION_FORBIDDEN',
        'Usuário autenticado obrigatório para validar questões.',
        403
      );
    }

    const seenQuestionIds = new Set<string>();

    for (const item of items) {
      const rawQuestionId = item.questionId;
      if (!rawQuestionId || typeof rawQuestionId !== 'string' || rawQuestionId.trim() === '') {
        continue;
      }

      const qId = rawQuestionId.trim();

      if (seenQuestionIds.has(qId)) {
        throw new OfficialAnswerKeyError(
          'ANSWER_KEY_DUPLICATE_ITEM',
          `Questão vinculada em duplicidade no mesmo gabarito: questão ${qId}.`,
          422
        );
      }
      seenQuestionIds.add(qId);
    }

    for (const qId of seenQuestionIds) {
      const question = await this.questionRepository.findById(qId);

      if (!question) {
        throw new OfficialAnswerKeyError(
          'QUESTION_NOT_FOUND',
          `Questão não encontrada: ${qId}.`,
          404
        );
      }

      if (question.userId !== actorUserId) {
        throw new OfficialAnswerKeyError(
          'QUESTION_FORBIDDEN',
          'Acesso negado: a questão informada não pertence ao usuário autenticado.',
          403
        );
      }

      if (question.examId && question.examId !== examId) {
        throw new OfficialAnswerKeyError(
          'QUESTION_EXAM_MISMATCH',
          `A questão informada (${qId}) está vinculada a outra prova e não pode ser associada a este gabarito.`,
          400
        );
      }

      questionsById.set(qId, question);
    }

    return questionsById;
  }

  /**
   * Validação composta completa para criação de rascunho de gabarito.
   */
  async validateDraftCreation(input: ValidateDraftCreationInput): Promise<ValidatedAnswerKeyRelations> {
    const exam = await this.validateExamOwnership(input.actorUserId, input.examId);
    const pdfDocument = await this.validatePdfDocumentOwnership(
      input.actorUserId,
      input.pdfDocumentId,
      exam.id
    );
    const questionsById = await this.validateQuestionsOwnership(
      input.actorUserId,
      exam.id,
      input.items
    );

    return {
      exam,
      pdfDocument,
      questionsById,
    };
  }

  /**
   * Validação composta para atualização de metadados e/ou substituição de itens de um rascunho.
   */
  async validateDraftUpdate(input: ValidateDraftUpdateInput): Promise<ValidatedAnswerKeyRelations> {
    const exam = await this.validateExamOwnership(input.actorUserId, input.examId);
    const pdfDocument = await this.validatePdfDocumentOwnership(
      input.actorUserId,
      input.pdfDocumentId,
      exam.id
    );
    const questionsById = await this.validateQuestionsOwnership(
      input.actorUserId,
      exam.id,
      input.items
    );

    return {
      exam,
      pdfDocument,
      questionsById,
    };
  }

  /**
   * Validação pontual para atualização de um item individual de rascunho.
   */
  async validateDraftItemUpdate(
    input: ValidateDraftItemUpdateInput
  ): Promise<{ question: QuestionWithAlternatives | null }> {
    await this.validateExamOwnership(input.actorUserId, input.examId);

    if (!input.questionId || input.questionId.trim() === '') {
      return { question: null };
    }

    const questionsMap = await this.validateQuestionsOwnership(
      input.actorUserId,
      input.examId,
      [{ questionId: input.questionId }]
    );

    return {
      question: questionsMap.get(input.questionId.trim()) ?? null,
    };
  }
}
