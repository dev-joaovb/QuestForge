import type { Request, Response } from 'express';
import { z } from 'zod';
import { OfficialAnswerKeyService } from '../services/official-answer-key.service.ts';
import { OfficialAnswerKeyError } from '../types/official-answer-key.types.ts';
import { logger } from '../utils/logger.ts';

export interface OfficialAnswerKeyControllerDependencies {
  officialAnswerKeyService?: OfficialAnswerKeyService;
}

const getAnswerKeyQuerySchema = z
  .object({
    includeItems: z
      .enum(['true', 'false'])
      .optional()
      .default('false')
      .transform((v) => v === 'true'),
  })
  .strict();

/**
 * Controller HTTP para Gabaritos Oficiais (Sprint 5 — Etapa 5.2.5).
 *
 * Responsabilidades e Regras de Segurança:
 * 1. A identidade do usuário autenticado é obtida exclusivamente de `req.user.id`.
 *    Qualquer `userId` enviado no corpo ou query da requisição é descartado pelos schemas Zod estritos.
 * 2. Mapeia erros de domínio (`OfficialAnswerKeyError`) para códigos de status HTTP apropriados
 *    (400, 403, 404, 409, 422), sem vazar SQL, conexões ou detalhes internos do banco de dados.
 * 3. Falhas inesperadas resultam em HTTP 503 (ServiceUnavailable) com log estruturado seguro.
 * 4. Assegura que todas as operações mutáveis respeitem as regras de proteção CSRF configuradas no app.
 */
