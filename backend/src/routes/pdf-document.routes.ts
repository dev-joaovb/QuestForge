import { Router } from 'express';
import {
  createPdfDocumentController,
  type PdfDocumentControllerDependencies,
} from '../controllers/pdf-document.controller.ts';
import { createRequireAuthMiddleware } from '../middlewares/auth.middleware.ts';
import {
  createMultipartPdfUploadMiddleware,
  type MultipartPdfUploadOptions,
} from '../middlewares/multipart-pdf.middleware.ts';
import type { AuthService } from '../services/auth.service.ts';

export interface PdfDocumentRouterDependencies
  extends PdfDocumentControllerDependencies {
  authService?: AuthService;
  multipartOptions?: MultipartPdfUploadOptions;
}

/**
 * Rotas HTTP de Documentos PDF (`/api/documents`).
 *
 * Todas as rotas exigem sessão válida via `requireAuth`.
 * Operações mutáveis (`POST`, `DELETE`) já são protegidas pelo `csrfProtectionMiddleware`
 * registrado globalmente em `/api` no `backend/src/app.ts`.
 */
export function createPdfDocumentRouter(
  deps: PdfDocumentRouterDependencies = {}
): Router {
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(deps.authService);
  const parseMultipartPdf = createMultipartPdfUploadMiddleware(
    deps.multipartOptions
  );
  const controller = createPdfDocumentController({
    pdfDocumentService: deps.pdfDocumentService,
  });

  router.use(requireAuth);

  router.get('/', controller.list);
  router.get('/:id', controller.getById);
  router.post('/', parseMultipartPdf, controller.upload);
  router.post('/:id/ocr', controller.processOcr);
  router.delete('/:id', controller.remove);

  return router;
}
