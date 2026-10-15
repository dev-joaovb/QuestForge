import type {
  OfficialAnswerKey,
  OfficialAnswerKeyItem,
} from '@prisma/client';
import {
  OfficialAnswerKeyError,
  type FindAnswerKeyItemsOptions,
  type FindAnswerKeyOptions,
  type FindAnswerKeyVersionsOptions,
  type OfficialAnswerKeyWithItems,
} from '../types/official-answer-key.types.ts';
import {
  PrismaOfficialAnswerKeyRepository,
  type IOfficialAnswerKeyRepository,
} from '../repositories/official-answer-key.repository.ts';
import { OfficialAnswerKeyValidatorService } from './official-answer-key-validator.service.ts';
import {
  validateCreateOfficialAnswerKeyDraft,
  validateCreateOfficialAnswerKeyItem,
  validateListAnswerKeyItemsQuery,
  validateListAnswerKeyVersionsQuery,
  validatePublishOfficialAnswerKey,
  validateReplaceOfficialAnswerKeyItems,
  validateUpdateOfficialAnswerKeyDraft,
  validateUpdateOfficialAnswerKeyItem,
} from '../validators/official-answer-key.validator.ts';
import { logger } from '../utils/logger.ts';

export interface OfficialAnswerKeyServiceDependencies {
  officialAnswerKeyRepository?: IOfficialAnswerKeyRepository;
  officialAnswerKeyValidatorService?: OfficialAnswerKeyValidatorService;
}

/**
 * Serviço de Domínio de Gabaritos Oficiais (Sprint 5 — Etapa 5.2.4).
 *
 * Responsabilidades e Regras de Segurança:
 * 1. Isolamento multiusuário estrito: todas as operações exigem `actorUserId` fornecido pela sessão autenticada.
 *    Nunca aceita identidade de usuário vinda de corpos de requisição externos.
 * 2. Validação cruzada de titularidade: utiliza `OfficialAnswerKeyValidatorService` para validar
 *    pertinência de prova (`Exam`), documento PDF (`PdfDocument`) e questões (`Question`).
 * 3. Validação de dados de entrada: valida e sanitiza payloads utilizando schemas Zod estritos (.strict()).
 * 4. Imutabilidade de gabaritos publicados: mutações (edição, inclusão, substituição, exclusão) só são
 *    permitidas em gabaritos no estado DRAFT pertencentes ao usuário autenticado.
 * 5. Consistência combinada de anulações: ao atualizar um item, valida a composição entre os valores já
 *    persistidos e os campos parciais recebidos (`status` e `isAnnulled`).
 * 6. Publicação atômica e vigência única: orquestra a publicação atômica, desativando a versão anterior
 *    na mesma transação para cumprir o índice único parcial de gabarito vigente por prova.
 * 7. Integridade de itens na publicação: bloqueia publicação se houver itens com pendência de revisão
 *    (`NEEDS_REVIEW`) ou sem resposta correta definida (salvo quando anulados).
 * 8. Proteção do banco de questões: não altera `Question.correctAnswer` nem associa questões avulsas a provas
 *    como efeito colateral.
 */
export class OfficialAnswerKeyService {
  private readonly repository: IOfficialAnswerKeyRepository;
  private readonly validatorService: OfficialAnswerKeyValidatorService;

  constructor(deps: OfficialAnswerKeyServiceDependencies = {}) {
    this.repository =
      deps.officialAnswerKeyRepository ?? new PrismaOfficialAnswerKeyRepository();
    this.validatorService =
      deps.officialAnswerKeyValidatorService ?? new OfficialAnswerKeyValidatorService();
  }

