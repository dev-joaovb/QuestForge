import type { Request, Response } from 'express';
import { z } from 'zod';
import { QuestionService } from '../services/question.service.ts';
import { QuestionDomainError } from '../types/question.types.ts';
import type { ListQuestionsQueryInput } from '../validators/question.validator.ts';
import { logger } from '../utils/logger.ts';

export interface QuestionControllerDependencies {
  questionService?: QuestionService;
}

const getQuestionQuerySchema = z.object({
  includeAnswer: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
});

/**
 * Controller HTTP para o Banco de Questões (Sprint 2 — Etapa 2.2):
 * - GET /api/questions
 * - GET /api/questions/:id
 * - POST /api/questions
 * - PUT /api/questions/:id
 * - DELETE /api/questions/:id
 *
 * A identidade do usuário vem exclusivamente de `req.user.id` (sessão validada).
 * Qualquer `userId` enviado no corpo da requisição é ignorado/descartado pelo schema.
 */
export function createQuestionController(deps: QuestionControllerDependencies = {}) {
  const questionService = deps.questionService ?? new QuestionService();

  return {
    async list(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      try {
        const result = await questionService.listQuestions(
          req.user.id,
          req.query as unknown as ListQuestionsQueryInput
        );
        res.status(200).json(result);
      } catch (error) {
        handleQuestionControllerError(error, req, res);
      }
    },

    async getById(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      const questionId = String(req.params.id ?? '').trim();
      if (!questionId) {
        res.status(400).json({
          error: 'QUESTION_VALIDATION_ERROR',
          message: 'Identificador da questão é obrigatório.',
        });
        return;
      }

      const parsedQuery = getQuestionQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        res.status(400).json({
          error: 'QUESTION_VALIDATION_ERROR',
          message: 'Parâmetro includeAnswer inválido. Utilize true ou false.',
        });
        return;
      }

      try {
        const question = await questionService.getQuestionById(req.user.id, questionId, {
          includeAnswer: parsedQuery.data.includeAnswer,
        });
        res.status(200).json({ question });
      } catch (error) {
        handleQuestionControllerError(error, req, res);
      }
    },

    async create(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      try {
        const question = await questionService.createQuestion(req.user.id, req.body);
        res.status(201).json({ question });
      } catch (error) {
        handleQuestionControllerError(error, req, res);
      }
    },

    async update(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      const questionId = String(req.params.id ?? '').trim();
      if (!questionId) {
        res.status(400).json({
          error: 'QUESTION_VALIDATION_ERROR',
          message: 'Identificador da questão é obrigatório.',
        });
        return;
      }

      try {
        const question = await questionService.updateQuestion(
          req.user.id,
          questionId,
          req.body
        );
        res.status(200).json({ question });
      } catch (error) {
        handleQuestionControllerError(error, req, res);
      }
    },

    async remove(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      const questionId = String(req.params.id ?? '').trim();
      if (!questionId) {
        res.status(400).json({
          error: 'QUESTION_VALIDATION_ERROR',
          message: 'Identificador da questão é obrigatório.',
        });
        return;
      }

      try {
        await questionService.deleteQuestion(req.user.id, questionId);
        res.status(200).json({
          message: 'Questão excluída com sucesso.',
        });
      } catch (error) {
        handleQuestionControllerError(error, req, res);
      }
    },
  };
}

function handleQuestionControllerError(
  error: unknown,
  req: Request,
  res: Response
): void {
  if (error instanceof QuestionDomainError) {
    res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
    });
    return;
  }

  logger.error('question_controller_unexpected_error', {
    method: req.method,
    path: req.originalUrl,
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });

  res.status(503).json({
    error: 'ServiceUnavailable',
    message: 'Não foi possível processar a operação no banco de questões no momento.',
  });
}
