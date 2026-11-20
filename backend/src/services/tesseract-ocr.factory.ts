import {
  ConfigurableOcrService,
  UnconfiguredOcrService,
  type IOcrService,
} from './ocr.service.ts';
import { checkTesseractAvailability } from '../utils/tesseract-availability.ts';
import { tesseractPageRecognizer } from '../utils/tesseract-page-recognizer.ts';

/**
 * Cria o provedor OCR padrão do QuestForge.
 * Não declara disponibilidade quando as dependências não estão instaladas.
 */
export function createDefaultOcrService(): IOcrService {
  const availability = checkTesseractAvailability();

  if (!availability.available) {
    return new UnconfiguredOcrService();
  }

  return new ConfigurableOcrService({
    providerName: 'tesseract',
    recognizer: tesseractPageRecognizer,
    awaitRecognizerTermination: true,
    defaultLanguage: 'por',
  });
}
