import {
  QuestionDomainError,
  type PaginatedQuestionsResult,
  type QuestionOwnerDetailDTO,
  type QuestionResponseDTO,
} from '../types/question.types.ts';
import {
  createQuestionSchema,
  listQuestionsQuerySchema,
  updateQuestionSchema,
  type CreateQuestionInput,
  type ListQuestionsQueryInput,
  type UpdateQuestionInput,
} from '../validators/question.validator.ts';
import {
  PrismaQuestionRepository,
  toQuestionOwnerDetailDTO,
  toQuestionPublicViewDTO,
  type IQuestionRepository,
  type QuestionWithAlternatives,
} from '../repositories/question.repository.ts';
import { logger } from '../utils/logger.ts';

export interface QuestionServiceDependencies {
  questionRepository?: IQuestionRepository;
}

/**
 * Serviço de Domínio do Banco de Questões (Sprint 2 — Etapa 2.1).
 *
 * Regras de Domínio e Segurança:
 * 1. Propriedade estrita (`actorUserId`): toda questão pertence ao usuário autenticado que a criou.
 *    Nunca confia em `userId` vindo do payload externo.
 * 2. Isolamento entre usuários: tentativas de consultar, editar ou excluir questão de outro usuário
 *    são bloqueadas com `QUESTION_FORBIDDEN` (403).
 * 3. Política de proteção do gabarito (`applyAnswerKeyPolicy`):
 *    - Na listagem e consulta padrão (`revealAnswerKey = false`), retorna `QuestionPublicViewDTO`,
 *      omitindo `correctAnswer` e `explanation`.
 *    - A revelação de `correctAnswer` e `explanation` (`QuestionOwnerDetailDTO`) só ocorre quando
 *      `entity.userId === actorUserId` E `revealAnswerKey === true` (ou no retorno de criação/edição pelo dono).
 * 4. Consistência atômica entre `alternatives` e `correctAnswer` em atualizações (`updateQuestion`):
 *    - Se `alternatives` ou `correctAnswer` forem alterados, o conjunto resultante final é validado
 *      antes da persistência. Se a resposta correta resultante apontar para uma alternativa que foi
 *      removida ou que não existe nas alternativas da questão, a atualização é rejeitada com 400
 *      (`QUESTION_VALIDATION_ERROR`).
 */
export class QuestionService {
  private readonly questionRepository: IQuestionRepository;

  constructor(deps: QuestionServiceDependencies = {}) {
    this.questionRepository = deps.questionRepository ?? new PrismaQuestionRepository();
  }

  /**
   * Aplica a política explícita de seleção de DTO para proteger `correctAnswer` e `explanation`.
   */
  private applyAnswerKeyPolicy(
    entity: QuestionWithAlternatives,
    actorUserId: string,
    revealAnswerKey: boolean
  ): QuestionResponseDTO {
    const isOwner = entity.userId === actorUserId;
    if (isOwner && revealAnswerKey) {
      return toQuestionOwnerDetailDTO(entity);
    }
    return toQuestionPublicViewDTO(entity);
  }

  async createQuestion(
    actorUserId: string,
    rawInput: CreateQuestionInput
  ): Promise<QuestionOwnerDetailDTO> {
    if (!actorUserId || actorUserId.trim() === '') {
      throw new QuestionDomainError(
        'QUESTION_FORBIDDEN',
        'Usuário autenticado obrigatório para cadastrar questão.',
        403
      );
    }

    const parsed = createQuestionSchema.safeParse(rawInput);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message ?? 'Dados da questão inválidos.';
      throw new QuestionDomainError('QUESTION_VALIDATION_ERROR', firstIssue, 400);
    }

    const created = await this.questionRepository.create(actorUserId, parsed.data);

    logger.info('question_created', {
      questionId: created.id,
      userId: actorUserId,
      subject: created.subject,
      type: created.type,
      alternativesCount: created.alternatives.length,
    });

