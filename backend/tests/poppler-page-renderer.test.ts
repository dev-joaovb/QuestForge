// @vitest-environment node

import { test, expect } from 'vitest';

import {
  PopplerPageRenderer,
  PNG_SIGNATURE,
} from '../src/utils/poppler-page-renderer';
import { buildRealPdfBuffer } from './helpers/pdf-test.helper';

test('renderiza uma página PDF real em PNG', async () => {
  const pdf = buildRealPdfBuffer({
    pageTexts: ['QuestForge OCR - Pagina de teste'],
  });

  const renderer = new PopplerPageRenderer();
  const png = await renderer.renderPage(pdf, {
    pageNumber: 1,
    dpi: 72,
  });

  expect(png.length).toBeGreaterThan(PNG_SIGNATURE.length);
  expect(
    png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE),
  ).toBe(true);
});

test('rejeita numero de pagina invalido', async () => {
  const pdf = buildRealPdfBuffer({
    pageTexts: ['QuestForge'],
  });

  const renderer = new PopplerPageRenderer();

  await expect(
    renderer.renderPage(pdf, { pageNumber: 0 }),
  ).rejects.toThrow('POPPLER_INVALID_PAGE_NUMBER');
});


test('rejeita renderizacao previamente cancelada', async () => {
  const pdf = buildRealPdfBuffer({
    pageTexts: ['QuestForge OCR'],
  });

  const controller = new AbortController();
  controller.abort();

  const renderer = new PopplerPageRenderer();

  await expect(
    renderer.renderPage(pdf, {
      pageNumber: 1,
      signal: controller.signal,
    }),
  ).rejects.toThrow('POPPLER_ABORTED');
});


test('cancela renderizacao em andamento', async () => {
  const pdf = buildRealPdfBuffer({
    pageTexts: ['QuestForge OCR - Cancelamento'],
  });

  const controller = new AbortController();
  const renderer = new PopplerPageRenderer();

  const rendering = renderer.renderPage(pdf, {
    pageNumber: 1,
    dpi: 200,
    signal: controller.signal,
  });

  controller.abort();

  await expect(rendering).rejects.toThrow('POPPLER_ABORTED');
});


test('interrompe renderizacao ao exceder timeout', async () => {
  const pdf = buildRealPdfBuffer({
    pageTexts: ['QuestForge OCR - Timeout'],
  });

  const renderer = new PopplerPageRenderer();

  await expect(
    renderer.renderPage(pdf, {
      pageNumber: 1,
      dpi: 200,
      timeoutMs: 1,
    }),
  ).rejects.toThrow('POPPLER_TIMEOUT');
});


test('rejeita documento PDF corrompido', async () => {
  const invalidPdf = Buffer.from(
    'Este arquivo nao possui uma estrutura PDF valida.',
    'utf8',
  );

  const renderer = new PopplerPageRenderer();

  await expect(
    renderer.renderPage(invalidPdf, {
      pageNumber: 1,
      dpi: 72,
      timeoutMs: 5_000,
    }),
  ).rejects.toThrow('POPPLER_EXECUTION_FAILED');
});


test('rejeita pagina inexistente no PDF', async () => {
  const pdf = buildRealPdfBuffer({
    pageTexts: ['QuestForge - Pagina unica'],
  });

  const renderer = new PopplerPageRenderer();

  await expect(
    renderer.renderPage(pdf, {
      pageNumber: 999,
      dpi: 72,
      timeoutMs: 5_000,
    }),
  ).rejects.toThrow('POPPLER_EXECUTION_FAILED');
});
