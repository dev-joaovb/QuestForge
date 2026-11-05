import { Router } from 'express';
import {
  createEducationalAiController,
  type EducationalAiControllerDependencies,
} from '../controllers/educational-ai.controller.ts';
import { createRequireAuthMiddleware } from '../middlewares/auth.middleware.ts';
import {
  createEducationalAiRateLimiter,
  type EducationalAiRateLimitOptions,
} from '../middlewares/rate-limit.middleware.ts';
import type { AuthService } from '../services/auth.service.ts';
import type { RateLimitRequestHandler } from 'express-rate-limit';

export interface EducationalAiRouterDependencies
  extends EducationalAiControllerDependencies {
  authService?: AuthService;
  rateLimiter?: RateLimitRequestHandler;
  rateLimitOptions?: EducationalAiRateLimitOptions;
}

/**
 * Rotas HTTP do subsistema de IA Educacional (`/api/educational-ai`).
 *
 * Todas as rotas exigem autenticação obrigatória via `requireAuth` e rate limiter dedicado.
 */
export function createEducationalAiRouter(
  deps: EducationalAiRouterDependencies = {}
): Router {
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(deps.authService);
  const rateLimiter =
    deps.rateLimiter ?? createEducationalAiRateLimiter(deps.rateLimitOptions);
  const controller = createEducationalAiController({
    educationalAiService: deps.educationalAiService,
  });

  router.use(requireAuth);
  router.use(rateLimiter);

  // 1. Consulta de análise educacional consultiva e recomendações
  router.get('/analysis', controller.getAnalysis);

  return router;
}

export const educationalAiRouter = createEducationalAiRouter();
