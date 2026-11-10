import { Router } from 'express';
import {
  createHealthController,
  createReadyController,
  createLiveController,
  type HealthCheckDependencies,
  type StorageHealthStatus,
  type AiHealthStatus,
  type OcrHealthStatus,
} from '../controllers/health.controller.ts';

export type {
  HealthCheckDependencies,
  StorageHealthStatus,
  AiHealthStatus,
  OcrHealthStatus,
};

export function createHealthRouter(deps?: HealthCheckDependencies): Router {
  const router = Router();
  router.get('/', createHealthController(deps));
  router.get('/live', createLiveController());
  router.get('/ready', createReadyController(deps));
  return router;
}

export const healthRouter = createHealthRouter();
