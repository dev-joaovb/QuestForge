import { describe, expect, it } from 'vitest';
import {
  extractQuestionsBodySchema,
  getMaxQuestionsAllowed,
  validateExtractQuestionsBody,
} from '../src/validators/pdf-document.validator.ts';
import {
  PdfDocumentDomainError,
  type ExtractQuestionsBodyDTO,
} from '../src/types/pdf-document.types.ts';
import { ABSOLUTE_MAX_EXTRACTED_QUESTIONS } from '../src/validators/ai-extraction.validator.ts';

describe('Sprint 4, Etapa 4.3 — Passo 1: Tipos e validadores de Documentos PDF', () => {
  describe('1. Códigos de erro de domínio estendidos', () => {
    it('deve aceitar os novos códigos DOCUMENT_NEEDS_OCR e DOCUMENT_NO_TEXT em PdfDocumentDomainError', () => {
      const ocrError = new PdfDocumentDomainError(
        'DOCUMENT_NEEDS_OCR',
        'O documento necessita de processamento por OCR.',
        422
      );
      expect(ocrError.code).toBe('DOCUMENT_NEEDS_OCR');
      expect(ocrError.statusCode).toBe(422);

      const noTextError = new PdfDocumentDomainError(
        'DOCUMENT_NO_TEXT',
        'O documento não possui texto extraível utilizável.',
        422
      );
      expect(noTextError.code).toBe('DOCUMENT_NO_TEXT');
      expect(noTextError.statusCode).toBe(422);
    });
  });

  describe('2. extractQuestionsBodySchema e validateExtractQuestionsBody', () => {
    it('deve validar corpo vazio ou undefined preservando campos omitidos sem inventar metadados', () => {
      const resultEmpty = validateExtractQuestionsBody({});
      expect(resultEmpty).toEqual({
        defaultSubject: undefined,
        defaultBoard: undefined,
        defaultExamTitle: undefined,
        defaultYear: undefined,
        maxQuestions: undefined,
      });

      const resultUndefined = validateExtractQuestionsBody(undefined);
      expect(resultUndefined).toEqual({
        defaultSubject: undefined,
        defaultBoard: undefined,
        defaultExamTitle: undefined,
        defaultYear: undefined,
        maxQuestions: undefined,
      });
    });

    it('deve aceitar payload completo válido e normalizar strings', () => {
      const input: ExtractQuestionsBodyDTO = {
        defaultSubject: '   Direito   Constitucional   ',
        defaultBoard: '  CEBRASPE  ',
        defaultExamTitle: ' Concurso   TRF 2025 ',
        defaultYear: 2025,
        maxQuestions: 40,
      };

      const parsed = validateExtractQuestionsBody(input);
      expect(parsed.defaultSubject).toBe('Direito Constitucional');
      expect(parsed.defaultBoard).toBe('CEBRASPE');
      expect(parsed.defaultExamTitle).toBe('Concurso TRF 2025');
      expect(parsed.defaultYear).toBe(2025);
      expect(parsed.maxQuestions).toBe(40);
    });

    it('deve normalizar strings vazias e placeholders genéricos para null', () => {
      const parsed = validateExtractQuestionsBody({
        defaultSubject: '   ',
        defaultBoard: 'N/A',
        defaultExamTitle: 'null',
        defaultYear: null,
      });

      expect(parsed.defaultSubject).toBeNull();
      expect(parsed.defaultBoard).toBeNull();
      expect(parsed.defaultExamTitle).toBeNull();
      expect(parsed.defaultYear).toBeNull();
    });

    it('não deve permitir que o cliente defina timeoutMs (rejeitado via .strict())', () => {
      expect(() =>
        validateExtractQuestionsBody({
          timeoutMs: 30000,
        })
      ).toThrow(PdfDocumentDomainError);

      try {
        validateExtractQuestionsBody({ timeoutMs: 30000 });
      } catch (err) {
        expect(err).toBeInstanceOf(PdfDocumentDomainError);
        const domainErr = err as PdfDocumentDomainError;
        expect(domainErr.code).toBe('PDF_VALIDATION_ERROR');
        expect(domainErr.statusCode).toBe(400);
        expect(domainErr.message).toMatch(/timeoutMs|não reconhecidas|unrecognized/i);
      }
    });

    it('deve rejeitar propriedades desconhecidas via .strict()', () => {
      expect(() =>
        validateExtractQuestionsBody({
          randomProperty: 'malicious-data',
        })
      ).toThrow(PdfDocumentDomainError);
    });

    it('deve validar limites máximos de caracteres das strings contextuais', () => {
      // defaultSubject max 120
      expect(() =>
        validateExtractQuestionsBody({
          defaultSubject: 'A'.repeat(121),
        })
      ).toThrow(PdfDocumentDomainError);

      // defaultBoard max 120
      expect(() =>
        validateExtractQuestionsBody({
          defaultBoard: 'B'.repeat(121),
        })
      ).toThrow(PdfDocumentDomainError);

      // defaultExamTitle max 200
      expect(() =>
        validateExtractQuestionsBody({
          defaultExamTitle: 'C'.repeat(201),
        })
      ).toThrow(PdfDocumentDomainError);
    });

    it('deve validar limites e integridade de defaultYear', () => {
      // Ano válido nos limites permitidos [1950, 2100]
      expect(validateExtractQuestionsBody({ defaultYear: 1950 }).defaultYear).toBe(1950);
      expect(validateExtractQuestionsBody({ defaultYear: 2100 }).defaultYear).toBe(2100);

      // Ano não inteiro
      expect(() => validateExtractQuestionsBody({ defaultYear: 2024.5 })).toThrow(
        PdfDocumentDomainError
      );

      // Ano menor que 1950
      expect(() => validateExtractQuestionsBody({ defaultYear: 1949 })).toThrow(
        PdfDocumentDomainError
      );

      // Ano maior que 2100
      expect(() => validateExtractQuestionsBody({ defaultYear: 2101 })).toThrow(
        PdfDocumentDomainError
      );

      // Tipo inválido (string ou boolean)
      expect(() => validateExtractQuestionsBody({ defaultYear: '2024' })).toThrow(
        PdfDocumentDomainError
      );
      expect(() => validateExtractQuestionsBody({ defaultYear: true })).toThrow(
        PdfDocumentDomainError
      );
    });

    it('deve validar integridade numérica de maxQuestions', () => {
      // Não inteiro
      expect(() => validateExtractQuestionsBody({ maxQuestions: 10.5 })).toThrow(
        PdfDocumentDomainError
      );

      // Menor ou igual a zero
      expect(() => validateExtractQuestionsBody({ maxQuestions: 0 })).toThrow(
        PdfDocumentDomainError
      );
      expect(() => validateExtractQuestionsBody({ maxQuestions: -5 })).toThrow(
        PdfDocumentDomainError
      );

      // Tipo incorreto
      expect(() => validateExtractQuestionsBody({ maxQuestions: '50' })).toThrow(
        PdfDocumentDomainError
      );
    });

    it('deve respeitar AI_MAX_QUESTIONS_PER_DOCUMENT e ABSOLUTE_MAX_EXTRACTED_QUESTIONS', () => {
      const prevEnv = process.env.AI_MAX_QUESTIONS_PER_DOCUMENT;

      try {
        process.env.AI_MAX_QUESTIONS_PER_DOCUMENT = '30';
        expect(getMaxQuestionsAllowed()).toBe(30);

        // Válido dentro do limite
        expect(validateExtractQuestionsBody({ maxQuestions: 30 }).maxQuestions).toBe(30);

        // Inválido acima do limite configurado
        expect(() => validateExtractQuestionsBody({ maxQuestions: 31 })).toThrow(
          PdfDocumentDomainError
        );

        // Teto absoluto de 500 mesmo se env for maior
        process.env.AI_MAX_QUESTIONS_PER_DOCUMENT = '9999';
        expect(getMaxQuestionsAllowed()).toBe(ABSOLUTE_MAX_EXTRACTED_QUESTIONS);

        expect(() =>
          validateExtractQuestionsBody({
            maxQuestions: ABSOLUTE_MAX_EXTRACTED_QUESTIONS + 1,
          })
        ).toThrow(PdfDocumentDomainError);
      } finally {
        if (prevEnv !== undefined) {
          process.env.AI_MAX_QUESTIONS_PER_DOCUMENT = prevEnv;
        } else {
          delete process.env.AI_MAX_QUESTIONS_PER_DOCUMENT;
        }
      }
    });
  });
});
