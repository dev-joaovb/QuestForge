import type { NextFunction, Request, Response } from 'express';
import { DEFAULT_MAX_PDF_SIZE_BYTES } from '../validators/pdf-document.validator.ts';
import type { PdfUploadFileInput } from '../types/pdf-document.types.ts';

declare global {
  namespace Express {
    interface Request {
      pdfUploadFile?: PdfUploadFileInput;
    }
  }
}

export interface MultipartPdfUploadOptions {
  maxFileSizeBytes?: number;
  maxFiles?: number;
  maxFields?: number;
}

const MULTIPART_ENVELOPE_OVERHEAD_BYTES = 64 * 1024; // 64 KB para cabeçalhos e metadados do form

function extractMultipartBoundary(contentTypeHeader: string | undefined): string | null {
  if (!contentTypeHeader) return null;
  const lower = contentTypeHeader.toLowerCase();
  if (!lower.includes('multipart/form-data')) return null;

  const match = /boundary=(?:"([^"]+)"|([^;,\s]+))/i.exec(contentTypeHeader);
  const boundary = (match?.[1] ?? match?.[2] ?? '').trim();
  return boundary.length > 0 && boundary.length <= 200 ? boundary : null;
}

interface ParsedMultipartResult {
  files: Array<{
    fieldName: string;
    originalName: string;
    mimeType: string;
    buffer: Buffer;
  }>;
  fields: Record<string, string>;
}

/**
 * Analisa o buffer já limitado de um corpo `multipart/form-data` respeitando
 * a contagem máxima de arquivos (`maxFiles`) e campos (`maxFields`).
 */
function parseBoundedMultipartBuffer(
  rawBody: Buffer,
  boundary: string,
  maxFiles: number,
  maxFields: number
): ParsedMultipartResult {
  const delimiter = Buffer.from(`--${boundary}`, 'latin1');
  const headerEndMarker = Buffer.from('\r\n\r\n', 'latin1');

  const files: ParsedMultipartResult['files'] = [];
  const fields: Record<string, string> = {};
  let fieldCount = 0;

  let cursor = rawBody.indexOf(delimiter, 0);
  if (cursor === -1) {
    throw new Error('INVALID_MULTIPART_STRUCTURE');
  }

  while (cursor !== -1) {
    const partStart = cursor + delimiter.length;

    // Verifica marcador de encerramento `--boundary--`
    if (
      partStart + 2 <= rawBody.length &&
      rawBody[partStart] === 0x2d &&
      rawBody[partStart + 1] === 0x2d
    ) {
      break;
    }

    // Avança `\r\n` após `--boundary`
    let contentStart = partStart;
    if (
      contentStart + 2 <= rawBody.length &&
      rawBody[contentStart] === 0x0d &&
      rawBody[contentStart + 1] === 0x0a
    ) {
      contentStart += 2;
    } else if (
      contentStart + 1 <= rawBody.length &&
      rawBody[contentStart] === 0x0a
    ) {
      contentStart += 1;
    }

    const nextDelimiterIndex = rawBody.indexOf(delimiter, contentStart);
    if (nextDelimiterIndex === -1) {
      break;
    }

    const headerEndIndex = rawBody.indexOf(headerEndMarker, contentStart);
    if (headerEndIndex === -1 || headerEndIndex >= nextDelimiterIndex) {
      throw new Error('INVALID_MULTIPART_HEADERS');
    }

    const rawHeaders = rawBody
      .subarray(contentStart, headerEndIndex)
      .toString('utf8');
    const bodyStart = headerEndIndex + headerEndMarker.length;

    // Remove o `\r\n` (ou `\n`) que precede imediatamente o próximo `--boundary`
    let bodyEnd = nextDelimiterIndex;
    if (
      bodyEnd - 2 >= bodyStart &&
      rawBody[bodyEnd - 2] === 0x0d &&
      rawBody[bodyEnd - 1] === 0x0a
    ) {
      bodyEnd -= 2;
    } else if (bodyEnd - 1 >= bodyStart && rawBody[bodyEnd - 1] === 0x0a) {
      bodyEnd -= 1;
    }

    const partBody = rawBody.subarray(bodyStart, bodyEnd);

    const dispositionMatch = /content-disposition:\s*form-data;([^\r\n]+)/i.exec(
      rawHeaders
    );
    if (dispositionMatch) {
      const dispositionParams = dispositionMatch[1];
      const nameMatch = /(?:^|;)\s*name="([^"]+)"/i.exec(dispositionParams);
      const filenameMatch = /(?:^|;)\s*filename="([^"]*)"/i.exec(
        dispositionParams
      );
      const contentTypeMatch = /content-type:\s*([^\r\n;]+)/i.exec(rawHeaders);

      const fieldName = nameMatch?.[1]?.trim() ?? '';

      if (filenameMatch !== null) {
        if (files.length + 1 > maxFiles) {
          const err = new Error('TOO_MANY_FILES');
          err.name = 'MultipartFileLimitError';
          throw err;
        }

        files.push({
          fieldName,
          originalName: filenameMatch[1],
          mimeType: (contentTypeMatch?.[1] ?? 'application/octet-stream').trim(),
          buffer: Buffer.from(partBody),
        });
      } else if (fieldName) {
        fieldCount += 1;
        if (fieldCount > maxFields) {
          const err = new Error('TOO_MANY_FIELDS');
          err.name = 'MultipartFieldLimitError';
          throw err;
        }
        fields[fieldName] = partBody.toString('utf8').trim();
      }
    }

    cursor = nextDelimiterIndex;
  }

  return { files, fields };
}

