import {
  PdfDocumentDomainError,
  type OcrPagePayload,
  type PdfDigitalExtractionOptions,
  type PdfDigitalExtractionResult,
} from '../types/pdf-document.types.ts';

export const DEFAULT_MAX_PDF_PAGES = 150;
export const DEFAULT_PDF_EXTRACTION_TIMEOUT_MS = 15000;
export const DEFAULT_MIN_DIGITAL_CHARS_TOTAL = 20;
export const DEFAULT_MIN_DIGITAL_CHARS_PER_PAGE = 10;

export interface IPdfTextExtractor {
  extractDigitalText(
    buffer: Buffer,
    options?: Partial<PdfDigitalExtractionOptions>
  ): Promise<PdfDigitalExtractionResult>;
  createOcrPageStream?(
    buffer: Buffer,
    options?: Partial<PdfDigitalExtractionOptions>
  ): AsyncGenerator<OcrPagePayload, void, unknown>;
}

export interface PdfPageProxyLike {
  getTextContent(): Promise<{ items: Array<Record<string, unknown>> }>;
  getViewport?(params: { scale: number }): { width: number; height: number };
  cleanup(): void;
}

export interface PdfDocumentProxyLike {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageProxyLike>;
  destroy?(): Promise<void>;
}

export interface PdfLoadingTaskLike {
  promise: Promise<PdfDocumentProxyLike>;
  destroy(): Promise<void>;
}

export type PdfDocumentLoaderFn = (data: Uint8Array) => Promise<PdfLoadingTaskLike>;

/**
 * Normaliza o texto extraído de páginas PDF removendo caracteres nulos de controle
 * e compactando espaços repetidos sem destruir quebras de linha entre parágrafos.
 */
export function normalizeExtractedPdfText(raw: string): string {
  return raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function createAbortError(): Error {
  const err = new Error('Extração PDF abortada por limite de tempo.');
  err.name = 'PdfExtractionAbortError';
  return err;
}

export function raceWithSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(createAbortError());
    };

    signal.addEventListener('abort', onAbort, { once: true });

    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

function isPasswordProtectedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'PasswordException') return true;
  return /password|encrypted/i.test(error.message);
}

async function defaultPdfJsLoader(uint8Data: Uint8Array): Promise<PdfLoadingTaskLike> {
  const globalAny = globalThis as Record<string, unknown>;
  if (!globalAny.pdfjsWorker) {
    globalAny.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  }

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const loadingTask = pdfjs.getDocument({
    data: uint8Data,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });

  return loadingTask as unknown as PdfLoadingTaskLike;
}

/**
 * Extrator de texto digital e preparador de páginas para OCR baseado em `pdfjs-dist` (Sprint 3).
 *
 * Mecanismo de Cancelamento, Timeout e Liberação de Recursos:
 * - Utiliza `AbortController` acoplado a todas as fases assíncronas (`loadDocumentTask`,
 *   `loadingTask.promise`, `pdfDoc.getPage`, `page.getTextContent` e transições entre páginas).
 * - Quando o timeout (`timeoutMs`) dispara:
 *   1. Aciona `abortController.abort()`, interrompendo imediatamente a espera e a iteração de páginas.
 *   2. Invoca `destroyResources()`, que executa `activePage.cleanup()`, `pdfDoc.destroy()` e
 *      `loadingTask.destroy()` de forma serializada e idempotente (cada recurso é destruído no máximo 1 vez).
 *   3. Se o timeout disparar enquanto `loadDocumentTask()` ainda estiver em inicialização, o `loadingTask`
 *      é capturado assim que criado, aguardado e imediatamente destruído em `destroyResources()`.
 *   4. No bloco `finally`, aguarda a conclusão de `destroyResources()` antes de retornar/lançar ao
 *      `PdfDocumentService`, eliminando condições de corrida entre a destruição do documento e a
 *      atualização do status no banco de dados.
 */
export class PdfJsTextExtractor implements IPdfTextExtractor {
  private readonly loadDocumentTask: PdfDocumentLoaderFn;

  constructor(customLoader?: PdfDocumentLoaderFn) {
    this.loadDocumentTask = customLoader ?? defaultPdfJsLoader;
  }

