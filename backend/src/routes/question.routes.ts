import { Router } from 'express';
import {
  createQuestionController,
  type QuestionControllerDependencies,
} from '../controllers/question.controller.ts';
import { createRequireAuthMiddleware } from '../middlewares/auth.middleware.ts';
import type { AuthService } from '../services/auth.service.ts';

export interface QuestionRouterDependencies extends QuestionControllerDependencies {
  authService?: AuthService;
}

export function createQuestionRouter(deps: QuestionRouterDependencies = {}): Router {
  const router = Router();
  const controller = createQuestionController(deps);
  const requireAuth = createRequireAuthMiddleware(deps.authService);

  router.use(requireAuth);

  router.get('/', controller.list);
  router.get('/:id', controller.getById);
  router.post('/', controller.create);
  router.put('/:id', controller.update);
  router.delete('/:id', controller.remove);

  return router;
}

export const questionRouter = createQuestionRouter();
