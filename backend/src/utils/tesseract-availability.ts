import { spawnSync } from 'node:child_process';

export interface TesseractAvailability {
  available: boolean;
  message: string;
}

export function checkTesseractAvailability(): TesseractAvailability {
  try {
    const result = spawnSync('tesseract', ['--list-langs'], {
      encoding: 'utf8',
      timeout: 3000,
      maxBuffer: 16 * 1024,
      shell: false,
    });

    if (result.error || result.status !== 0) {
      return {
        available: false,
        message: 'Executável Tesseract indisponível ou não operacional.',
      };
    }

    const languages = new Set(
      result.stdout.split(/\r?\n/).map((line) => line.trim())
    );

    if (!languages.has('por')) {
      return {
        available: false,
        message: 'Dados do idioma português (por) indisponíveis no Tesseract.',
      };
    }

    return {
      available: true,
      message: 'Tesseract operacional com suporte ao idioma português.',
    };
  } catch {
    return {
      available: false,
      message: 'Falha ao verificar as dependências do Tesseract.',
    };
  }
}
