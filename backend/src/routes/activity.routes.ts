import { Router } from 'express';
import {
  createStudyActivityController,
  type StudyActivityControllerDependencies,
} from '../controllers/study-activity.controller.ts';
import { createRequireAuthMiddleware } from '../middlewares/auth.middleware.ts';
import type { AuthService } from '../services/auth.service.ts';

export interface StudyActivityRouterDependencies
  extends StudyActivityControllerDependencies {
  authService?: AuthService;
}

/**
 * Rotas HTTP de Atividades de Estudo e Streak (`/api/activities`).
 * Todas as rotas exigem autenticação válida via `requireAuth`.
 */
export function createStudyActivityRouter(
  deps: StudyActivityRouterDependencies = {}
): Router {
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(deps.authService);
  const controller = createStudyActivityController({
    studyActivityService: deps.studyActivityService,
    streakService: deps.streakService,
  });

  router.use(requireAuth);

  // 1. Consulta do streak do estudante
  router.get('/streak', controller.getStreak);

  // 2. Consulta paginada do histórico de atividades
  router.get('/', controller.list);

  return router;
}

export const studyActivityRouter = createStudyActivityRouter();
