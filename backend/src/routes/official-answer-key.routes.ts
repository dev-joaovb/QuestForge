import { Router } from 'express';
import {
  createOfficialAnswerKeyController,
  type OfficialAnswerKeyControllerDependencies,
} from '../controllers/official-answer-key.controller.ts';
import { createRequireAuthMiddleware } from '../middlewares/auth.middleware.ts';
import type { AuthService } from '../services/auth.service.ts';

export interface OfficialAnswerKeyRouterDependencies
  extends OfficialAnswerKeyControllerDependencies {
  authService?: AuthService;
}

/**
 * Rotas HTTP de Gabaritos Oficiais (`/api/official-answer-keys` e `/api/answer-keys`).
 *
 * Todas as rotas exigem sessão válida via `requireAuth`.
 * Operações mutáveis (`POST`, `PUT`, `PATCH`, `DELETE`) são protegidas pelo middleware
 * global de CSRF registrado em `/api` no `backend/src/app.ts`.
 */
export function createOfficialAnswerKeyRouter(
  deps: OfficialAnswerKeyRouterDependencies = {}
): Router {
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(deps.authService);
  const controller = createOfficialAnswerKeyController({
    officialAnswerKeyService: deps.officialAnswerKeyService,
  });

  router.use(requireAuth);

  // 1. Rotas parametrizadas por Prova (declaradas antes de /:id para evitar conflitos de rota)
  router.get('/exams/:examId/current', controller.getCurrentByExamId);
  router.get('/exams/:examId/versions', controller.getVersionsByExamId);

  // 2. Operações de ciclo de vida do Gabarito Oficial
  router.post('/', controller.createDraft);
  router.get('/:id', controller.getById);
  router.patch('/:id', controller.updateDraft);
  router.put('/:id', controller.updateDraft);
  router.delete('/:id', controller.deleteDraft);
  router.post('/:id/publish', controller.publish);

  // 3. Gerenciamento e consulta de itens do Gabarito
  router.get('/:id/items', controller.getItems);
  router.post('/:id/items', controller.addItem);
  router.put('/:id/items', controller.replaceItems);
  router.get('/:id/items/:questionNumber', controller.getItemByQuestionNumber);
  router.patch('/:id/items/:questionNumber', controller.updateItem);
  router.put('/:id/items/:questionNumber', controller.updateItem);

  return router;
}

export const officialAnswerKeyRouter = createOfficialAnswerKeyRouter();
