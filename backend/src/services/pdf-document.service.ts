import crypto from 'node:crypto';
import {
  PdfDocumentDomainError,
  type EligiblePdfDocumentTextResult,
  type OcrServiceStatus,
  type PaginatedPdfDocumentsResult,
  type PdfDocumentDetailDTO,
  type PdfDocumentSummaryDTO,
  type PdfUploadFileInput,
} from '../types/pdf-document.types.ts';
import {
  listPdfDocumentsQuerySchema,
  validatePdfFileInput,
  type ListPdfDocumentsQueryInput,
} from '../validators/pdf-document.validator.ts';
import {
  buildPrivatePdfObjectKey,
  MinioObjectStorageService,
  type IObjectStorageService,
} from './storage.service.ts';
import {
  PdfJsTextExtractor,
  type IPdfTextExtractor,
} from '../utils/pdf-extractor.ts';
import {
  UnconfiguredOcrService,
  type IOcrService,
} from './ocr.service.ts';
import {
  OCR_ACQUIRABLE_STATUSES,
  PrismaPdfDocumentRepository,
  toPdfDocumentDetailDTO,
  toPdfDocumentSummaryDTO,
  type IPdfDocumentRepository,
} from '../repositories/pdf-document.repository.ts';
import { logger } from '../utils/logger.ts';

export interface PdfDocumentServiceDependencies {
  pdfDocumentRepository?: IPdfDocumentRepository;
  storageService?: IObjectStorageService;
  pdfTextExtractor?: IPdfTextExtractor;
  ocrService?: IOcrService;
  autoProcessOcrOnUpload?: boolean;
  maxFileSizeBytes?: number;
  maxPages?: number;
  extractionTimeoutMs?: number;
  now?: () => Date;
}

function sanitizeProcessingErrorMessage(error: unknown): string {
  if (error instanceof PdfDocumentDomainError) {
    return error.message;
  }
  return 'Falha interna ao processar o documento PDF. Verifique se o arquivo não está corrompido ou protegido por senha.';
}

/**
 * Serviço de Domínio para Upload, Armazenamento Privado, Extração Digital e Pipeline de OCR (Sprint 3).
 *
 * Responsabilidades e Garantias de Segurança:
 * 1. Validação estrita do arquivo PDF (tamanho, MIME declarado, sanitização do nome e magic bytes `%PDF-` + `%%EOF`).
 * 2. Armazenamento privado no MinIO com chave isolada por usuário (`users/{userId}/pdf/{docId}.pdf`).
 * 3. Máquina de estados explícita:
 *    - `UPLOADED` -> `PROCESSING` -> `COMPLETED` (quando há texto digital extraível ou OCR concluído com sucesso)
 *    - `UPLOADED` -> `PROCESSING` -> `NEEDS_OCR` (quando o PDF é válido mas não há texto digital utilizável)
 *    - `UPLOADED` / `NEEDS_OCR` -> `PROCESSING` -> `FAILED` (quando excede limite de páginas, tempo ou falha na leitura/OCR)
 * 4. Abstração desacoplada `IOcrService`: se o OCR não estiver configurado, preserva o documento em `NEEDS_OCR`
 *    e informa honestamente `OCR_UNAVAILABLE` (503), jamais marcando como `COMPLETED` sem extração real.
 * 5. Isolamento estrito por `actorUserId` em todas as consultas, processamentos de OCR e exclusões.
 * 6. Proibição de registrar o texto integral do PDF ou credenciais nos logs ou respostas HTTP padrão.
 */
export class PdfDocumentService {
  private readonly repository: IPdfDocumentRepository;
  private readonly storage: IObjectStorageService;
  private readonly extractor: IPdfTextExtractor;
  private readonly ocrService: IOcrService;
  private readonly autoProcessOcrOnUpload: boolean;
  private readonly maxFileSizeBytes?: number;
  private readonly maxPages?: number;
  private readonly extractionTimeoutMs?: number;
  private readonly now: () => Date;

  constructor(deps: PdfDocumentServiceDependencies = {}) {
    this.repository = deps.pdfDocumentRepository ?? new PrismaPdfDocumentRepository();
    this.storage = deps.storageService ?? new MinioObjectStorageService();
    this.extractor = deps.pdfTextExtractor ?? new PdfJsTextExtractor();
    this.ocrService = deps.ocrService ?? new UnconfiguredOcrService();
    this.autoProcessOcrOnUpload = deps.autoProcessOcrOnUpload ?? false;
    this.maxFileSizeBytes = deps.maxFileSizeBytes;
    this.maxPages = deps.maxPages;
    this.extractionTimeoutMs = deps.extractionTimeoutMs;
    this.now = deps.now ?? (() => new Date());
  }

