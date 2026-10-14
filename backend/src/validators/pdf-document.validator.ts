import crypto from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import {
  PdfDocumentDomainError,
  type ExtractQuestionsBodyDTO,
  type PdfUploadFileInput,
  type ValidatedPdfFileMetadata,
} from '../types/pdf-document.types.ts';
import {
  ABSOLUTE_MAX_EXTRACTED_QUESTIONS,
  DEFAULT_MAX_EXTRACTED_QUESTIONS,
} from './ai-extraction.validator.ts';

export const DEFAULT_MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

const ALLOWED_DECLARED_MIMES = new Set(['application/pdf', 'application/x-pdf']);

export const documentProcessingStatusSchema = z.enum([
  'UPLOADED',
  'PROCESSING',
  'COMPLETED',
  'NEEDS_OCR',
  'FAILED',
]);

export const listPdfDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: documentProcessingStatusSchema.optional(),
});

export type ListPdfDocumentsQueryInput = z.input<typeof listPdfDocumentsQuerySchema>;
export type ParsedListPdfDocumentsQuery = z.output<typeof listPdfDocumentsQuerySchema>;

/**
 * Sanitiza o nome original do arquivo PDF contra Path Traversal, caracteres nulos
 * ou de controle e garante extensão `.pdf` limpa.
 */
export function sanitizePdfOriginalName(rawName: string): string {
  const base = path.posix.basename(rawName.replace(/\\/g, '/')).trim();
  const cleaned = base
    // Remove caracteres de controle e barras residuais
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F/\\]/g, '')
    .replace(/\.\.+/g, '.')
    .trim();

  if (!cleaned || cleaned === '.' || cleaned === '.pdf') {
    throw new PdfDocumentDomainError(
      'PDF_VALIDATION_ERROR',
      'O nome do arquivo PDF informado é inválido.',
      400
    );
  }

  if (!cleaned.toLowerCase().endsWith('.pdf')) {
    throw new PdfDocumentDomainError(
      'PDF_VALIDATION_ERROR',
      'O arquivo enviado deve possuir a extensão .pdf.',
      400
    );
  }

  return cleaned.length > 180 ? `${cleaned.slice(0, 176)}.pdf` : cleaned;
}

/**
 * Validação preliminar de assinatura binária (magic bytes) do buffer para confirmar que
 * possui cabeçalho `%PDF-x.y` nos primeiros 1024 bytes e marcador `%%EOF` nos últimos 2048 bytes
 * (permitindo espaços em branco, quebras de linha ou dados pós-marcador permitidos pela especificação PDF,
 * sem enfraquecer a rejeição imediata de arquivos truncados ou falsificados).
 *
 * Nota arquitetural: esta função realiza apenas a triagem preliminar antes do armazenamento;
 * a validação estrutural profunda da gramática PDF (xref, trailer, árvore de páginas e streams)
 * é realizada pelo parser real (`PdfJsTextExtractor`) durante o processamento.
 */
export function inspectPdfMagicBytes(buffer: Buffer): { version: string } {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength < 16) {
    throw new PdfDocumentDomainError(
      'PDF_VALIDATION_ERROR',
      'O arquivo enviado está vazio ou truncado e não constitui um PDF válido.',
      400
    );
  }

  const headSlice = buffer.subarray(0, Math.min(buffer.byteLength, 1024)).toString('latin1');
  const headerMatch = /%PDF-(\d\.\d)/.exec(headSlice);

  if (!headerMatch) {
    throw new PdfDocumentDomainError(
      'PDF_VALIDATION_ERROR',
      'Assinatura binária inválida: o arquivo não contém um cabeçalho %PDF válido.',
      400
    );
  }

  const tailWindowSize = Math.min(buffer.byteLength, 2048);
  const tailSlice = buffer
    .subarray(buffer.byteLength - tailWindowSize, buffer.byteLength)
    .toString('latin1');

  if (!tailSlice.includes('%%EOF')) {
    throw new PdfDocumentDomainError(
      'PDF_VALIDATION_ERROR',
      'Estrutura binária PDF incompleta ou corrompida (marcador %%EOF ausente).',
      400
    );
  }

  return {
    version: headerMatch[1],
  };
}

