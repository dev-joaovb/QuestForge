import { z } from 'zod';
import { EducationalAiDomainError } from '../types/educational-ai.types.ts';

/**
 * Esquema estrito para a consulta de análise educacional (Sprint 9.3).
 * Não aceita nenhum parâmetro na query string (ex: userId, forceFallback, model, etc.),
 * prevenindo tentativas de spoofing, injeção de parâmetros ou ambiguidades.
 */
export const educationalAiAnalysisQuerySchema = z.object({}).strict();

/**
 * Esquema estrito para o corpo da requisição GET (não deve conter parâmetros).
 */
export const educationalAiAnalysisBodySchema = z.union([
  z.undefined(),
  z.null(),
  z.object({}).strict(),
]);

/**
 * Valida que a query string da requisição não contém parâmetros não autorizados.
 */
export function validateEducationalAiAnalysisQuery(rawQuery: unknown): void {
  const result = educationalAiAnalysisQuerySchema.safeParse(rawQuery);
  if (!result.success) {
    throw new EducationalAiDomainError(
      'EDUCATIONAL_AI_INVALID_INPUT',
      'O endpoint de análise educacional não aceita parâmetros de consulta (query string).',
      400,
      result.error.issues
    );
  }
}

/**
 * Valida que o corpo da requisição (se fornecido) não contém dados ou parâmetros arbitrários.
 */
export function validateEducationalAiAnalysisBody(rawBody: unknown): void {
  if (rawBody === undefined || rawBody === null) return;
  const result = educationalAiAnalysisBodySchema.safeParse(rawBody);
  if (!result.success) {
    throw new EducationalAiDomainError(
      'EDUCATIONAL_AI_INVALID_INPUT',
      'O endpoint de análise educacional não aceita parâmetros no corpo da requisição.',
      400,
      result.error.issues
    );
  }
}