  getOcrServiceStatus(): OcrServiceStatus {
    return this.ocrService.getStatus();
  }

  async uploadAndProcessPdf(
    actorUserId: string,
    fileInput: PdfUploadFileInput
  ): Promise<PdfDocumentDetailDTO> {
    if (!actorUserId || actorUserId.trim() === '') {
      throw new PdfDocumentDomainError(
        'DOCUMENT_FORBIDDEN',
        'Usuário autenticado é obrigatório para enviar documentos PDF.',
        403
      );
    }

    // 1. Validação rigorosa (magic bytes, tamanho, MIME e nome sanitizado)
    const validatedMeta = validatePdfFileInput(fileInput, {
      maxFileSizeBytes: this.maxFileSizeBytes,
    });

    const documentId = crypto.randomUUID();
    const bucket = this.storage.getDefaultBucket();
    const objectKey = buildPrivatePdfObjectKey(actorUserId, documentId);

    // 2. Armazenamento privado no MinIO
    await this.storage.putPrivateObject({
      bucket,
      objectKey,
      buffer: fileInput.buffer,
      mimeType: validatedMeta.mimeType,
      sizeBytes: validatedMeta.sizeBytes,
    });

    // 3. Persistência inicial com status UPLOADED
    let record;
    try {
      record = await this.repository.create({
        id: documentId,
        userId: actorUserId,
        examId: fileInput.examId ?? null,
        originalName: validatedMeta.sanitizedOriginalName,
        mimeType: validatedMeta.mimeType,
        sizeBytes: validatedMeta.sizeBytes,
        storageBucket: bucket,
        objectKey,
        checksumSha256: validatedMeta.checksumSha256,
        status: 'UPLOADED',
      });
    } catch (dbError) {
      // Remove objeto órfão no MinIO em caso de falha ao persistir no PostgreSQL
      try {
        await this.storage.deletePrivateObject(objectKey, bucket);
      } catch {
        // Ignora erro secundário de limpeza para preservar a falha original
      }
      throw dbError;
    }

    logger.info('pdf_document_uploaded', {
      documentId: record.id,
      userId: actorUserId,
      sizeBytes: record.sizeBytes,
      checksumSha256: record.checksumSha256,
    });

    // 4. Transição para PROCESSING e extração de texto digital
    await this.repository.markProcessing(record.id);

    try {
      const extractionResult = await this.extractor.extractDigitalText(
        fileInput.buffer,
        {
          maxPages: this.maxPages,
          timeoutMs: this.extractionTimeoutMs,
        }
      );

      const finalStatus = extractionResult.requiresOcr ? 'NEEDS_OCR' : 'COMPLETED';

      const completedRecord = await this.repository.markExtractionCompleted(
        record.id,
        {
          status: finalStatus,
          pageCount: extractionResult.pageCount,
          extractedText: extractionResult.extractedText,
          extractedCharCount: extractionResult.extractedCharCount,
          requiresOcr: extractionResult.requiresOcr,
          processedAt: this.now(),
        }
      );

      logger.info('pdf_document_processed', {
        documentId: completedRecord.id,
        userId: actorUserId,
        status: completedRecord.status,
        classification: extractionResult.classification,
        pageCount: completedRecord.pageCount,
        extractedCharCount: completedRecord.extractedCharCount,
        requiresOcr: completedRecord.requiresOcr,
      });

      if (
        extractionResult.requiresOcr &&
        this.autoProcessOcrOnUpload &&
        this.ocrService.isAvailable()
      ) {
        return await this.processDocumentOcr(actorUserId, completedRecord.id);
      }

      return toPdfDocumentDetailDTO(completedRecord);
    } catch (extractionError) {
      const sanitizedError = sanitizeProcessingErrorMessage(extractionError);
      const failedRecord = await this.repository.markFailed(
        record.id,
        sanitizedError,
        this.now()
      );

      logger.warn('pdf_document_processing_failed', {
        documentId: failedRecord.id,
        userId: actorUserId,
        reason: sanitizedError,
      });

      return toPdfDocumentDetailDTO(failedRecord);
    }
  }