/**
 * Valida integralmente um arquivo PDF recebido no backend antes de qualquer armazenamento ou processamento.
 */
export function validatePdfFileInput(
  input: PdfUploadFileInput,
  options?: { maxFileSizeBytes?: number }
): ValidatedPdfFileMetadata {
  const maxFileSizeBytes =
    options?.maxFileSizeBytes ??
    (Number(process.env.PDF_MAX_FILE_SIZE_BYTES) || DEFAULT_MAX_PDF_SIZE_BYTES);

  if (!input || !Buffer.isBuffer(input.buffer)) {
    throw new PdfDocumentDomainError(
      'PDF_VALIDATION_ERROR',
      'Nenhum conteúdo binário de arquivo PDF foi fornecido.',
      400
    );
  }

  const actualBytes = input.buffer.byteLength;
  if (actualBytes <= 0) {
    throw new PdfDocumentDomainError(
      'PDF_VALIDATION_ERROR',
      'O arquivo PDF enviado está vazio (0 bytes).',
      400
    );
  }

  if (input.sizeBytes !== undefined && input.sizeBytes !== actualBytes) {
    throw new PdfDocumentDomainError(
      'PDF_VALIDATION_ERROR',
      'Inconsistência entre o tamanho declarado e o tamanho real do buffer do arquivo.',
      400
    );
  }

  if (actualBytes > maxFileSizeBytes) {
    const maxMb = (maxFileSizeBytes / (1024 * 1024)).toFixed(1);
    throw new PdfDocumentDomainError(
      'PDF_TOO_LARGE',
      `O arquivo PDF excede o tamanho máximo permitido de ${maxMb} MB.`,
      413
    );
  }

  const normalizedMime = (input.mimeType || '').trim().toLowerCase();
  if (!ALLOWED_DECLARED_MIMES.has(normalizedMime)) {
    throw new PdfDocumentDomainError(
      'PDF_VALIDATION_ERROR',
      'Tipo MIME não permitido. Envie exclusivamente arquivos application/pdf.',
      400
    );
  }

  const sanitizedOriginalName = sanitizePdfOriginalName(input.originalName || '');
  const { version } = inspectPdfMagicBytes(input.buffer);

  const checksumSha256 = crypto
    .createHash('sha256')
    .update(input.buffer)
    .digest('hex');

  return {
    sanitizedOriginalName,
    mimeType: 'application/pdf',
    sizeBytes: actualBytes,
    checksumSha256,
    pdfHeaderVersion: version,
  };
}

const PLACEHOLDER_NULL_VALUES = new Set([
  '',
  'null',
  'undefined',
  'n/a',
  'na',
  'none',
  'nenhum',
  'nenhuma',
  'desconhecido',
  'desconhecida',
  'nao informado',
  'não informado',
  'nao consta',
  'não consta',
  '-',
  '--',
  '?',
]);

/**
 * Normaliza valores de strings opcionais enviadas no corpo de contexto da extração.
 * Se o campo não foi fornecido (undefined), permanece undefined.
 * Se foi fornecido como null, vazio ou placeholder genérico ("N/A", "null"), converte para null.
 * Se possui valor válido, aplica trim e compacta espaços repetidos.
 */
function normalizeOptionalContextString(
  value: string | null | undefined
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed || PLACEHOLDER_NULL_VALUES.has(trimmed.toLowerCase())) {
    return null;
  }
  return trimmed;
}

/**
 * Retorna o limite máximo de questões permitido por documento, respeitando a variável
 * de ambiente AI_MAX_QUESTIONS_PER_DOCUMENT e o teto absoluto ABSOLUTE_MAX_EXTRACTED_QUESTIONS.
 */
export function getMaxQuestionsAllowed(configuredLimit?: number): number {
  if (
    typeof configuredLimit === 'number' &&
    Number.isInteger(configuredLimit) &&
    configuredLimit > 0
  ) {
    return Math.min(configuredLimit, ABSOLUTE_MAX_EXTRACTED_QUESTIONS);
  }
  const envValue = Number(process.env.AI_MAX_QUESTIONS_PER_DOCUMENT);
  if (Number.isInteger(envValue) && envValue > 0) {
    return Math.min(envValue, ABSOLUTE_MAX_EXTRACTED_QUESTIONS);
  }
  return DEFAULT_MAX_EXTRACTED_QUESTIONS;
}

