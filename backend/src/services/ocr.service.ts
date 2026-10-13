import {
  PdfDocumentDomainError,
  type OcrDocumentExtractionResult,
  type OcrExtractionOptions,
  type OcrPageExtractionResult,
  type OcrPagePayload,
  type OcrServiceStatus,
} from '../types/pdf-document.types.ts';
import {
  DEFAULT_MAX_PDF_PAGES,
  DEFAULT_PDF_EXTRACTION_TIMEOUT_MS,
  normalizeExtractedPdfText,
  raceWithSignal,
} from '../utils/pdf-extractor.ts';

/**
 * Contrato desacoplado do serviço de OCR (Sprint 3 — Etapa 3.3).
 *
 * Permite que qualquer motor de OCR real (local ou externo) seja integrado
 * posteriormente sem reescrever `PdfDocumentService`, recebendo páginas sob demanda
 * (uma por vez) e retornando texto estruturado por página e consolidado.
 */
export interface IOcrService {
  isAvailable(): boolean;
  getStatus(): OcrServiceStatus;
  extractTextFromPage(
    page: OcrPagePayload,
    options?: Partial<OcrExtractionOptions>
  ): Promise<OcrPageExtractionResult>;
  extractTextFromDocumentPages(
    pages: AsyncIterable<OcrPagePayload> | Iterable<OcrPagePayload>,
    options?: Partial<OcrExtractionOptions>
  ): Promise<OcrDocumentExtractionResult>;
}

export type OcrPageRecognizerFn = (
  page: OcrPagePayload,
  context: { signal: AbortSignal; language: string }
) => Promise<OcrPageExtractionResult>;

export interface ConfigurableOcrServiceOptions {
  providerName?: string;
  recognizer?: OcrPageRecognizerFn;
  defaultLanguage?: string;
  maxPages?: number;
  timeoutMs?: number;
}

/**
 * Implementação padrão honesta quando nenhum provedor de OCR concreto está configurado.
 *
 * Regras de integridade (Etapa 3.3):
 * - Nunca inventa nem retorna texto fictício.
 * - Informa explicitamente que o OCR não está disponível (`503 OCR_UNAVAILABLE`).
 * - Garante a execução de `page.cleanup()` caso uma página tenha sido aberta antes da chamada.
 */
export class UnconfiguredOcrService implements IOcrService {
  isAvailable(): boolean {
    return false;
  }

  getStatus(): OcrServiceStatus {
    return {
      available: false,
      providerName: 'unconfigured',
      message:
        'Processamento de OCR indisponível: nenhum provedor de OCR concreto está configurado no servidor.',
    };
  }

  async extractTextFromPage(page: OcrPagePayload): Promise<OcrPageExtractionResult> {
    try {
      throw new PdfDocumentDomainError(
        'OCR_UNAVAILABLE',
        'Processamento de OCR indisponível: nenhum provedor de OCR concreto está configurado no servidor.',
        503
      );
    } finally {
      await page.cleanup();
    }
  }

  async extractTextFromDocumentPages(
    pages: AsyncIterable<OcrPagePayload> | Iterable<OcrPagePayload>
  ): Promise<OcrDocumentExtractionResult> {
    // Se um iterador/gerador foi passado, garante seu encerramento limpo sem consumir todas as páginas
    const asyncIterator =
      Symbol.asyncIterator in pages
        ? (pages as AsyncIterable<OcrPagePayload>)[Symbol.asyncIterator]()
        : null;

    try {
      throw new PdfDocumentDomainError(
        'OCR_UNAVAILABLE',
        'Processamento de OCR indisponível: nenhum provedor de OCR concreto está configurado no servidor.',
        503
      );
    } finally {
      if (asyncIterator && typeof asyncIterator.return === 'function') {
        try {
          await asyncIterator.return(undefined);
        } catch {
          // Ignora falha secundária ao fechar gerador
        }
      }
    }
  }
}

/**
 * Executor do pipeline de OCR página a página com controle estrito de memória,
 * limite de páginas (`PDF_MAX_PAGES`), timeout (`PDF_EXTRACTION_TIMEOUT_MS`) e
 * limpeza garantida de recursos temporários em cada página.
 */
export class ConfigurableOcrService implements IOcrService {
  private readonly providerName: string;
  private readonly recognizer?: OcrPageRecognizerFn;
  private readonly defaultLanguage: string;
  private readonly defaultMaxPages: number;
  private readonly defaultTimeoutMs: number;

  constructor(options: ConfigurableOcrServiceOptions = {}) {
    this.providerName = options.providerName ?? (options.recognizer ? 'custom-ocr' : 'unconfigured');
    this.recognizer = options.recognizer;
    this.defaultLanguage = options.defaultLanguage ?? 'por';
    this.defaultMaxPages =
      options.maxPages ??
      (Number(process.env.PDF_MAX_PAGES) || DEFAULT_MAX_PDF_PAGES);
    this.defaultTimeoutMs =
      options.timeoutMs ??
      (Number(process.env.PDF_EXTRACTION_TIMEOUT_MS) ||
        DEFAULT_PDF_EXTRACTION_TIMEOUT_MS);
  }

  isAvailable(): boolean {
    return typeof this.recognizer === 'function';
  }

