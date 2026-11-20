// @vitest-environment node

import { expect, test } from 'vitest';

import { buildRealPdfBuffer } from './helpers/pdf-test.helper';
import { PopplerPageRenderer } from '../src/utils/poppler-page-renderer';
import { tesseractPageRecognizer } from '../src/utils/tesseract-page-recognizer';
import { createDefaultOcrService } from '../src/services/tesseract-ocr.factory';
import type { OcrPagePayload } from '../src/types/pdf-document.types';

async function createTestPage(): Promise<OcrPagePayload> {
  const pdf = buildRealPdfBuffer({
    pageTexts: ['QuestForge teste de reconhecimento OCR'],
  });

  const png = await new PopplerPageRenderer().renderPage(pdf, {
    pageNumber: 1,
    dpi: 200,
  });

  return {
    pageNumber: 1,
    totalPages: 1,
    contentBuffer: png,
    mimeType: 'image/png',
    cleanup() {},
  };
}

test('reconhece texto real de uma pagina PDF renderizada', async () => {
  const page = await createTestPage();

  const result = await tesseractPageRecognizer(page, {
    signal: new AbortController().signal,
    language: 'por+eng',
  });

  expect(result.pageNumber).toBe(1);
  expect(result.text).toContain('reconhecimento OCR');
  expect(result.text.trim().length).toBeGreaterThan(15);
});

test('rejeita tipo de imagem nao suportado', async () => {
  const page = await createTestPage();

  await expect(
    tesseractPageRecognizer(
      { ...page, mimeType: 'application/pdf' },
      { signal: new AbortController().signal, language: 'por' },
    ),
  ).rejects.toThrow('TESSERACT_UNSUPPORTED_IMAGE_TYPE');
});

test('rejeita buffer de imagem vazio', async () => {
  const page = await createTestPage();

  await expect(
    tesseractPageRecognizer(
      { ...page, contentBuffer: Buffer.alloc(0) },
      { signal: new AbortController().signal, language: 'por' },
    ),
  ).rejects.toThrow('TESSERACT_INVALID_IMAGE_BUFFER');
});

test('rejeita idioma nao permitido', async () => {
  const page = await createTestPage();

  await expect(
    tesseractPageRecognizer(page, {
      signal: new AbortController().signal,
      language: 'invalid',
    }),
  ).rejects.toThrow('TESSERACT_UNSUPPORTED_LANGUAGE');
});

test('rejeita cancelamento antecipado', async () => {
  const page = await createTestPage();
  const controller = new AbortController();
  controller.abort();

  await expect(
    tesseractPageRecognizer(page, {
      signal: controller.signal,
      language: 'por',
    }),
  ).rejects.toThrow('TESSERACT_ABORTED');
});

test('cancela reconhecimento em andamento', async () => {
  const page = await createTestPage();
  const controller = new AbortController();

  const recognition = tesseractPageRecognizer(page, {
    signal: controller.signal,
    language: 'por+eng',
  });

  controller.abort();

  await expect(recognition).rejects.toThrow('TESSERACT_ABORTED');
});

test('integra fabrica OCR com Tesseract real e limpa a pagina', async () => {
  const service = createDefaultOcrService();
  expect(service.isAvailable()).toBe(true);
  expect(service.getStatus().providerName).toBe('tesseract');

  const page = await createTestPage();
  let cleanupCount = 0;
  page.cleanup = () => {
    cleanupCount += 1;
  };

  const result = await service.extractTextFromPage(page, {
    language: 'por+eng',
    timeoutMs: 15000,
  });

  expect(result.pageNumber).toBe(1);
  expect(result.text).toContain('reconhecimento OCR');
  expect(cleanupCount).toBe(1);
});