/**
 * Schema estrito de validação do corpo opcional da requisição do endpoint POST /api/documents/:id/extract.
 *
 * Regras estritas (Sprint 4 — Etapa 4.3):
 * 1. Permite exclusivamente pistas contextuais opcionais: defaultSubject, defaultBoard, defaultExamTitle,
 *    defaultYear e maxQuestions.
 * 2. PROIBIDO o cliente definir timeoutMs (rejeitado via .strict(), o tempo limite segue OLLAMA_TIMEOUT_MS do servidor).
 * 3. Proíbe qualquer propriedade inesperada via .strict().
 * 4. Campos omitidos continuam omitidos (undefined) para permitir herança fiel do exame vinculado.
 * 5. Não inventa metadados ou valores padrão inexistentes.
 * 6. maxQuestions deve ser inteiro positivo e respeitar AI_MAX_QUESTIONS_PER_DOCUMENT (com teto em ABSOLUTE_MAX_EXTRACTED_QUESTIONS).
 */
export const extractQuestionsBodySchema = z
  .object({
    defaultSubject: z
      .string()
      .max(120, 'A disciplina deve possuir no máximo 120 caracteres.')
      .nullable()
      .optional()
      .transform((v) => normalizeOptionalContextString(v)),
    defaultBoard: z
      .string()
      .max(120, 'A banca examinadora deve possuir no máximo 120 caracteres.')
      .nullable()
      .optional()
      .transform((v) => normalizeOptionalContextString(v)),
    defaultExamTitle: z
      .string()
      .max(200, 'O título do exame deve possuir no máximo 200 caracteres.')
      .nullable()
      .optional()
      .transform((v) => normalizeOptionalContextString(v)),
    defaultYear: z
      .union([
        z
          .number()
          .int('O ano do exame deve ser um número inteiro.')
          .min(1950, 'O ano do exame deve ser maior ou igual a 1950.')
          .max(2100, 'O ano do exame deve ser menor ou igual a 2100.'),
        z.null(),
      ])
      .optional(),
    maxQuestions: z
      .number()
      .int('maxQuestions deve ser um número inteiro.')
      .positive('maxQuestions deve ser um número positivo maior que zero.')
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.maxQuestions !== undefined) {
      const allowedLimit = getMaxQuestionsAllowed();
      if (data.maxQuestions > allowedLimit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['maxQuestions'],
          message: `maxQuestions não pode exceder o limite configurado de ${allowedLimit} questões por documento.`,
        });
      }
    }
  });

export type ExtractQuestionsBodyInput = z.input<typeof extractQuestionsBodySchema>;
export type ParsedExtractQuestionsBody = z.output<typeof extractQuestionsBodySchema>;

/**
 * Valida o corpo da requisição de extração de questões e lança PdfDocumentDomainError(PDF_VALIDATION_ERROR, 400)
 * em caso de falha de validação ou propriedades não permitidas.
 */
export function validateExtractQuestionsBody(
  rawBody: unknown,
  options?: { maxQuestionsLimit?: number }
): ParsedExtractQuestionsBody {
  const payload = rawBody === undefined || rawBody === null ? {} : rawBody;
  const parsed = extractQuestionsBodySchema.safeParse(payload);

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const fieldPath = firstIssue?.path?.length ? ` (${firstIssue.path.join('.')})` : '';
    throw new PdfDocumentDomainError(
      'PDF_VALIDATION_ERROR',
      `Parâmetros de extração inválidos${fieldPath}: ${firstIssue?.message ?? 'dados incorretos.'}`,
      400
    );
  }

  if (options?.maxQuestionsLimit && parsed.data.maxQuestions !== undefined) {
    const customLimit = getMaxQuestionsAllowed(options.maxQuestionsLimit);
    if (parsed.data.maxQuestions > customLimit) {
      throw new PdfDocumentDomainError(
        'PDF_VALIDATION_ERROR',
        `maxQuestions não pode exceder o limite permitido de ${customLimit} questões por documento.`,
        400
      );
    }
  }

  return parsed.data;
}

