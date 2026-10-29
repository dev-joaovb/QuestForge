import type { Request, Response } from 'express';
import { StudyActivityService } from '../services/study-activity.service.ts';
import { StreakService } from '../services/streak.service.ts';
import { StudyActivityDomainError } from '../types/activity.types.ts';
import { validateListActivitiesQuery } from '../validators/activity.validator.ts';
import { logger } from '../utils/logger.ts';

export interface StudyActivityControllerDependencies {
  studyActivityService?: StudyActivityService;
  streakService?: StreakService;
}

/**
 * Controller HTTP para Histórico de Atividades de Estudo e Streak (Sprint 7.2).
 *
 * Responsabilidades e Regras de Segurança:
 * 1. A identidade do usuário autenticado é obtida exclusivamente de `req.user.id`.
 *    Parâmetros arbitrários enviados pelo cliente são rejeitados pelo schema Zod strict.
 * 2. Mapeia erros de domínio (`StudyActivityDomainError`) para códigos HTTP adequados (400, 401, 404, 409).
 * 3. Falhas inesperadas resultam em HTTP 503 com log estruturado seguro.
 */
export function createStudyActivityController(deps: StudyActivityControllerDependencies = {}) {
  const studyActivityService = deps.studyActivityService ?? new StudyActivityService();
  const streakService = deps.streakService ?? new StreakService();

  return {
    /**
     * GET /api/activities/streak
     * Retorna os dados de streak do usuário autenticado.
     * Se o usuário ainda não tiver atividades, retorna zeros estruturados com HTTP 200.
     */
    async getStreak(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      try {
        const streak = await streakService.getUserStreak(req.user.id);
        res.status(200).json({ streak });
      } catch (error) {
        handleStudyActivityControllerError(error, req, res);
      }
    },

    /**
     * GET /api/activities
     * Retorna a listagem paginada e contagem total do histórico de atividades do usuário autenticado.
     */
    async list(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      try {
        const options = validateListActivitiesQuery(req.query);
        const result = await studyActivityService.listUserActivities(req.user.id, options);

        res.status(200).json({
          activities: result.activities,
          total: result.total,
          limit: result.limit,
          offset: result.offset,
        });
      } catch (error) {
        handleStudyActivityControllerError(error, req, res);
      }
    },
  };
}

/**
 * Converte erros de domínio e exceções não tratadas em respostas HTTP limpas e seguras.
 */
export function handleStudyActivityControllerError(
  error: unknown,
  req: Request,
  res: Response
): void {
  if (error instanceof StudyActivityDomainError) {
    res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }

  logger.error('study_activity_controller_unexpected_error', {
    method: req.method,
    path: req.originalUrl,
    errorName: error instanceof Error ? error.name : 'UnknownError',
    errorMessage: error instanceof Error ? error.message : String(error),
  });

  res.status(503).json({
    error: 'ServiceUnavailable',
    message: 'Não foi possível processar a operação de atividades no momento.',
  });
}
