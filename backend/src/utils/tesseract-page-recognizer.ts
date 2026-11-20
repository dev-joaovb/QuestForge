import { spawn } from 'node:child_process';
import type { OcrPageRecognizerFn } from '../services/ocr.service.ts';

export const MAX_TESSERACT_OUTPUT_BYTES = 2 * 1024 * 1024;
export const MAX_TESSERACT_ERROR_BYTES = 4096;

const SUPPORTED_LANGUAGES = new Set([
  'por',
  'eng',
  'por+eng',
  'eng+por',
]);

export const tesseractPageRecognizer: OcrPageRecognizerFn = async (
  page,
  { signal, language }
) => {
  if (page.mimeType !== 'image/png') {
    throw new Error('TESSERACT_UNSUPPORTED_IMAGE_TYPE');
  }

  if (!Buffer.isBuffer(page.contentBuffer) || page.contentBuffer.length === 0) {
    throw new Error('TESSERACT_INVALID_IMAGE_BUFFER');
  }

  if (!SUPPORTED_LANGUAGES.has(language)) {
    throw new Error('TESSERACT_UNSUPPORTED_LANGUAGE');
  }

  if (signal.aborted) {
    throw new Error('TESSERACT_ABORTED');
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      'tesseract',
      ['stdin', 'stdout', '-l', language],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      }
    );

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let stderr = '';
    let settled = false;
    let failure: Error | null = null;

    const fail = (error: Error) => {
      if (settled || failure) return;
      failure = error;
      child.kill('SIGKILL');
      child.stdin.destroy();
    };

    const onAbort = () => fail(new Error('TESSERACT_ABORTED'));

    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
    };

    signal.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (chunk: Buffer) => {
      if (failure) return;

      totalBytes += chunk.length;

      if (totalBytes > MAX_TESSERACT_OUTPUT_BYTES) {
        fail(new Error('TESSERACT_OUTPUT_TOO_LARGE'));
        return;
      }

      chunks.push(chunk);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_TESSERACT_ERROR_BYTES) {
        stderr += chunk
          .toString('utf8')
          .slice(0, MAX_TESSERACT_ERROR_BYTES - stderr.length);
      }
    });

    child.stdin.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE') {
        fail(error);
      }
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
        reject(
          new Error(
            `TESSERACT_EXECUTION_FAILED: ${stderr.trim().slice(0, 512)}`
          )
        );
        return;
      }

      resolve({
        pageNumber: page.pageNumber,
        text: Buffer.concat(chunks, totalBytes).toString('utf8'),
        confidence: null,
      });
    });

    if (signal.aborted) {
      onAbort();
    }

    if (!failure) {
      child.stdin.end(page.contentBuffer);
    }
  });
};
