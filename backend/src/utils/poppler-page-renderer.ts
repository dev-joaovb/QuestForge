/**
 * Renderização de páginas PDF em PNG usando Poppler (pdftoppm).
 *
 * O renderizador recebe o PDF original e produz somente a página solicitada.
 * A implementação concreta deverá limitar memória, tempo e subprocessos.
 */

import { spawn } from 'node:child_process';

export interface PopplerRenderOptions {
  pageNumber: number;
  dpi?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface IPdfPageRenderer {
  renderPage(pdfBuffer: Buffer, options: PopplerRenderOptions): Promise<Buffer>;
}

export const DEFAULT_POPPLER_DPI = 150;
export const MAX_POPPLER_DPI = 200;
export const MAX_POPPLER_PNG_BYTES = 20 * 1024 * 1024;
export const DEFAULT_POPPLER_TIMEOUT_MS = 15_000;

export const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);


/**
 * Renderizador nativo de páginas PDF.
 *
 * Não utiliza shell nem arquivos temporários.
 * O PDF é transmitido pelo stdin e o PNG é recebido pelo stdout.
 */
export class PopplerPageRenderer implements IPdfPageRenderer {
  async renderPage(
    pdfBuffer: Buffer,
    options: PopplerRenderOptions,
  ): Promise<Buffer> {
    const { pageNumber, signal } = options;

    if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
      throw new Error('POPPLER_INVALID_PDF_BUFFER');
    }

    if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) {
      throw new Error('POPPLER_INVALID_PAGE_NUMBER');
    }

    const dpi = options.dpi ?? DEFAULT_POPPLER_DPI;
    const timeoutMs = options.timeoutMs ?? DEFAULT_POPPLER_TIMEOUT_MS;

    if (!Number.isSafeInteger(dpi) || dpi < 1 || dpi > MAX_POPPLER_DPI) {
      throw new Error('POPPLER_INVALID_DPI');
    }

    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
      throw new Error('POPPLER_INVALID_TIMEOUT');
    }

    if (signal?.aborted) {
      throw new Error('POPPLER_ABORTED');
    }

    return new Promise<Buffer>((resolve, reject) => {
      const args = [
        '-f', String(pageNumber),
        '-l', String(pageNumber),
        '-singlefile',
        '-png',
        '-r', String(dpi),
        '-',
      ];

      const child = spawn('pdftoppm', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let settled = false;
      let failure: Error | undefined;

      const fail = (error: Error) => {
        if (settled) return;
        failure ??= error;
        child.kill('SIGKILL');
      };

      const onAbort = () => fail(new Error('POPPLER_ABORTED'));

      const timer = setTimeout(
        () => fail(new Error('POPPLER_TIMEOUT')),
        timeoutMs,
      );

      signal?.addEventListener('abort', onAbort, { once: true });

      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      };

      child.stdout.on('data', (chunk: Buffer) => {
        if (failure) return;

        totalBytes += chunk.length;

        if (totalBytes > MAX_POPPLER_PNG_BYTES) {
          fail(new Error('POPPLER_OUTPUT_TOO_LARGE'));
          return;
        }

        chunks.push(chunk);
      });

      let stderr = '';

      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < 4096) {
          stderr += chunk.toString('utf8').slice(0, 4096 - stderr.length);
        }
      });

      child.stdin.on('error', (error: NodeJS.ErrnoException) => {
        // O processo pode fechar stdin antes de consumir o PDF.
        // Nesse caso, o evento 'close' determinará se houve falha.
        if (error.code === 'EPIPE') {
          return;
        }

        fail(error);
      });

      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(failure ?? error);
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        cleanup();

        if (failure) {
          reject(failure);
          return;
        }

        if (code !== 0) {
          reject(new Error(
            `POPPLER_EXECUTION_FAILED: ${stderr.trim().slice(0, 512)}`,
          ));
          return;
        }

        const png = Buffer.concat(chunks, totalBytes);

        if (
          png.length < PNG_SIGNATURE.length ||
          !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
        ) {
          reject(new Error('POPPLER_INVALID_PNG_OUTPUT'));
          return;
        }

        resolve(png);
      });

      if (signal?.aborted) {
        onAbort();
      }

      if (!failure) {
        child.stdin.end(pdfBuffer);
      } else {
        child.stdin.destroy();
      }
    });
  }
}