  private assertValidActorUserId(actorUserId: string): string {
    if (!actorUserId || typeof actorUserId !== 'string' || actorUserId.trim() === '') {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_FORBIDDEN',
        'Usuário autenticado obrigatório para executar operações em gabaritos oficiais.',
        403
      );
    }
    return actorUserId.trim();
  }

  private assertValidId(id: string, entityName: string): string {
    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_INVALID_DATA',
        `O identificador (${entityName}) é obrigatório.`,
        400
      );
    }
    return id.trim();
  }

  /**
   * Cria um novo rascunho de gabarito oficial (`status = DRAFT`, `isCurrent = false`).
   */
  async createDraft(
    actorUserId: string,
    rawInput: unknown
  ): Promise<OfficialAnswerKeyWithItems> {
    const validUserId = this.assertValidActorUserId(actorUserId);
    const parsed = validateCreateOfficialAnswerKeyDraft(rawInput);

    // Validação cruzada de titularidade de entidades relacionadas
    await this.validatorService.validateDraftCreation({
      actorUserId: validUserId,
      examId: parsed.examId,
      pdfDocumentId: parsed.pdfDocumentId,
      items: parsed.items,
    });

    const created = await this.repository.createDraft({
      userId: validUserId,
      examId: parsed.examId,
      pdfDocumentId: parsed.pdfDocumentId,
      type: parsed.type,
      version: parsed.version,
      publicationDate: parsed.publicationDate,
      notes: parsed.notes,
      items: parsed.items,
    });

    logger.info('official_answer_key_draft_created', {
      answerKeyId: created.id,
      userId: validUserId,
      examId: created.examId,
      itemsCount: created.items.length,
      type: created.type,
      version: created.version,
    });

    return created;
  }

  /**
   * Consulta um gabarito oficial por ID com isolamento obrigatório de usuário.
   */
  async findById(
    actorUserId: string,
    id: string,
    options?: FindAnswerKeyOptions
  ): Promise<OfficialAnswerKey & { items?: OfficialAnswerKeyItem[] }> {
    const validUserId = this.assertValidActorUserId(actorUserId);
    const validId = this.assertValidId(id, 'id');

    const entity = await this.repository.findById(validId, validUserId, options);

    if (!entity) {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_NOT_FOUND',
        'Gabarito oficial não encontrado.',
        404
      );
    }

    return entity;
  }

  /**
   * Consulta um gabarito oficial por ID com garantia de inclusão dos itens.
   */
  async findByIdWithItems(
    actorUserId: string,
    id: string
  ): Promise<OfficialAnswerKeyWithItems> {
    const validUserId = this.assertValidActorUserId(actorUserId);
    const validId = this.assertValidId(id, 'id');

    const entity = await this.repository.findByIdWithItems(validId, validUserId);

    if (!entity) {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_NOT_FOUND',
        'Gabarito oficial não encontrado.',
        404
      );
    }

    return entity;
  }

  /**
   * Consulta o gabarito oficial vigente (`isCurrent = true`) de uma prova.
   */
  async findCurrentByExamId(
    actorUserId: string,
    examId: string,
    options?: FindAnswerKeyOptions
  ): Promise<(OfficialAnswerKey & { items?: OfficialAnswerKeyItem[] }) | null> {
    const validUserId = this.assertValidActorUserId(actorUserId);
    const validExamId = this.assertValidId(examId, 'examId');

    // Valida titularidade da prova antes da consulta
    await this.validatorService.validateExamOwnership(validUserId, validExamId);

    return this.repository.findCurrentByExamId(validExamId, validUserId, options);
  }

  /**
   * Consulta o gabarito oficial vigente de uma prova incluindo seus itens.
   */
  async findCurrentByExamIdWithItems(
    actorUserId: string,
    examId: string
  ): Promise<OfficialAnswerKeyWithItems | null> {
    const validUserId = this.assertValidActorUserId(actorUserId);
    const validExamId = this.assertValidId(examId, 'examId');

    await this.validatorService.validateExamOwnership(validUserId, validExamId);

    return this.repository.findCurrentByExamIdWithItems(validExamId, validUserId);
  }

  /**
   * Consulta o histórico de versões de gabaritos oficiais de uma prova.
   */
  async findVersionsByExamId(
    actorUserId: string,
    examId: string,
    rawQuery?: unknown
  ): Promise<OfficialAnswerKey[]> {
    const validUserId = this.assertValidActorUserId(actorUserId);
    const validExamId = this.assertValidId(examId, 'examId');

    await this.validatorService.validateExamOwnership(validUserId, validExamId);

    const parsedQuery = rawQuery ? validateListAnswerKeyVersionsQuery(rawQuery) : {};

    return this.repository.findVersionsByExamId(validExamId, validUserId, parsedQuery);
  }

  /**
   * Consulta os itens de um gabarito oficial com isolamento de usuário.
   */
  async findItemsByAnswerKeyId(
    actorUserId: string,
    answerKeyId: string,
    rawQuery?: unknown
  ): Promise<OfficialAnswerKeyItem[]> {
    const validUserId = this.assertValidActorUserId(actorUserId);
    const validAnswerKeyId = this.assertValidId(answerKeyId, 'answerKeyId');

    // Valida se o gabarito pai existe e pertence ao usuário autenticado
    const parent = await this.repository.findById(validAnswerKeyId, validUserId);
    if (!parent) {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_NOT_FOUND',
        'Gabarito oficial não encontrado.',
        404
      );
    }

    const parsedQuery = rawQuery ? validateListAnswerKeyItemsQuery(rawQuery) : {};

    return this.repository.findItemsByAnswerKeyId(validAnswerKeyId, validUserId, parsedQuery);
  }

  /**
   * Consulta um item específico por número de questão dentro de um gabarito oficial.
   */
  async findItemByQuestionNumber(
    actorUserId: string,
    answerKeyId: string,
    questionNumber: number
  ): Promise<OfficialAnswerKeyItem> {
    const validUserId = this.assertValidActorUserId(actorUserId);
    const validAnswerKeyId = this.assertValidId(answerKeyId, 'answerKeyId');

    if (!Number.isInteger(questionNumber) || questionNumber < 1) {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_INVALID_DATA',
        'O número da questão deve ser um número inteiro maior ou igual a 1.',
        400
      );
    }

    const parent = await this.repository.findById(validAnswerKeyId, validUserId);
    if (!parent) {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_NOT_FOUND',
        'Gabarito oficial não encontrado.',
        404
      );
    }

    const item = await this.repository.findItemByQuestionNumber(
      validAnswerKeyId,
      questionNumber,
      validUserId
    );

    if (!item) {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_ITEM_NOT_FOUND',
        `Item da questão ${questionNumber} não encontrado no gabarito oficial.`,
        404
      );
    }

    return item;
  }

  /**
   * Atualiza metadados e/ou substitui os itens de um gabarito em estado DRAFT.
   */
  async updateDraft(
    actorUserId: string,
    id: string,
    rawInput: unknown
  ): Promise<OfficialAnswerKeyWithItems> {
    const validUserId = this.assertValidActorUserId(actorUserId);
    const validId = this.assertValidId(id, 'id');
    const parsed = validateUpdateOfficialAnswerKeyDraft(rawInput);

    // Verifica existência e estado do gabarito pai
    const existing = await this.repository.findByIdWithItems(validId, validUserId);
    if (!existing) {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_NOT_FOUND',
        'Gabarito oficial não encontrado.',
        404
      );
    }

    if (existing.status !== 'DRAFT') {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_NOT_DRAFT',
        `Apenas gabaritos em estado DRAFT podem ser editados. Status atual: ${existing.status}`,
        422
      );
    }

    // Se estiver atualizando documento PDF ou itens, valida titularidade relacional
    if (parsed.pdfDocumentId !== undefined || parsed.items !== undefined) {
      await this.validatorService.validateDraftUpdate({
        actorUserId: validUserId,
        examId: existing.examId,
        pdfDocumentId:
          parsed.pdfDocumentId !== undefined ? parsed.pdfDocumentId : existing.pdfDocumentId,
        items: parsed.items,
      });
    }

    const updated = await this.repository.updateDraft(validId, validUserId, parsed);

    logger.info('official_answer_key_draft_updated', {
      answerKeyId: validId,
      userId: validUserId,
    });

    return updated;
  }

  /**
   * Adiciona um novo item individual a um rascunho de gabarito.
   */
  async addDraftItem(
    actorUserId: string,
    answerKeyId: string,
    rawInput: unknown
  ): Promise<OfficialAnswerKeyItem> {
    const validUserId = this.assertValidActorUserId(actorUserId);
    const validAnswerKeyId = this.assertValidId(answerKeyId, 'answerKeyId');
    const parsed = validateCreateOfficialAnswerKeyItem(rawInput);

    const existing = await this.repository.findByIdWithItems(validAnswerKeyId, validUserId);
    if (!existing) {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_NOT_FOUND',
        'Gabarito oficial não encontrado.',
        404
      );
    }

    if (existing.status !== 'DRAFT') {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_NOT_DRAFT',
        `Apenas gabaritos em estado DRAFT podem receber novos itens. Status atual: ${existing.status}`,
        422
      );
    }

    // Valida duplicidade de número de questão em memória antes de persistir
    if (existing.items?.some((i) => i.questionNumber === parsed.questionNumber)) {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_DUPLICATE_ITEM',
        `Já existe um item com o número de questão ${parsed.questionNumber} neste gabarito oficial.`,
        422
      );
    }

    // Valida titularidade da questão referenciada e duplicidade de questionId
    if (parsed.questionId) {
      await this.validatorService.validateDraftItemUpdate({
        actorUserId: validUserId,
        examId: existing.examId,
        questionId: parsed.questionId,
      });

      if (existing.items?.some((i) => i.questionId === parsed.questionId)) {
        throw new OfficialAnswerKeyError(
          'ANSWER_KEY_DUPLICATE_ITEM',
          `Questão vinculada em duplicidade no mesmo gabarito: questão ${parsed.questionId}.`,
          422
        );
      }
    }

    const createdItem = await this.repository.addDraftItem(
      validAnswerKeyId,
      validUserId,
      parsed
    );

    logger.info('official_answer_key_draft_item_added', {
      answerKeyId: validAnswerKeyId,
      questionNumber: createdItem.questionNumber,
      userId: validUserId,
    });

    return createdItem;
  }

  /**
   * Atualiza um item individual pertencente a um gabarito em estado DRAFT.
   *
   * Aplica estritamente a Regra 6: valida o estado final combinado entre os valores já
   * existentes no banco e os novos valores parciais de `status` e `isAnnulled`.
   */
  async updateDraftItem(
    actorUserId: string,
    answerKeyId: string,
    questionNumber: number,
    rawInput: unknown
  ): Promise<OfficialAnswerKeyItem> {
    const validUserId = this.assertValidActorUserId(actorUserId);
    const validAnswerKeyId = this.assertValidId(answerKeyId, 'answerKeyId');

    if (!Number.isInteger(questionNumber) || questionNumber < 1) {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_INVALID_DATA',
        'O número da questão deve ser um número inteiro maior ou igual a 1.',
        400
      );
    }

    const parsed = validateUpdateOfficialAnswerKeyItem(rawInput);

    const existing = await this.repository.findByIdWithItems(validAnswerKeyId, validUserId);
    if (!existing) {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_NOT_FOUND',
        'Gabarito oficial não encontrado.',
        404
      );
    }

    if (existing.status !== 'DRAFT') {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_NOT_DRAFT',
        `Apenas itens de gabaritos em estado DRAFT podem ser modificados. Status atual: ${existing.status}`,
        422
      );
    }

    const existingItem = existing.items?.find((i) => i.questionNumber === questionNumber);
    if (!existingItem) {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_ITEM_NOT_FOUND',
        `Item da questão ${questionNumber} não encontrado no gabarito oficial.`,
        404
      );
    }

    // Regra 6: Validação do estado final combinado de status e isAnnulled
    const finalStatus = parsed.status !== undefined ? parsed.status : existingItem.status;
    const finalIsAnnulled =
      parsed.isAnnulled !== undefined ? parsed.isAnnulled : existingItem.isAnnulled;

    if (finalStatus === 'ANNULLED' && !finalIsAnnulled) {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_INVALID_DATA',
        'Itens com status ANNULLED devem possuir isAnnulled como true.',
        400
      );
    }

    if (finalIsAnnulled && finalStatus !== 'ANNULLED') {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_INVALID_DATA',
        'Itens com isAnnulled true devem possuir status ANNULLED.',
        400
      );
    }

    // Valida titularidade da nova questão (se alterada) e unicidade no gabarito
    if (parsed.questionId !== undefined && parsed.questionId !== null) {
      await this.validatorService.validateDraftItemUpdate({
        actorUserId: validUserId,
        examId: existing.examId,
        questionId: parsed.questionId,
      });

      const hasDuplicateQuestion = existing.items?.some(
        (i) => i.questionNumber !== questionNumber && i.questionId === parsed.questionId
      );

      if (hasDuplicateQuestion) {
        throw new OfficialAnswerKeyError(
          'ANSWER_KEY_DUPLICATE_ITEM',
          `Questão vinculada em duplicidade no mesmo gabarito: questão ${parsed.questionId}.`,
          422
        );
      }
    }

    const updatedItem = await this.repository.updateDraftItem(
      validAnswerKeyId,
      questionNumber,
      validUserId,
      parsed
    );

    logger.info('official_answer_key_draft_item_updated', {
      answerKeyId: validAnswerKeyId,
      questionNumber,
      userId: validUserId,
    });

    return updatedItem;
  }

  /**
   * Substitui atomicamente todos os itens de um rascunho de gabarito.
   */
  async replaceDraftItems(
    actorUserId: string,
    answerKeyId: string,
    rawInput: unknown
  ): Promise<OfficialAnswerKeyItem[]> {
    const validUserId = this.assertValidActorUserId(actorUserId);
    const validAnswerKeyId = this.assertValidId(answerKeyId, 'answerKeyId');
    const parsed = validateReplaceOfficialAnswerKeyItems(rawInput);

    const existing = await this.repository.findById(validAnswerKeyId, validUserId);
    if (!existing) {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_NOT_FOUND',
        'Gabarito oficial não encontrado.',
        404
      );
    }

    if (existing.status !== 'DRAFT') {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_NOT_DRAFT',
        `Apenas itens de gabaritos em estado DRAFT podem ser substituídos. Status atual: ${existing.status}`,
        422
      );
    }

    // Valida todas as questões dos novos itens com a prova
    await this.validatorService.validateQuestionsOwnership(
      validUserId,
      existing.examId,
      parsed.items
    );

    const replaced = await this.repository.replaceDraftItems(
      validAnswerKeyId,
      validUserId,
      parsed.items
    );

    logger.info('official_answer_key_draft_items_replaced', {
      answerKeyId: validAnswerKeyId,
      userId: validUserId,
      itemsCount: replaced.length,
    });

    return replaced;
  }

  /**
   * Exclui atomicamente um rascunho de gabarito oficial.
   */
  async deleteDraft(actorUserId: string, id: string): Promise<void> {
    const validUserId = this.assertValidActorUserId(actorUserId);
    const validId = this.assertValidId(id, 'id');

    const existing = await this.repository.findById(validId, validUserId);
    if (!existing) {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_NOT_FOUND',
        'Gabarito oficial não encontrado.',
        404
      );
    }

    if (existing.status !== 'DRAFT') {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_NOT_DRAFT',
        `Apenas gabaritos em estado DRAFT podem ser excluídos. Status atual: ${existing.status}`,
        422
      );
    }

    await this.repository.deleteDraft(validId, validUserId);

    logger.info('official_answer_key_draft_deleted', {
      answerKeyId: validId,
      userId: validUserId,
    });
  }

  /**
   * Publica atomicamente um gabarito oficial, tornando-o vigente (`isCurrent = true`)
   * e arquivando/desativando a versão anterior da mesma prova em transação PostgreSQL.
   */
  async publishAnswerKey(
    actorUserId: string,
    id: string,
    rawInput?: unknown
  ): Promise<OfficialAnswerKeyWithItems> {
    const validUserId = this.assertValidActorUserId(actorUserId);
    const validId = this.assertValidId(id, 'id');
    const parsed = validatePublishOfficialAnswerKey(rawInput ?? {});

    const existing = await this.repository.findByIdWithItems(validId, validUserId);
    if (!existing) {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_NOT_FOUND',
        'Gabarito oficial não encontrado.',
        404
      );
    }

    if (existing.status !== 'DRAFT') {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_NOT_DRAFT',
        `Apenas gabaritos em estado DRAFT podem ser publicados. Status atual: ${existing.status}`,
        422
      );
    }

    // Regras de publicação e integridade dos itens
    if (!existing.items || existing.items.length === 0) {
      throw new OfficialAnswerKeyError(
        'ANSWER_KEY_INVALID_DATA',
        'Não é possível publicar um gabarito oficial sem itens cadastrados.',
        400
      );
    }

    for (const item of existing.items) {
      // 1. Não permite publicar itens pendentes de revisão humana
      if (item.status === 'NEEDS_REVIEW') {
        throw new OfficialAnswerKeyError(
          'ANSWER_KEY_INVALID_DATA',
          `Não é possível publicar o gabarito com itens pendentes de revisão humana (questão ${item.questionNumber}).`,
          400
        );
      }

      // 2. Não permite itens não anulados sem resposta correta
      if (!item.isAnnulled && item.status !== 'ANNULLED') {
        if (!item.correctAnswer || item.correctAnswer.trim() === '') {
          throw new OfficialAnswerKeyError(
            'ANSWER_KEY_INVALID_DATA',
            `Item da questão ${item.questionNumber} não possui resposta correta definida.`,
            400
          );
        }
      }

      // 3. Consistência estrita de anulação
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

    // Publica atomicamente no repositório gerenciando a vigência transacional no PostgreSQL
    const published = await this.repository.publishDraft(
      validId,
      validUserId,
      parsed.publicationDate
    );

    logger.info('official_answer_key_published', {
      answerKeyId: validId,
      userId: validUserId,
      examId: published.examId,
      version: published.version,
      type: published.type,
      itemsCount: published.items.length,
    });

    return published;
  }
}