  async extractDigitalText(
    buffer: Buffer,
    options?: Partial<PdfDigitalExtractionOptions>
  ): Promise<PdfDigitalExtractionResult> {
    if (!Buffer.isBuffer(buffer) || buffer.byteLength === 0) {
      throw new PdfDocumentDomainError(
        'PDF_VALIDATION_ERROR',
        'O arquivo PDF enviado está vazio (0 bytes).',
        400
      );
    }

    const maxPages =
      options?.maxPages ??
      (Number(process.env.PDF_MAX_PAGES) || DEFAULT_MAX_PDF_PAGES);
    const timeoutMs =
      options?.timeoutMs ??
      (Number(process.env.PDF_EXTRACTION_TIMEOUT_MS) ||
        DEFAULT_PDF_EXTRACTION_TIMEOUT_MS);
    const minDigitalCharsTotal =
      options?.minDigitalCharsTotal ?? DEFAULT_MIN_DIGITAL_CHARS_TOTAL;
    const minDigitalCharsPerPage =
      options?.minDigitalCharsPerPage ?? DEFAULT_MIN_DIGITAL_CHARS_PER_PAGE;

    const abortController = new AbortController();
    const { signal } = abortController;

    let timedOut = false;
    let timeoutHandle: NodeJS.Timeout | undefined;
    let inFlightLoaderPromise: Promise<PdfLoadingTaskLike | null> | null = null;
    let loadingTask: PdfLoadingTaskLike | null = null;
    let pdfDoc: PdfDocumentProxyLike | null = null;
    let activePage: PdfPageProxyLike | null = null;

    let docDestroyed = false;
    let taskDestroyed = false;
    let destroyChain: Promise<void> = Promise.resolve();

    const destroyResources = (): Promise<void> => {
      destroyChain = destroyChain.then(async () => {
        if (activePage) {
          const pageToClean = activePage;
          activePage = null;
          try {
            pageToClean.cleanup();
          } catch {
            // Ignora falha de cleanup em página já liberada
          }
        }

        // Se o timeout ou aborto disparou enquanto loadDocumentTask() ainda estava em curso,
        // aguarda a resolução da inicialização para destruir imediatamente o loadingTask criado.
        if (!loadingTask && inFlightLoaderPromise && (timedOut || signal.aborted)) {
          const lateTask = await inFlightLoaderPromise;
          if (lateTask && !loadingTask) {
            loadingTask = lateTask;
          }
        }

        if (pdfDoc && !docDestroyed) {
          docDestroyed = true;
          if (typeof pdfDoc.destroy === 'function') {
            try {
              await pdfDoc.destroy();
            } catch {
              // Ignora erro caso loadingTask.destroy já tenha encerrado o documento
            }
          }
        }

        if (loadingTask && !taskDestroyed) {
          taskDestroyed = true;
          try {
            await loadingTask.destroy();
          } catch {
            // Ignora erro de destruição durante aborto de worker
          }
        }
      });

      return destroyChain;
    };

    timeoutHandle = setTimeout(() => {
      timedOut = true;
      abortController.abort();
      // Inicia imediatamente a destruição serializada no instante do timeout
      void destroyResources();
    }, timeoutMs);

    try {
      // Cria cópia Uint8Array dedicada (pdfjs-dist rejeita instâncias diretas de Buffer/slab compartilhado)
      const uint8Data = new Uint8Array(buffer);

      const rawLoaderPromise = this.loadDocumentTask(uint8Data);
      inFlightLoaderPromise = rawLoaderPromise.then(
        (task) => {
          loadingTask = task;
          return task;
        },
        () => null
      );

      const resolvedTask = await raceWithSignal(rawLoaderPromise, signal);
      loadingTask = resolvedTask;

      try {
        pdfDoc = await raceWithSignal(loadingTask.promise, signal);
      } catch (openError) {
        if (timedOut || signal.aborted) {
          throw new PdfDocumentDomainError(
            'PDF_EXTRACTION_TIMEOUT',
            `O processamento do PDF excedeu o tempo limite de ${timeoutMs} ms.`,
            400
          );
        }

        throw new PdfDocumentDomainError(
          'PDF_EXTRACTION_FAILED',
          isPasswordProtectedError(openError)
            ? 'O arquivo PDF está protegido por senha e não pode ser processado.'
            : 'Não foi possível interpretar a estrutura interna do arquivo PDF.',
          400
        );
      }

      const pageCount = pdfDoc.numPages;

      if (pageCount <= 0) {
        throw new PdfDocumentDomainError(
          'PDF_VALIDATION_ERROR',
          'O documento PDF não possui páginas válidas.',
          400
        );
      }

      if (pageCount > maxPages) {
        throw new PdfDocumentDomainError(
          'PDF_PAGE_LIMIT_EXCEEDED',
          `O documento possui ${pageCount} páginas, excedendo o limite máximo de ${maxPages} páginas.`,
          400
        );
      }

      const pageTexts: string[] = [];
      const pagesNeedingOcr: number[] = [];

      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
        if (timedOut || signal.aborted) {
          throw new PdfDocumentDomainError(
            'PDF_EXTRACTION_TIMEOUT',
            `O processamento do PDF excedeu o tempo limite de ${timeoutMs} ms.`,
            400
          );
        }

        const page = await raceWithSignal(pdfDoc.getPage(pageNumber), signal);
        activePage = page;

        try {
          const textContent = await raceWithSignal(page.getTextContent(), signal);
          const itemsText = textContent.items
            .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
            .filter((str) => str.length > 0)
            .join(' ');

          const normalizedPage = normalizeExtractedPdfText(itemsText);
          const pageNonWhitespace = normalizedPage.replace(/\s+/g, '');

          if (pageNonWhitespace.length < minDigitalCharsPerPage) {
            pagesNeedingOcr.push(pageNumber);
          }

          if (normalizedPage.length > 0) {
            pageTexts.push(`[Página ${pageNumber}]\n${normalizedPage}`);
          }
        } finally {
          if (activePage === page) {
            activePage = null;
          }
          try {
            page.cleanup();
          } catch {
            // Ignora falha de cleanup individual
          }
        }
      }

      const combinedText = normalizeExtractedPdfText(pageTexts.join('\n\n'));
      const nonWhitespaceChars = combinedText
        .replace(/\[Página \d+\]/g, '')
        .replace(/\s+/g, '');

      if (nonWhitespaceChars.length < minDigitalCharsTotal) {
        return {
          pageCount,
          extractedText: null,
          extractedCharCount: 0,
          requiresOcr: true,
          classification: 'SCANNED_NEEDS_OCR',
          pagesNeedingOcr: Array.from({ length: pageCount }, (_, idx) => idx + 1),
        };
      }

      return {
        pageCount,
        extractedText: combinedText,
        extractedCharCount: combinedText.length,
        requiresOcr: false,
        classification: 'DIGITAL_TEXT',
        pagesNeedingOcr,
      };
    } catch (error) {
      if (timedOut || signal.aborted) {
        throw new PdfDocumentDomainError(
          'PDF_EXTRACTION_TIMEOUT',
          `O processamento do PDF excedeu o tempo limite de ${timeoutMs} ms.`,
          400
        );
      }

      if (error instanceof PdfDocumentDomainError) {
        throw error;
      }

      throw new PdfDocumentDomainError(
        'PDF_EXTRACTION_FAILED',
        'Falha ao extrair o texto digital das páginas do PDF.',
        400
      );
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      abortController.abort();
      // Aguarda a destruição efetiva e idempotente do documento e do worker (inclusive se
      // loadDocumentTask estava em inicialização quando o timeout disparou) antes de retornar ao serviço.
      await destroyResources();
    }
  }

  /**
   * Prepara e fornece páginas sob demanda (uma por vez) para o pipeline de OCR (`IOcrService`),
   * respeitando `maxPages` e `timeoutMs`, sem carregar todas as páginas na memória simultaneamente
   * e garantindo limpeza de cada página (`page.cleanup()` + buffer temporário) e destruição do
   * documento/worker PDF.js no bloco `finally`.
   */
  async *createOcrPageStream(
    buffer: Buffer,
    options?: Partial<PdfDigitalExtractionOptions>
  ): AsyncGenerator<OcrPagePayload, void, unknown> {
    if (!Buffer.isBuffer(buffer) || buffer.byteLength === 0) {
      throw new PdfDocumentDomainError(
        'PDF_VALIDATION_ERROR',
        'O arquivo PDF enviado está vazio (0 bytes).',
        400
      );
    }

    const maxPages =
      options?.maxPages ??
      (Number(process.env.PDF_MAX_PAGES) || DEFAULT_MAX_PDF_PAGES);
    const timeoutMs =
      options?.timeoutMs ??
      (Number(process.env.PDF_EXTRACTION_TIMEOUT_MS) ||
        DEFAULT_PDF_EXTRACTION_TIMEOUT_MS);

    const abortController = new AbortController();
    const { signal } = abortController;

    let timedOut = false;
    let timeoutHandle: NodeJS.Timeout | undefined;
    let inFlightLoaderPromise: Promise<PdfLoadingTaskLike | null> | null = null;
    let loadingTask: PdfLoadingTaskLike | null = null;
    let pdfDoc: PdfDocumentProxyLike | null = null;
    let activePage: PdfPageProxyLike | null = null;

    let docDestroyed = false;
    let taskDestroyed = false;
    let destroyChain: Promise<void> = Promise.resolve();

    const destroyResources = (): Promise<void> => {
      destroyChain = destroyChain.then(async () => {
        if (activePage) {
          const pageToClean = activePage;
          activePage = null;
          try {
            pageToClean.cleanup();
          } catch {
            // Ignora falha de cleanup em página já liberada
          }
        }

        if (!loadingTask && inFlightLoaderPromise && (timedOut || signal.aborted)) {
          const lateTask = await inFlightLoaderPromise;
          if (lateTask && !loadingTask) {
            loadingTask = lateTask;
          }
        }

        if (pdfDoc && !docDestroyed) {
          docDestroyed = true;
          if (typeof pdfDoc.destroy === 'function') {
            try {
              await pdfDoc.destroy();
            } catch {
              // Ignora erro caso loadingTask.destroy já tenha encerrado o documento
            }
          }
        }

        if (loadingTask && !taskDestroyed) {
          taskDestroyed = true;
          try {
            await loadingTask.destroy();
          } catch {
            // Ignora erro de destruição durante aborto de worker
          }
        }
      });

      return destroyChain;
    };

    timeoutHandle = setTimeout(() => {
      timedOut = true;
      abortController.abort();
      void destroyResources();
    }, timeoutMs);

    try {
      const uint8Data = new Uint8Array(buffer);

      const rawLoaderPromise = this.loadDocumentTask(uint8Data);
      inFlightLoaderPromise = rawLoaderPromise.then(
        (task) => {
          loadingTask = task;
          return task;
        },
        () => null
      );

      const resolvedTask = await raceWithSignal(rawLoaderPromise, signal);
      loadingTask = resolvedTask;

      try {
        pdfDoc = await raceWithSignal(loadingTask.promise, signal);
      } catch (openError) {
        if (timedOut || signal.aborted) {
          throw new PdfDocumentDomainError(
            'PDF_EXTRACTION_TIMEOUT',
            `O processamento do PDF excedeu o tempo limite de ${timeoutMs} ms.`,
            400
          );
        }

        throw new PdfDocumentDomainError(
          'PDF_EXTRACTION_FAILED',
          isPasswordProtectedError(openError)
            ? 'O arquivo PDF está protegido por senha e não pode ser processado.'
            : 'Não foi possível interpretar a estrutura interna do arquivo PDF.',
          400
        );
      }

      const pageCount = pdfDoc.numPages;

      if (pageCount <= 0) {
        throw new PdfDocumentDomainError(
          'PDF_VALIDATION_ERROR',
          'O documento PDF não possui páginas válidas.',
          400
        );
      }

      if (pageCount > maxPages) {
        throw new PdfDocumentDomainError(
          'PDF_PAGE_LIMIT_EXCEEDED',
          `O documento possui ${pageCount} páginas, excedendo o limite máximo de ${maxPages} páginas.`,
          400
        );
      }

      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
        if (timedOut || signal.aborted) {
          throw new PdfDocumentDomainError(
            'PDF_EXTRACTION_TIMEOUT',
            `O processamento do PDF excedeu o tempo limite de ${timeoutMs} ms.`,
            400
          );
        }

        const page = await raceWithSignal(pdfDoc.getPage(pageNumber), signal);
        activePage = page;

        // Extrai metadados leves da página e aloca apenas um descritor temporário por página
        const viewport =
          typeof page.getViewport === 'function'
            ? page.getViewport({ scale: 1.0 })
            : { width: 612, height: 792 };

        const singlePageDescriptorBuffer = Buffer.from(
          JSON.stringify({
            pageNumber,
            totalPages: pageCount,
            width: Math.round(viewport.width),
            height: Math.round(viewport.height),
          }),
          'utf8'
        );

        let pageCleaned = false;
        const cleanupCurrentPage = () => {
          if (pageCleaned) return;
          pageCleaned = true;
          singlePageDescriptorBuffer.fill(0);
          if (activePage === page) {
            activePage = null;
          }
          try {
            page.cleanup();
          } catch {
            // Ignora falha de cleanup individual
          }
        };

        try {
          yield {
            pageNumber,
            totalPages: pageCount,
            contentBuffer: singlePageDescriptorBuffer,
            mimeType: 'application/pdf',
            width: Math.round(viewport.width),
            height: Math.round(viewport.height),
            cleanup: cleanupCurrentPage,
          };
        } finally {
          cleanupCurrentPage();
        }
      }
    } catch (error) {
      if (timedOut || signal.aborted) {
        throw new PdfDocumentDomainError(
          'PDF_EXTRACTION_TIMEOUT',
          `O processamento do PDF excedeu o tempo limite de ${timeoutMs} ms.`,
          400
        );
      }

      if (error instanceof PdfDocumentDomainError) {
        throw error;
      }

      throw new PdfDocumentDomainError(
        'PDF_EXTRACTION_FAILED',
        'Falha ao preparar páginas do PDF para processamento de OCR.',
        400
      );
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      abortController.abort();
      await destroyResources();
    }
  }
}