  /**
   * Executa o pipeline de OCR sobre um documento PDF digitalizado (`NEEDS_OCR` ou `requiresOcr: true`)
   * pertencente ao usuário autenticado.
   *
   * Garantias arquiteturais (Etapa 3.3):
   * - Se `ocrService.isAvailable()` for `false`, NÃO altera o documento para `COMPLETED`,
   *   NÃO destrói o PDF no MinIO nem no banco e lança `OCR_UNAVAILABLE` (503).
   * - Se o OCR falhar ou atingir timeout durante a execução, preserva o PDF original no MinIO
   *   e marca o registro como `FAILED` com mensagem sanitizada, sem jamais simular sucesso.
   */
  async processDocumentOcr(
    actorUserId: string,
    documentId: string
  ): Promise<PdfDocumentDetailDTO> {
    if (!actorUserId || actorUserId.trim() === '') {
      throw new PdfDocumentDomainError(
        'DOCUMENT_FORBIDDEN',
        'Usuário autenticado é obrigatório para solicitar processamento de OCR.',
        403
      );
    }

    const existing = await this.repository.findById(documentId);
    if (!existing) {
      throw new PdfDocumentDomainError(
        'DOCUMENT_NOT_FOUND',
        'Documento PDF não encontrado.',
        404
      );
    }

    if (existing.userId !== actorUserId) {
      throw new PdfDocumentDomainError(
        'DOCUMENT_FORBIDDEN',
        'Você não possui permissão para processar este documento PDF.',
        403
      );
    }

    if (!this.ocrService.isAvailable()) {
      const statusInfo = this.ocrService.getStatus();
      logger.warn('pdf_document_ocr_unavailable', {
        documentId: existing.id,
        userId: actorUserId,
        providerName: statusInfo.providerName,
      });

      throw new PdfDocumentDomainError(
        'OCR_UNAVAILABLE',
        statusInfo.message,
        503
      );
    }

    const acquired = await this.repository.tryAcquireOcrProcessing(
      existing.id,
      OCR_ACQUIRABLE_STATUSES
    );

    if (!acquired) {
      const current = await this.repository.findById(existing.id);

      if (!current) {
        throw new PdfDocumentDomainError(
          'DOCUMENT_NOT_FOUND',
          'Documento PDF não encontrado.',
          404
        );
      }

      if (current.status === 'PROCESSING') {
        logger.warn('pdf_document_ocr_conflict', {
          documentId: current.id,
          userId: actorUserId,
          observedStatus: current.status,
        });

        throw new PdfDocumentDomainError(
          'DOCUMENT_ALREADY_PROCESSING',
          'Este documento PDF já está em processamento no momento.',
          409
        );
      }

      logger.warn('pdf_document_ocr_invalid_state', {
        documentId: current.id,
        userId: actorUserId,
        observedStatus: current.status,
      });

      throw new PdfDocumentDomainError(
        'DOCUMENT_INVALID_OCR_STATE',
        `O documento PDF está no estado "${current.status}" e não é elegível para iniciar o processamento de OCR.`,
        409
      );
    }

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await this.storage.getPrivateObjectBuffer(
        existing.objectKey,
        existing.storageBucket
      );
    } catch (storageError) {
      // Restaura o estado elegível anterior em caso de falha de infraestrutura no MinIO, sem transformar em sucesso
      try {
        if (existing.status === 'FAILED') {
          await this.repository.markFailed(
            existing.id,
            existing.errorMessage ??
              'Falha anterior mantida após indisponibilidade do armazenamento.',
            existing.processedAt ?? this.now()
          );
        } else {
          await this.repository.markExtractionCompleted(existing.id, {
            status: 'NEEDS_OCR',
            pageCount: existing.pageCount ?? 0,
            extractedText: existing.extractedText ?? null,
            extractedCharCount: existing.extractedCharCount ?? 0,
            requiresOcr: true,
            processedAt: existing.processedAt ?? this.now(),
          });
        }
      } catch {
        // Preserva o erro original de armazenamento
      }
      throw storageError;
    }

