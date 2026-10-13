import type { Request, Response } from 'express';
import { PdfDocumentService } from '../services/pdf-document.service.ts';
import { PdfDocumentDomainError } from '../types/pdf-document.types.ts';
import type { ListPdfDocumentsQueryInput } from '../validators/pdf-document.validator.ts';
import { logger } from '../utils/logger.ts';

export interface PdfDocumentControllerDependencies {
  pdfDocumentService?: PdfDocumentService;
}

/**
 * Controller HTTP para Documentos PDF (Sprint 3):
 * - POST /api/documents — upload autenticado de PDF, validação, armazenamento privado e extração digital.
 * - POST /api/documents/:id/ocr — acionamento do pipeline de OCR sobre documento marcado como NEEDS_OCR.
 * - GET /api/documents — listagem paginada dos documentos do usuário autenticado.
 * - GET /api/documents/:id — consulta de metadados e status pelo proprietário.
 * - DELETE /api/documents/:id — exclusão autorizada do objeto privado no MinIO e do registro no PostgreSQL.
 *
 * Regras de segurança:
 * - A identidade do usuário vem exclusivamente de `req.user.id` (sessão validada).
 *   Qualquer `userId` enviado no corpo ou na query é ignorado.
 * - Nunca retorna `extractedText`, chaves internas (`objectKey`, `storageBucket`), credenciais ou URLs públicas.
 */
export function createPdfDocumentController(
  deps: PdfDocumentControllerDependencies = {}
) {
  const pdfDocumentService = deps.pdfDocumentService ?? new PdfDocumentService();

  return {
    async upload(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      if (!req.pdfUploadFile) {
        res.status(400).json({
          error: 'PDF_VALIDATION_ERROR',
          message: 'Nenhum arquivo PDF válido foi recebido para processamento.',
        });
        return;
      }

      try {
        const document = await pdfDocumentService.uploadAndProcessPdf(
          req.user.id,
          req.pdfUploadFile
        );
        res.status(201).json({ document });
      } catch (error) {
        handlePdfDocumentControllerError(error, req, res);
      }
    },

    async processOcr(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      const documentId = String(req.params.id ?? '').trim();
      if (!documentId) {
        res.status(400).json({
          error: 'PDF_VALIDATION_ERROR',
          message: 'Identificador do documento PDF é obrigatório.',
        });
        return;
      }

      try {
        const document = await pdfDocumentService.processDocumentOcr(
          req.user.id,
          documentId
        );
        res.status(200).json({ document });
      } catch (error) {
        handlePdfDocumentControllerError(error, req, res);
      }
    },

    async list(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      try {
        const result = await pdfDocumentService.listUserDocumentsPaginated(
          req.user.id,
          req.query as unknown as ListPdfDocumentsQueryInput
        );
        res.status(200).json(result);
      } catch (error) {
        handlePdfDocumentControllerError(error, req, res);
      }
    },

    async getById(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      const documentId = String(req.params.id ?? '').trim();
      if (!documentId) {
        res.status(400).json({
          error: 'PDF_VALIDATION_ERROR',
          message: 'Identificador do documento PDF é obrigatório.',
        });
        return;
      }

      try {
        const document = await pdfDocumentService.getUserDocumentById(
          req.user.id,
          documentId
        );
        res.status(200).json({ document });
      } catch (error) {
        handlePdfDocumentControllerError(error, req, res);
      }
    },

    async remove(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      const documentId = String(req.params.id ?? '').trim();
      if (!documentId) {
        res.status(400).json({
          error: 'PDF_VALIDATION_ERROR',
          message: 'Identificador do documento PDF é obrigatório.',
        });
        return;
      }

      try {
        await pdfDocumentService.deleteUserDocument(req.user.id, documentId);
        res.status(200).json({
          message: 'Documento PDF excluído com sucesso.',
        });
      } catch (error) {
        handlePdfDocumentControllerError(error, req, res);
      }
    },
  };
}

function handlePdfDocumentControllerError(
  error: unknown,
  req: Request,
  res: Response
): void {
  if (error instanceof PdfDocumentDomainError) {
    res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
    });
    return;
  }

  logger.error('pdf_document_controller_unexpected_error', {
    method: req.method,
    path: req.originalUrl,
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });

  res.status(503).json({
    error: 'ServiceUnavailable',
    message:
      'Não foi possível processar a operação de documentos PDF no momento.',
  });
}