export function createOfficialAnswerKeyController(
  deps: OfficialAnswerKeyControllerDependencies = {}
) {
  const service = deps.officialAnswerKeyService ?? new OfficialAnswerKeyService();

  return {
    /**
     * POST /api/official-answer-keys
     * Cria um novo rascunho de gabarito oficial em estado DRAFT.
     */
    async createDraft(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      try {
        const created = await service.createDraft(req.user.id, req.body);
        res.status(201).json({ answerKey: created });
      } catch (error) {
        handleOfficialAnswerKeyControllerError(error, req, res);
      }
    },

    /**
     * GET /api/official-answer-keys/:id
     * Consulta um gabarito oficial por ID com isolamento estrito de proprietário.
     */
    async getById(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      const id = String(req.params.id ?? '').trim();
      if (!id) {
        res.status(400).json({
          error: 'ANSWER_KEY_INVALID_DATA',
          message: 'O identificador (id) é obrigatório.',
        });
        return;
      }

      const parsedQuery = getAnswerKeyQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        res.status(400).json({
          error: 'ANSWER_KEY_INVALID_DATA',
          message: 'Parâmetro includeItems inválido. Utilize true ou false.',
        });
        return;
      }

      try {
        const answerKey = parsedQuery.data.includeItems
          ? await service.findByIdWithItems(req.user.id, id)
          : await service.findById(req.user.id, id, { includeItems: false });

        res.status(200).json({ answerKey });
      } catch (error) {
        handleOfficialAnswerKeyControllerError(error, req, res);
      }
    },

    /**
     * GET /api/official-answer-keys/exams/:examId/current
     * Consulta o gabarito oficial vigente (isCurrent = true) de uma prova.
     */
    async getCurrentByExamId(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      const examId = String(req.params.examId ?? '').trim();
      if (!examId) {
        res.status(400).json({
          error: 'ANSWER_KEY_INVALID_DATA',
          message: 'O identificador da prova (examId) é obrigatório.',
        });
        return;
      }

      const parsedQuery = getAnswerKeyQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        res.status(400).json({
          error: 'ANSWER_KEY_INVALID_DATA',
          message: 'Parâmetro includeItems inválido. Utilize true ou false.',
        });
        return;
      }

      try {
        const answerKey = parsedQuery.data.includeItems
          ? await service.findCurrentByExamIdWithItems(req.user.id, examId)
          : await service.findCurrentByExamId(req.user.id, examId, { includeItems: false });

        res.status(200).json({ answerKey });
      } catch (error) {
        handleOfficialAnswerKeyControllerError(error, req, res);
      }
    },

    /**
     * GET /api/official-answer-keys/exams/:examId/versions
     * Consulta o histórico de versões de gabaritos oficiais de uma prova.
     */
    async getVersionsByExamId(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      const examId = String(req.params.examId ?? '').trim();
      if (!examId) {
        res.status(400).json({
          error: 'ANSWER_KEY_INVALID_DATA',
          message: 'O identificador da prova (examId) é obrigatório.',
        });
        return;
      }

      try {
        const versions = await service.findVersionsByExamId(
          req.user.id,
          examId,
          req.query
        );
        res.status(200).json({ versions });
      } catch (error) {
        handleOfficialAnswerKeyControllerError(error, req, res);
      }
    },

    /**
     * GET /api/official-answer-keys/:id/items
     * Consulta todos os itens pertencentes a um gabarito oficial com filtros opcionais.
     */
    async getItems(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      const id = String(req.params.id ?? '').trim();
      if (!id) {
        res.status(400).json({
          error: 'ANSWER_KEY_INVALID_DATA',
          message: 'O identificador (id) é obrigatório.',
        });
        return;
      }

      try {
        const items = await service.findItemsByAnswerKeyId(
          req.user.id,
          id,
          req.query
        );
        res.status(200).json({ items });
      } catch (error) {
        handleOfficialAnswerKeyControllerError(error, req, res);
      }
    },

    /**
     * GET /api/official-answer-keys/:id/items/:questionNumber
     * Consulta um item específico por número da questão.
     */
    async getItemByQuestionNumber(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      const id = String(req.params.id ?? '').trim();
      if (!id) {
        res.status(400).json({
          error: 'ANSWER_KEY_INVALID_DATA',
          message: 'O identificador (id) é obrigatório.',
        });
        return;
      }

      const questionNumber = Number(req.params.questionNumber);
      if (!Number.isInteger(questionNumber) || questionNumber < 1) {
        res.status(400).json({
          error: 'ANSWER_KEY_INVALID_DATA',
          message: 'O número da questão deve ser um número inteiro maior ou igual a 1.',
        });
        return;
      }

      try {
        const item = await service.findItemByQuestionNumber(
          req.user.id,
          id,
          questionNumber
        );
        res.status(200).json({ item });
      } catch (error) {
        handleOfficialAnswerKeyControllerError(error, req, res);
      }
    },

    /**
     * PATCH /api/official-answer-keys/:id
     * PUT /api/official-answer-keys/:id
     * Atualiza metadados e/ou substitui itens de um gabarito em estado DRAFT.
     */
    async updateDraft(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      const id = String(req.params.id ?? '').trim();
      if (!id) {
        res.status(400).json({
          error: 'ANSWER_KEY_INVALID_DATA',
          message: 'O identificador (id) é obrigatório.',
        });
        return;
      }

      try {
        const updated = await service.updateDraft(req.user.id, id, req.body);
        res.status(200).json({ answerKey: updated });
      } catch (error) {
        handleOfficialAnswerKeyControllerError(error, req, res);
      }
    },

    /**
     * POST /api/official-answer-keys/:id/items
     * Adiciona um novo item individual a um rascunho de gabarito.
     */
    async addItem(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      const id = String(req.params.id ?? '').trim();
      if (!id) {
        res.status(400).json({
          error: 'ANSWER_KEY_INVALID_DATA',
          message: 'O identificador (id) é obrigatório.',
        });
        return;
      }

      try {
        const item = await service.addDraftItem(req.user.id, id, req.body);
        res.status(201).json({ item });
      } catch (error) {
        handleOfficialAnswerKeyControllerError(error, req, res);
      }
    },

    /**
     * PATCH /api/official-answer-keys/:id/items/:questionNumber
     * PUT /api/official-answer-keys/:id/items/:questionNumber
     * Atualiza um item individual pertencente a um rascunho de gabarito.
     */
    async updateItem(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      const id = String(req.params.id ?? '').trim();
      if (!id) {
        res.status(400).json({
          error: 'ANSWER_KEY_INVALID_DATA',
          message: 'O identificador (id) é obrigatório.',
        });
        return;
      }

      const questionNumber = Number(req.params.questionNumber);
      if (!Number.isInteger(questionNumber) || questionNumber < 1) {
        res.status(400).json({
          error: 'ANSWER_KEY_INVALID_DATA',
          message: 'O número da questão deve ser um número inteiro maior ou igual a 1.',
        });
        return;
      }

      try {
        const item = await service.updateDraftItem(
          req.user.id,
          id,
          questionNumber,
          req.body
        );
        res.status(200).json({ item });
      } catch (error) {
        handleOfficialAnswerKeyControllerError(error, req, res);
      }
    },

    /**
     * PUT /api/official-answer-keys/:id/items
     * Substitui atomicamente todos os itens de um rascunho de gabarito.
     */
    async replaceItems(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      const id = String(req.params.id ?? '').trim();
      if (!id) {
        res.status(400).json({
          error: 'ANSWER_KEY_INVALID_DATA',
          message: 'O identificador (id) é obrigatório.',
        });
        return;
      }

      try {
        const items = await service.replaceDraftItems(req.user.id, id, req.body);
        res.status(200).json({ items });
      } catch (error) {
        handleOfficialAnswerKeyControllerError(error, req, res);
      }
    },

    /**
     * DELETE /api/official-answer-keys/:id
     * Exclui atomicamente um rascunho de gabarito oficial.
     */
    async deleteDraft(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      const id = String(req.params.id ?? '').trim();
      if (!id) {
        res.status(400).json({
          error: 'ANSWER_KEY_INVALID_DATA',
          message: 'O identificador (id) é obrigatório.',
        });
        return;
      }

      try {
        await service.deleteDraft(req.user.id, id);
        res.status(200).json({
          message: 'Rascunho de gabarito oficial excluído com sucesso.',
        });
      } catch (error) {
        handleOfficialAnswerKeyControllerError(error, req, res);
      }
    },

    /**
     * POST /api/official-answer-keys/:id/publish
     * Publica atomicamente um gabarito oficial tornando-o vigente.
     */
    async publish(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      const id = String(req.params.id ?? '').trim();
      if (!id) {
        res.status(400).json({
          error: 'ANSWER_KEY_INVALID_DATA',
          message: 'O identificador (id) é obrigatório.',
        });
        return;
      }

      try {
        const published = await service.publishAnswerKey(
          req.user.id,
          id,
          req.body
        );
        res.status(200).json({ answerKey: published });
      } catch (error) {
        handleOfficialAnswerKeyControllerError(error, req, res);
      }
    },
  };
}

/**
 * Converte erros de domínio e exceções não tratadas em respostas HTTP limpas e seguras.
 */
export function handleOfficialAnswerKeyControllerError(
  error: unknown,
  req: Request,
  res: Response
): void {
  if (error instanceof OfficialAnswerKeyError) {
    res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
    });
    return;
  }

  logger.error('official_answer_key_controller_unexpected_error', {
    method: req.method,
    path: req.originalUrl,
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });

  res.status(503).json({
    error: 'ServiceUnavailable',
    message: 'Não foi possível processar a operação em gabaritos oficiais no momento.',
  });
}
