// @vitest-environment node

import { expect, test } from 'vitest';
import { ConfigurableOcrService } from '../src/services/ocr.service';
import type { OcrPagePayload } from '../src/types/pdf-document.types';

test('timeout interno cancela reconhecedor mesmo com sinal externo', async () => {
  const externalController = new AbortController();
  let receivedSignal: AbortSignal | undefined;
  let cleaned = false;

  const page: OcrPagePayload = {
    pageNumber: 1,
    totalPages: 1,
    contentBuffer: Buffer.from('test'),
    mimeType: 'image/png',
    cleanup() {
      cleaned = true;
    },
  };

  const service = new ConfigurableOcrService({
    timeoutMs: 20,
    recognizer: async (_page, { signal }) => {
      receivedSignal = signal;

      return new Promise((_resolve, reject) => {
        if (signal.aborted) {
          reject(new Error('RECOGNIZER_ABORTED'));
          return;
        }

        signal.addEventListener(
          'abort',
          () => reject(new Error('RECOGNIZER_ABORTED')),
          { once: true },
        );
      });
    },
  });

  await expect(
    service.extractTextFromPage(page, {
      signal: externalController.signal,
    }),
  ).rejects.toMatchObject({
    code: 'OCR_EXTRACTION_TIMEOUT',
  });

  expect(receivedSignal?.aborted).toBe(true);
  expect(externalController.signal.aborted).toBe(false);
  expect(cleaned).toBe(true);
});

test('cancelamento externo interrompe OCR de documento', async () => {
  const controller = new AbortController();
  let receivedSignal: AbortSignal | undefined;
  let cleaned = false;

  const page: OcrPagePayload = {
    pageNumber: 1,
    totalPages: 1,
    contentBuffer: Buffer.from('test'),
    mimeType: 'image/png',
    cleanup() {
      cleaned = true;
    },
  };

  const service = new ConfigurableOcrService({
    timeoutMs: 10_000,
    recognizer: async (_page, { signal }) => {
      receivedSignal = signal;

      return new Promise((_resolve, reject) => {
        if (signal.aborted) {
          reject(new Error('RECOGNIZER_ABORTED'));
          return;
        }

        signal.addEventListener(
          'abort',
          () => reject(new Error('RECOGNIZER_ABORTED')),
          { once: true },
        );
      });
    },
  });

  const extraction = service.extractTextFromDocumentPages(
    [page],
    { signal: controller.signal },
  );

  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  controller.abort();

  await expect(extraction).rejects.toMatchObject({
    code: 'OCR_EXTRACTION_TIMEOUT',
  });

  expect(receivedSignal?.aborted).toBe(true);
  expect(cleaned).toBe(true);
});

test('aguarda encerramento do reconhecedor antes de limpar a pagina', async () => {
  let recognizerClosed = false;
  let cleanupBeforeClose = false;

  const page: OcrPagePayload = {
    pageNumber: 1,
    totalPages: 1,
    contentBuffer: Buffer.from('test'),
    mimeType: 'image/png',
    cleanup() {
      cleanupBeforeClose = !recognizerClosed;
    },
  };

  const service = new ConfigurableOcrService({
    timeoutMs: 20,
    awaitRecognizerTermination: true,
    recognizer: async (_page, { signal }) =>
      new Promise((_resolve, reject) => {
        const finish = () => {
          setTimeout(() => {
            recognizerClosed = true;
            reject(new Error('RECOGNIZER_ABORTED'));
          }, 30);
        };

        if (signal.aborted) {
          finish();
        } else {
          signal.addEventListener('abort', finish, { once: true });
        }
      }),
  });

  await expect(
    service.extractTextFromPage(page),
  ).rejects.toMatchObject({
    code: 'OCR_EXTRACTION_TIMEOUT',
  });

  expect(recognizerClosed).toBe(true);
  expect(cleanupBeforeClose).toBe(false);
});