/**
 * Middleware de parsing `multipart/form-data` com limites estritos de memória, tamanho
 * de arquivo e quantidade de arquivos (Sprint 3 — Etapa 3.1).
 *
 * Proteções contra abuso de recursos:
 * - Verifica `Content-Type: multipart/form-data; boundary=...`.
 * - Monitora os chunks recebidos na stream e, assim que `receivedBytes` ultrapassa
 *   `maxFileSizeBytes + 64 KB`, libera imediatamente os buffers (`chunks.length = 0`),
 *   interrompe o recebimento (`req.pause()` / remoção de listener) e responde com
 *   HTTP `413 PDF_TOO_LARGE` imediatamente, sem aguardar o evento `end`.
 * - Trata `aborted` e `close` para liberar buffers em desconexões prematuras do cliente
 *   e evita respostas duplicadas quando a conexão já estiver encerrada.
 * - Limita estritamente a `maxFiles = 1` arquivo por requisição e `maxFields = 10`.
 */
export function createMultipartPdfUploadMiddleware(
  options: MultipartPdfUploadOptions = {}
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const maxFileSizeBytes =
      options.maxFileSizeBytes ??
      (Number(process.env.PDF_MAX_FILE_SIZE_BYTES) || DEFAULT_MAX_PDF_SIZE_BYTES);
    const maxFiles = options.maxFiles ?? 1;
    const maxFields = options.maxFields ?? 10;
    const maxStreamBytes = maxFileSizeBytes + MULTIPART_ENVELOPE_OVERHEAD_BYTES;
    const maxMb = (maxFileSizeBytes / (1024 * 1024)).toFixed(1);

    const boundary = extractMultipartBoundary(req.headers['content-type']);
    if (!boundary) {
      res.status(400).json({
        error: 'PDF_VALIDATION_ERROR',
        message:
          'Formato de envio inválido. Utilize multipart/form-data contendo o arquivo PDF.',
      });
      return;
    }

    const declaredLength = Number(req.headers['content-length']);
    if (Number.isFinite(declaredLength) && declaredLength > maxStreamBytes) {
      res.status(413).json({
        error: 'PDF_TOO_LARGE',
        message: `O arquivo PDF excede o tamanho máximo permitido de ${maxMb} MB.`,
      });
      return;
    }

    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    let streamLimitExceeded = false;
    let responded = false;
    let connectionTerminated = false;

    const clearBufferedChunks = (): void => {
      chunks.length = 0;
    };

    const detachListeners = (): void => {
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      req.removeListener('aborted', onAborted);
      req.removeListener('close', onClose);
    };

    const safeSendJson = (
      statusCode: number,
      payload: { error: string; message: string }
    ): void => {
      clearBufferedChunks();
      if (
        responded ||
        connectionTerminated ||
        res.headersSent ||
        res.writableEnded
      ) {
        return;
      }
      responded = true;
      res.status(statusCode).json(payload);
    };

    const onAborted = (): void => {
      connectionTerminated = true;
      clearBufferedChunks();
      detachListeners();
    };

    const onClose = (): void => {
      if (!req.complete) {
        connectionTerminated = true;
      }
      clearBufferedChunks();
      detachListeners();
    };

    const onError = (): void => {
      clearBufferedChunks();
      detachListeners();
      safeSendJson(400, {
        error: 'PDF_VALIDATION_ERROR',
        message: 'Falha na leitura do fluxo de upload do arquivo PDF.',
      });
    };

    const onData = (chunk: Buffer | string): void => {
      if (streamLimitExceeded || responded || connectionTerminated) {
        return;
      }

      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      receivedBytes += buf.byteLength;

      if (receivedBytes > maxStreamBytes) {
        streamLimitExceeded = true;
        clearBufferedChunks();
        detachListeners();
        try {
          req.pause();
          // Drena/descarta o restante do stream sem reter em memória para não travar o socket HTTP antes de a resposta 413 chegar ao cliente
          req.resume();
        } catch {
          // Ignora se o stream já estiver encerrado
        }
        safeSendJson(413, {
          error: 'PDF_TOO_LARGE',
          message: `O arquivo PDF excede o tamanho máximo permitido de ${maxMb} MB.`,
        });
        return;
      }

      chunks.push(buf);
    };

    const onEnd = (): void => {
      detachListeners();

      if (responded || connectionTerminated || streamLimitExceeded) {
        clearBufferedChunks();
        return;
      }

      try {
        const rawBody = Buffer.concat(chunks, receivedBytes);
        clearBufferedChunks();

        const parsed = parseBoundedMultipartBuffer(
          rawBody,
          boundary,
          maxFiles,
          maxFields
        );

        if (parsed.files.length === 0) {
          safeSendJson(400, {
            error: 'PDF_VALIDATION_ERROR',
            message: 'Nenhum arquivo PDF foi enviado no formulário multipart.',
          });
          return;
        }

        const uploadedFile = parsed.files[0];

        if (
          uploadedFile.fieldName !== 'file' &&
          uploadedFile.fieldName !== 'pdf'
        ) {
          safeSendJson(400, {
            error: 'PDF_VALIDATION_ERROR',
            message: 'O arquivo PDF deve ser enviado no campo "file".',
          });
          return;
        }

        if (uploadedFile.buffer.byteLength > maxFileSizeBytes) {
          safeSendJson(413, {
            error: 'PDF_TOO_LARGE',
            message: `O arquivo PDF excede o tamanho máximo permitido de ${maxMb} MB.`,
          });
          return;
        }

        const rawExamId = parsed.fields.examId?.trim();

        req.pdfUploadFile = {
          originalName: uploadedFile.originalName,
          mimeType: uploadedFile.mimeType,
          sizeBytes: uploadedFile.buffer.byteLength,
          buffer: uploadedFile.buffer,
          examId: rawExamId && rawExamId.length > 0 ? rawExamId : null,
        };

        // Preserva campos de texto no req.body, mas o controller jamais utiliza userId do cliente
        req.body = parsed.fields;
        next();
      } catch (err) {
        clearBufferedChunks();
        if (err instanceof Error && err.name === 'MultipartFileLimitError') {
          safeSendJson(400, {
            error: 'PDF_VALIDATION_ERROR',
            message: `Apenas ${maxFiles} arquivo PDF pode ser enviado por requisição.`,
          });
          return;
        }

        if (err instanceof Error && err.name === 'MultipartFieldLimitError') {
          safeSendJson(400, {
            error: 'PDF_VALIDATION_ERROR',
            message: 'Quantidade máxima de campos excedida no formulário multipart.',
          });
          return;
        }

        safeSendJson(400, {
          error: 'PDF_VALIDATION_ERROR',
          message: 'Corpo multipart/form-data malformado ou inválido.',
        });
      }
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('aborted', onAborted);
    req.on('close', onClose);
  };
}
