import { Router } from 'express';
import {
  createSimulationController,
  type SimulationControllerDependencies,
} from '../controllers/simulation.controller.ts';
import { createRequireAuthMiddleware } from '../middlewares/auth.middleware.ts';
import type { AuthService } from '../services/auth.service.ts';

export interface SimulationRouterDependencies
  extends SimulationControllerDependencies {
  authService?: AuthService;
}

/**
 * Rotas HTTP do Motor de Simulados (`/api/simulations`).
 *
 * Todas as rotas exigem sessão válida via `requireAuth`.
 * Operações mutáveis (`POST`, `PUT`, `PATCH`, `DELETE`) são protegidas pelo middleware
 * global de CSRF registrado em `/api` no `backend/src/app.ts`.
 */
export function createSimulationRouter(
  deps: SimulationRouterDependencies = {}
): Router {
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(deps.authService);
  const controller = createSimulationController({
    simulationService: deps.simulationService,
  });

  router.use(requireAuth);

  // 1. Criação e listagem
  router.post('/', controller.create);
  router.get('/', controller.list);

  // 2. Consulta de detalhes
  router.get('/:id', controller.getById);

  // 3. Ciclo de vida: Iniciar, Finalizar, Abandonar, Excluir
  router.post('/:id/start', controller.start);
  router.post('/:id/finish', controller.finish);
  router.post('/:id/abandon', controller.abandon);
  router.delete('/:id', controller.delete);

  // 4. Submissão e atualização de respostas
  router.post('/:id/answers', controller.submitAnswer);
  router.put('/:id/answers', controller.submitAnswer);
  router.post('/:id/questions/:questionId/answers', controller.submitAnswer);
  router.put('/:id/questions/:questionId/answers', controller.submitAnswer);

  return router;
}

export const simulationRouter = createSimulationRouter();
