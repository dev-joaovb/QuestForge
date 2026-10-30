import type { Request, Response } from 'express';
import { DashboardService } from '../services/dashboard.service.ts';
import { DashboardDomainError } from '../types/dashboard.types.ts';
import { validateDashboardSummaryQuery } from '../validators/dashboard.validator.ts';
import { logger } from '../utils/logger.ts';

export interface DashboardControllerDependencies {
  dashboardService?: DashboardService;
}

/**
 * Controller HTTP para o Dashboard do QuestForge (Sprint 8.2).
 *
 * Responsabilidades e Regras de Segurança:
 * 1. A identidade do usuário autenticado é obtida exclusivamente de `req.user.id`.
 * 2. Parâmetros de query (como `userId` ou outros) são rejeitados estritamente pelo validador.
 * 3. Delega o processamento ao `DashboardService.getSummary` sem duplicar regras de agregação.
 * 4. Retorna HTTP 200 diretamente com o objeto consolidado `DashboardSummaryDTO`.
 * 5. Mapeia erros de domínio para seus status HTTP respectivos e converte erros inesperados
 *    em HTTP 503 sem vazamento de dados confidenciais ou stack traces.
 */
export function createDashboardController(deps: DashboardControllerDependencies = {}) {
  const dashboardService = deps.dashboardService ?? new DashboardService();

  return {
    /**
     * GET /api/dashboard/summary
     * Retorna o resumo executivo de métricas, evolução e histórico do usuário autenticado.
     */
    async getSummary(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      try {
        validateDashboardSummaryQuery(req.query);
        const summary = await dashboardService.getSummary(req.user.id);
        res.status(200).json(summary);
      } catch (error) {
        handleDashboardControllerError(error, req, res);
      }
    },
  };
}

/**
 * Converte erros de domínio e exceções inesperadas em respostas HTTP limpas e seguras.
 */
export function handleDashboardControllerError(
  error: unknown,
  req: Request,
  res: Response
): void {
  if (error instanceof DashboardDomainError) {
    res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }

  logger.error('dashboard_controller_unexpected_error', {
    method: req.method,
    path: req.originalUrl,
    errorName: error instanceof Error ? error.name : 'UnknownError',
    errorMessage: error instanceof Error ? error.message : String(error),
  });

  res.status(503).json({
    error: 'ServiceUnavailable',
    message: 'Não foi possível carregar os dados do dashboard no momento.',
  });
}