  getStatus(): OcrServiceStatus {
    if (!this.isAvailable()) {
      return {
        available: false,
        providerName: 'unconfigured',
        message:
          'Processamento de OCR indisponível: nenhum provedor de OCR concreto está configurado no servidor.',
      };
    }

    return {
      available: true,
      providerName: this.providerName,
      message: `Serviço de OCR configurado com o provedor "${this.providerName}".`,
    };
  }

  async extractTextFromPage(
    page: OcrPagePayload,
    options?: Partial<OcrExtractionOptions>
  ): Promise<OcrPageExtractionResult> {
    if (!this.recognizer) {
      try {
        throw new PdfDocumentDomainError(
          'OCR_UNAVAILABLE',
          'Processamento de OCR indisponível: nenhum provedor de OCR concreto está configurado no servidor.',
          503
        );
      } finally {
        await page.cleanup();
      }
    }

    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const language = options?.language ?? this.defaultLanguage;
    const abortController = new AbortController();
    const signal = options?.signal ?? abortController.signal;

    let timedOut = false;
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      abortController.abort();
    }, timeoutMs);

    try {
      const result = await raceWithSignal(
        this.recognizer(page, { signal, language }),
        signal
      );

      return {
        pageNumber: page.pageNumber,
        text: normalizeExtractedPdfText(result.text || ''),
        confidence: result.confidence ?? null,
      };
    } catch (error) {
      if (timedOut || signal.aborted) {
        throw new PdfDocumentDomainError(
          'OCR_EXTRACTION_TIMEOUT',
          `O processamento de OCR excedeu o tempo limite de ${timeoutMs} ms.`,
          400
        );
      }

      if (error instanceof PdfDocumentDomainError) {
        throw error;
      }

      throw new PdfDocumentDomainError(
        'OCR_EXTRACTION_FAILED',
        `Falha ao processar OCR na página ${page.pageNumber}.`,
        400
      );
    } finally {
      clearTimeout(timeoutHandle);
      await page.cleanup();
    }
  }

  async extractTextFromDocumentPages(
    pages: AsyncIterable<OcrPagePayload> | Iterable<OcrPagePayload>,
    options?: Partial<OcrExtractionOptions>
  ): Promise<OcrDocumentExtractionResult> {
    if (!this.recognizer) {
      const unconfigured = new UnconfiguredOcrService();
      return unconfigured.extractTextFromDocumentPages(pages);
    }

    const maxPages = options?.maxPages ?? this.defaultMaxPages;
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const language = options?.language ?? this.defaultLanguage;

    const abortController = new AbortController();
    const signal = abortController.signal;

    let timedOut = false;
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      abortController.abort();
    }, timeoutMs);

    const extractedPages: OcrPageExtractionResult[] = [];
    const formattedPageBlocks: string[] = [];
    let totalPagesDeclared = 0;

    try {
      for await (const page of pages) {
        try {
          if (timedOut || signal.aborted) {
            throw new PdfDocumentDomainError(
              'OCR_EXTRACTION_TIMEOUT',
              `O processamento de OCR excedeu o tempo limite de ${timeoutMs} ms.`,
              400
            );
          }

          if (page.totalPages > maxPages || extractedPages.length + 1 > maxPages) {
            throw new PdfDocumentDomainError(
              'PDF_PAGE_LIMIT_EXCEEDED',
              `O documento excede o limite máximo de ${maxPages} páginas para processamento de OCR.`,
              400
            );
          }

          totalPagesDeclared = Math.max(totalPagesDeclared, page.totalPages);

          const pageResult = await raceWithSignal(
            this.recognizer(page, { signal, language }),
            signal
          );

          const normalizedPageText = normalizeExtractedPdfText(pageResult.text || '');
          extractedPages.push({
            pageNumber: page.pageNumber,
            text: normalizedPageText,
            confidence: pageResult.confidence ?? null,
          });

          if (normalizedPageText.length > 0) {
            formattedPageBlocks.push(`[Página ${page.pageNumber}]\n${normalizedPageText}`);
          }
        } finally {
          // Libera imediatamente os recursos e o buffer temporário da página atual antes de avançar
          await page.cleanup();
        }
      }

      const combinedText = normalizeExtractedPdfText(formattedPageBlocks.join('\n\n'));
      const nonWhitespace = combinedText
        .replace(/\[Página \d+\]/g, '')
        .replace(/\s+/g, '');

      if (nonWhitespace.length === 0) {
        throw new PdfDocumentDomainError(
          'OCR_EXTRACTION_FAILED',
          'O processamento de OCR não encontrou texto legível nas páginas digitalizadas.',
          400
        );
      }

      return {
        providerName: this.providerName,
        pageCount: totalPagesDeclared || extractedPages.length,
        processedPages: extractedPages.length,
        extractedText: combinedText,
        extractedCharCount: combinedText.length,
        pages: extractedPages,
      };
    } catch (error) {
      if (timedOut || signal.aborted) {
        throw new PdfDocumentDomainError(
          'OCR_EXTRACTION_TIMEOUT',
          `O processamento de OCR excedeu o tempo limite de ${timeoutMs} ms.`,
          400
        );
      }

      if (error instanceof PdfDocumentDomainError) {
        throw error;
      }

      throw new PdfDocumentDomainError(
        'OCR_EXTRACTION_FAILED',
        'Falha durante a extração de texto via OCR.',
        400
      );
    } finally {
      clearTimeout(timeoutHandle);
      abortController.abort();
    }
  }
}
