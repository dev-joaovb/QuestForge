import { Router } from 'express';
import { createHealthController, type HealthCheckDependencies } from '../controllers/health.controller.ts';

export type { HealthCheckDependencies };

export function createHealthRouter(deps?: HealthCheckDependencies): Router {
  const router = Router();
  router.get('/', createHealthController(deps));
  return router;
}

export const healthRouter = createHealthRouter();
