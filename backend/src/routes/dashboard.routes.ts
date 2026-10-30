import { Router } from 'express';
import {
  createDashboardController,
  type DashboardControllerDependencies,
} from '../controllers/dashboard.controller.ts';
import { createRequireAuthMiddleware } from '../middlewares/auth.middleware.ts';
import type { AuthService } from '../services/auth.service.ts';

export interface DashboardRouterDependencies
  extends DashboardControllerDependencies {
  authService?: AuthService;
}

/**
 * Rotas HTTP do Dashboard (`/api/dashboard`).
 * Todas as rotas exigem sessão válida via `requireAuth`.
 */
export function createDashboardRouter(
  deps: DashboardRouterDependencies = {}
): Router {
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(deps.authService);
  const controller = createDashboardController({
    dashboardService: deps.dashboardService,
  });

  router.use(requireAuth);

  // 1. Resumo executivo consolidado
  router.get('/summary', controller.getSummary);

  return router;
}

export const dashboardRouter = createDashboardRouter();
