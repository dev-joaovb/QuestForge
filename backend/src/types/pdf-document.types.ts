import type { DocumentProcessingStatus } from '@prisma/client';

export type PdfDocumentErrorCode =
  | 'PDF_VALIDATION_ERROR'
  | 'PDF_TOO_LARGE'
  | 'PDF_PAGE_LIMIT_EXCEEDED'
  | 'PDF_EXTRACTION_TIMEOUT'
  | 'PDF_EXTRACTION_FAILED'
  | 'OCR_UNAVAILABLE'
  | 'OCR_EXTRACTION_FAILED'
  | 'OCR_EXTRACTION_TIMEOUT'
  | 'DOCUMENT_NOT_FOUND'
  | 'DOCUMENT_FORBIDDEN'
  | 'DOCUMENT_ALREADY_PROCESSING'
  | 'DOCUMENT_INVALID_OCR_STATE'
  | 'DOCUMENT_NEEDS_OCR'
  | 'DOCUMENT_NO_TEXT'
  | 'STORAGE_UNAVAILABLE';

export class PdfDocumentDomainError extends Error {
  public readonly code: PdfDocumentErrorCode;
  public readonly statusCode: number;

  constructor(code: PdfDocumentErrorCode, message: string, statusCode = 400) {
    super(message);
    this.name = 'PdfDocumentDomainError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface PdfUploadFileInput {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
  examId?: string | null;
}

export interface ValidatedPdfFileMetadata {
  sanitizedOriginalName: string;
  mimeType: 'application/pdf';
  sizeBytes: number;
  checksumSha256: string;
  pdfHeaderVersion: string;
}

export type PdfContentClassification = 'DIGITAL_TEXT' | 'SCANNED_NEEDS_OCR';

export interface PdfDigitalExtractionOptions {
  maxPages: number;
  timeoutMs: number;
  minDigitalCharsTotal?: number;
  minDigitalCharsPerPage?: number;
}

export interface PdfDigitalExtractionResult {
  pageCount: number;
  extractedText: string | null;
  extractedCharCount: number;
  requiresOcr: boolean;
  classification: PdfContentClassification;
  pagesNeedingOcr: number[];
}

/**
 * Descritor controlado de uma única página preparada para processamento de OCR sob demanda.
 * Evita carregar imagens/buffers de todas as páginas simultaneamente na memória.
 */
export interface OcrPagePayload {
  pageNumber: number;
  totalPages: number;
  contentBuffer: Buffer;
  mimeType: 'application/pdf' | 'image/png' | 'image/jpeg';
  width?: number;
  height?: number;
  digitalCharCount?: number;
  cleanup: () => Promise<void> | void;
}

export interface OcrExtractionOptions {
  maxPages: number;
  timeoutMs: number;
  language?: string;
  signal?: AbortSignal;
}

export interface OcrPageExtractionResult {
  pageNumber: number;
  text: string;
  confidence?: number | null;
}

export interface OcrDocumentExtractionResult {
  providerName: string;
  pageCount: number;
  processedPages: number;
  extractedText: string;
  extractedCharCount: number;
  pages: OcrPageExtractionResult[];
}

export interface OcrServiceStatus {
  available: boolean;
  providerName: string;
  message: string;
}

/**
 * DTO de resumo do documento PDF para listagens (sem retornar o texto bruto extraído).
 * Nunca expõe chaves internas do MinIO (`objectKey`, `storageBucket`), credenciais ou URLs públicas.
 */
export interface PdfDocumentSummaryDTO {
  id: string;
  userId: string;
  examId: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  status: DocumentProcessingStatus;
  pageCount: number | null;
  extractedCharCount: number | null;
  requiresOcr: boolean;
  errorMessage: string | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * DTO de detalhes/metadados do documento PDF autorizado ao proprietário (`POST /api/documents`,
 * `GET /api/documents/:id` e `POST /api/documents/:id/ocr`).
 *
 * Política de segurança (Sprint 3):
 * - Preserva `extractedText` no banco de dados para as próximas etapas do pipeline, mas
 *   omite `extractedText` das respostas HTTP padrão (expondo apenas `extractedCharCount`,
 *   `pageCount`, `status` e `requiresOcr`).
 * - Nunca expõe chaves internas do MinIO (`objectKey`, `storageBucket`), credenciais ou URLs públicas.
 */
export type PdfDocumentDetailDTO = PdfDocumentSummaryDTO;

export interface PaginatedPdfDocumentsResult {
  items: PdfDocumentSummaryDTO[];
  total: number;
  currentPage: number;
  totalPages: number;
  limit: number;
}

/**
 * Contrato de entrada para o corpo da requisição de extração de questões a partir de documento PDF
 * (Sprint 4 — Etapa 4.3). Permite pistas contextuais opcionais, sem permitir timeout definido pelo cliente.
 */
export interface ExtractQuestionsBodyDTO {
  defaultSubject?: string | null;
  defaultBoard?: string | null;
  defaultExamTitle?: string | null;
  defaultYear?: number | null;
  maxQuestions?: number;
}

/**
 * Resultado da recuperação segura e tipada do texto de um documento PDF elegível para IA
 * (Sprint 4 — Etapa 4.3 — Passo 2).
 *
 * Fornece o texto persistido no banco e os metadados contextuais estritamente necessários
 * para a geração de prompt, omitindo storageBucket, objectKey e detalhes internos de infraestrutura.
 */
export interface EligiblePdfDocumentTextResult {
  id: string;
  userId: string;
  examId: string | null;
  originalName: string;
  extractedText: string;
  extractedCharCount: number;
  pageCount: number | null;
  status: DocumentProcessingStatus;
}