    try {
      const pageStream =
        typeof this.extractor.createOcrPageStream === 'function'
          ? this.extractor.createOcrPageStream(pdfBuffer, {
              maxPages: this.maxPages,
              timeoutMs: this.extractionTimeoutMs,
            })
          : new PdfJsTextExtractor().createOcrPageStream(pdfBuffer, {
              maxPages: this.maxPages,
              timeoutMs: this.extractionTimeoutMs,
            });

      const ocrResult = await this.ocrService.extractTextFromDocumentPages(
        pageStream,
        {
          maxPages: this.maxPages,
          timeoutMs: this.extractionTimeoutMs,
        }
      );

      const completedRecord = await this.repository.markExtractionCompleted(
        existing.id,
        {
          status: 'COMPLETED',
          pageCount: ocrResult.pageCount,
          extractedText: ocrResult.extractedText,
          extractedCharCount: ocrResult.extractedCharCount,
          requiresOcr: false,
          processedAt: this.now(),
        }
      );

      logger.info('pdf_document_ocr_completed', {
        documentId: completedRecord.id,
        userId: actorUserId,
        providerName: ocrResult.providerName,
        pageCount: completedRecord.pageCount,
        extractedCharCount: completedRecord.extractedCharCount,
      });

      return toPdfDocumentDetailDTO(completedRecord);
    } catch (ocrError) {
      if (
        ocrError instanceof PdfDocumentDomainError &&
        ocrError.code === 'OCR_UNAVAILABLE'
      ) {
        // Restaura o estado coerente NEEDS_OCR caso o provedor reporte indisponibilidade antes de extrair
        await this.repository.markExtractionCompleted(existing.id, {
          status: 'NEEDS_OCR',
          pageCount: existing.pageCount ?? 0,
          extractedText: null,
          extractedCharCount: 0,
          requiresOcr: true,
          processedAt: existing.processedAt ?? this.now(),
        });
        throw ocrError;
      }

      const sanitizedError = sanitizeProcessingErrorMessage(ocrError);
      const failedRecord = await this.repository.markFailed(
        existing.id,
        sanitizedError,
        this.now()
      );

      logger.warn('pdf_document_ocr_failed', {
        documentId: failedRecord.id,
        userId: actorUserId,
        reason: sanitizedError,
      });

      return toPdfDocumentDetailDTO(failedRecord);
    }
  }

  async listUserDocuments(actorUserId: string): Promise<PdfDocumentSummaryDTO[]> {
    if (!actorUserId || actorUserId.trim() === '') {
      throw new PdfDocumentDomainError(
        'DOCUMENT_FORBIDDEN',
        'Usuário autenticado é obrigatório para listar documentos.',
        403
      );
    }

    const records = await this.repository.findManyByUser(actorUserId);
    return records.map(toPdfDocumentSummaryDTO);
  }

  async listUserDocumentsPaginated(
    actorUserId: string,
    rawQuery: ListPdfDocumentsQueryInput = {}
  ): Promise<PaginatedPdfDocumentsResult> {
    if (!actorUserId || actorUserId.trim() === '') {
      throw new PdfDocumentDomainError(
        'DOCUMENT_FORBIDDEN',
        'Usuário autenticado é obrigatório para listar documentos.',
        403
      );
    }

    const parsed = listPdfDocumentsQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      throw new PdfDocumentDomainError(
        'PDF_VALIDATION_ERROR',
        firstIssue?.message ?? 'Parâmetros de paginação ou filtro inválidos.',
        400
      );
    }

    const { page, limit, status } = parsed.data;

    let items;
    let total;

    if (typeof this.repository.findManyPaginated === 'function') {
      const result = await this.repository.findManyPaginated({
        userId: actorUserId,
        page,
        limit,
        status,
      });
      items = result.items;
      total = result.total;
    } else {
      const allRecords = await this.repository.findManyByUser(actorUserId);
      const filtered = status
        ? allRecords.filter((r) => r.status === status)
        : allRecords;
      total = filtered.length;
      const start = (page - 1) * limit;
      items = filtered.slice(start, start + limit);
    }

    const totalPages = total === 0 ? 1 : Math.ceil(total / limit);

    return {
      items: items.map(toPdfDocumentSummaryDTO),
      total,
      currentPage: page,
      totalPages,
      limit,
    };
  }

  async getUserDocumentById(
    actorUserId: string,
    documentId: string
  ): Promise<PdfDocumentDetailDTO> {
    const existing = await this.repository.findById(documentId);
    if (!existing) {
      throw new PdfDocumentDomainError(
        'DOCUMENT_NOT_FOUND',
        'Documento PDF não encontrado.',
        404
      );
    }

    if (existing.userId !== actorUserId) {
      throw new PdfDocumentDomainError(
        'DOCUMENT_FORBIDDEN',
        'Você não possui permissão para acessar este documento PDF.',
        403
      );
    }

    return toPdfDocumentDetailDTO(existing);
  }

  async deleteUserDocument(actorUserId: string, documentId: string): Promise<void> {
    const existing = await this.repository.findById(documentId);
    if (!existing) {
      throw new PdfDocumentDomainError(
        'DOCUMENT_NOT_FOUND',
        'Documento PDF não encontrado.',
        404
      );
    }

    if (existing.userId !== actorUserId) {
      throw new PdfDocumentDomainError(
        'DOCUMENT_FORBIDDEN',
        'Você não possui permissão para excluir este documento PDF.',
        403
      );
    }

    await this.storage.deletePrivateObject(
      existing.objectKey,
      existing.storageBucket
    );

    try {
      await this.repository.deleteById(existing.id);
    } catch (dbError) {
      logger.error('pdf_document_delete_db_failed_after_storage', {
        documentId: existing.id,
        userId: actorUserId,
        errorName: dbError instanceof Error ? dbError.name : 'UnknownError',
      });
      throw dbError;
    }

    logger.info('pdf_document_deleted', {
      documentId: existing.id,
      userId: actorUserId,
    });
  }

  /**
   * Recupera de forma segura e tipada o texto persistido de um documento PDF elegível para
   * extração de questões por IA (Sprint 4 — Etapa 4.3 — Passo 2).
   *
   * Regras de segurança e validação:
   * 1. Autenticação obrigatória (actorUserId não vazio).
   * 2. Existência do documento (DOCUMENT_NOT_FOUND, 404).
   * 3. Controle de acesso por proprietário (DOCUMENT_FORBIDDEN, 403).
   * 4. Estado de processamento:
   *    - UPLOADED ou PROCESSING: DOCUMENT_ALREADY_PROCESSING (409)
   *    - NEEDS_OCR ou requiresOcr === true: DOCUMENT_NEEDS_OCR (422)
   *    - FAILED: PDF_EXTRACTION_FAILED (422)
   *    - Diferente de COMPLETED: DOCUMENT_INVALID_OCR_STATE (409)
   * 5. Presença de texto extraído utilizável (DOCUMENT_NO_TEXT, 422 se null, vazio ou whitespace).
   */
  async getDocumentTextForAiExtraction(
    actorUserId: string,
    documentId: string
  ): Promise<EligiblePdfDocumentTextResult> {
    if (!actorUserId || typeof actorUserId !== 'string' || actorUserId.trim().length === 0) {
      throw new PdfDocumentDomainError(
        'DOCUMENT_FORBIDDEN',
        'Usuário autenticado é obrigatório para acessar o texto do documento PDF.',
        403
      );
    }

    if (!documentId || typeof documentId !== 'string' || documentId.trim().length === 0) {
      throw new PdfDocumentDomainError(
        'DOCUMENT_NOT_FOUND',
        'Documento PDF não encontrado.',
        404
      );
    }

    const existing = await this.repository.findById(documentId);
    if (!existing) {
      throw new PdfDocumentDomainError(
        'DOCUMENT_NOT_FOUND',
        'Documento PDF não encontrado.',
        404
      );
    }

    if (existing.userId !== actorUserId) {
      throw new PdfDocumentDomainError(
        'DOCUMENT_FORBIDDEN',
        'Você não possui permissão para acessar este documento PDF.',
        403
      );
    }

    if (existing.status === 'PROCESSING' || existing.status === 'UPLOADED') {
      throw new PdfDocumentDomainError(
        'DOCUMENT_ALREADY_PROCESSING',
        'O documento PDF ainda está em processamento e seu texto não está disponível.',
        409
      );
    }

    if (existing.status === 'NEEDS_OCR' || existing.requiresOcr) {
      throw new PdfDocumentDomainError(
        'DOCUMENT_NEEDS_OCR',
        'O documento PDF necessita de processamento por OCR antes da extração de questões por IA.',
        422
      );
    }

    if (existing.status === 'FAILED') {
      throw new PdfDocumentDomainError(
        'PDF_EXTRACTION_FAILED',
        'O processamento anterior deste documento PDF falhou e não há texto disponível.',
        422
      );
    }

    if (existing.status !== 'COMPLETED') {
      throw new PdfDocumentDomainError(
        'DOCUMENT_INVALID_OCR_STATE',
        `O documento PDF está no estado "${existing.status}" e não é elegível para extração de questões por IA.`,
        409
      );
    }

    if (!existing.extractedText || existing.extractedText.trim().length === 0) {
      throw new PdfDocumentDomainError(
        'DOCUMENT_NO_TEXT',
        'O documento PDF não possui texto extraível legível para extração de questões por IA.',
        422
      );
    }

    logger.info('pdf_document_text_retrieved_for_ai', {
      documentId: existing.id,
      userId: actorUserId,
      charCount: existing.extractedText.length,
    });

    return {
      id: existing.id,
      userId: existing.userId,
      examId: existing.examId,
      originalName: existing.originalName,
      extractedText: existing.extractedText,
      extractedCharCount: existing.extractedCharCount ?? existing.extractedText.length,
      pageCount: existing.pageCount,
      status: existing.status,
    };
  }

  async getExtractedTextForDocument(
    actorUserId: string,
    documentId: string
  ): Promise<EligiblePdfDocumentTextResult> {
    return this.getDocumentTextForAiExtraction(actorUserId, documentId);
  }
}
