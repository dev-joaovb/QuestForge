import { Router } from 'express';
import { createHealthRouter, type HealthCheckDependencies } from './health.routes.ts';
import { createAuthRouter, type AuthRouterDependencies } from './auth.routes.ts';

export interface ApiRouterDependencies {
  health?: HealthCheckDependencies;
  auth?: AuthRouterDependencies;
}

export function createApiRouter(deps?: ApiRouterDependencies): Router {
  const apiRouter = Router();

  apiRouter.use('/health', createHealthRouter(deps?.health));
  apiRouter.use('/auth', createAuthRouter(deps?.auth));

  // Catch-all para rotas de API inexistentes (/api/*) para nunca cair no fallback HTML do SPA
  apiRouter.use((_req, res) => {
    res.status(404).json({
      error: 'NotFound',
      message: 'Endpoint da API não encontrado.',
    });
  });

  return apiRouter;
}

export const apiRouter = createApiRouter();