    return toQuestionOwnerDetailDTO(created);
  }

  async listQuestions(
    actorUserId: string,
    rawQuery: ListQuestionsQueryInput = {}
  ): Promise<PaginatedQuestionsResult<QuestionResponseDTO>> {
    const parsedQuery = listQuestionsQuerySchema.safeParse(rawQuery);
    if (!parsedQuery.success) {
      const firstIssue =
        parsedQuery.error.issues[0]?.message ?? 'Parâmetros de consulta inválidos.';
      throw new QuestionDomainError('QUESTION_VALIDATION_ERROR', firstIssue, 400);
    }

    const query = parsedQuery.data;
    const { items, total } = await this.questionRepository.findManyByUser(
      actorUserId,
      query
    );

    const totalPages = Math.max(1, Math.ceil(total / query.limit));

    return {
      items: items.map((entity) =>
        this.applyAnswerKeyPolicy(entity, actorUserId, query.includeAnswer)
      ),
      total,
      currentPage: query.page,
      totalPages,
      limit: query.limit,
    };
  }

  async getQuestionById(
    actorUserId: string,
    questionId: string,
    options?: { includeAnswer?: boolean }
  ): Promise<QuestionResponseDTO> {
    const existing = await this.questionRepository.findById(questionId);
    if (!existing) {
      throw new QuestionDomainError(
        'QUESTION_NOT_FOUND',
        'Questão não encontrada.',
        404
      );
    }

    if (existing.userId !== actorUserId) {
      throw new QuestionDomainError(
        'QUESTION_FORBIDDEN',
        'Você não possui permissão para acessar esta questão.',
        403
      );
    }

    return this.applyAnswerKeyPolicy(
      existing,
      actorUserId,
      Boolean(options?.includeAnswer)
    );
  }

  async updateQuestion(
    actorUserId: string,
    questionId: string,
    rawInput: UpdateQuestionInput
  ): Promise<QuestionOwnerDetailDTO> {
    const existing = await this.questionRepository.findById(questionId);
    if (!existing) {
      throw new QuestionDomainError(
        'QUESTION_NOT_FOUND',
        'Questão não encontrada.',
        404
      );
    }

    if (existing.userId !== actorUserId) {
      throw new QuestionDomainError(
        'QUESTION_FORBIDDEN',
        'Você não possui permissão para alterar esta questão.',
        403
      );
    }

    const parsed = updateQuestionSchema.safeParse(rawInput);
    if (!parsed.success) {
      const firstIssue =
        parsed.error.issues[0]?.message ?? 'Dados de atualização da questão inválidos.';
      throw new QuestionDomainError('QUESTION_VALIDATION_ERROR', firstIssue, 400);
    }

    const data = parsed.data;

    // Verifica consistência cruzada entre o estado existente e os campos atualizados
    const effectiveAlternatives =
      data.alternatives !== undefined
        ? data.alternatives
        : existing.alternatives.map((a) => ({ letter: a.letter, text: a.text }));

    const effectiveCorrectAnswer =
      data.correctAnswer !== undefined ? data.correctAnswer : existing.correctAnswer;

    if (effectiveCorrectAnswer && effectiveAlternatives.length > 0) {
      const validLetters = new Set(effectiveAlternatives.map((a) => a.letter));
      if (!validLetters.has(effectiveCorrectAnswer)) {
        throw new QuestionDomainError(
          'QUESTION_VALIDATION_ERROR',
          `A resposta correta "${effectiveCorrectAnswer}" não existe nas alternativas da questão. Atualize ou limpe o gabarito antes de remover a alternativa correspondente.`,
          400
        );
      }
    }

    const updated = await this.questionRepository.updateAtomically(questionId, data);

    logger.info('question_updated', {
      questionId: updated.id,
      userId: actorUserId,
    });

    return toQuestionOwnerDetailDTO(updated);
  }

  async deleteQuestion(actorUserId: string, questionId: string): Promise<void> {
    const existing = await this.questionRepository.findById(questionId);
    if (!existing) {
      throw new QuestionDomainError(
        'QUESTION_NOT_FOUND',
        'Questão não encontrada.',
        404
      );
    }

    if (existing.userId !== actorUserId) {
      throw new QuestionDomainError(
        'QUESTION_FORBIDDEN',
        'Você não possui permissão para excluir esta questão.',
        403
      );
    }

    await this.questionRepository.deleteById(questionId);

    logger.info('question_deleted', {
      questionId,
      userId: actorUserId,
    });
  }
}
