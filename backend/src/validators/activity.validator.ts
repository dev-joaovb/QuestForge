import { z } from 'zod';
import {
  type ListStudyActivitiesOptions,
  type StudyActivityType,
  StudyActivityDomainError,
} from '../types/activity.types.ts';

export const studyActivityTypeSchema = z.enum([
  'QUESTION',
  'SIMULATION',
  'EXAM',
]);

export const listActivitiesQuerySchema = z
  .object({
    limit: z.coerce
      .number()
      .int('O limite deve ser um número inteiro.')
      .min(1, 'O limite mínimo por página é 1.')
      .max(100, 'O limite máximo por página é 100.')
      .default(20),
    offset: z.coerce
      .number()
      .int('O deslocamento deve ser um número inteiro.')
      .min(0, 'O deslocamento (offset) não pode ser negativo.')
      .default(0),
    type: studyActivityTypeSchema.optional(),
    startDate: z
      .string()
      .trim()
      .refine(
        (val) => !isNaN(Date.parse(val)),
        'A data inicial (startDate) deve estar em formato ISO 8601 válido.'
      )
      .optional(),
    endDate: z
      .string()
      .trim()
      .refine(
        (val) => !isNaN(Date.parse(val)),
        'A data final (endDate) deve estar em formato ISO 8601 válido.'
      )
      .optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.startDate).getTime() <= new Date(data.endDate).getTime();
      }
      return true;
    },
    {
      message: 'A data inicial (startDate) não pode ser posterior à data final (endDate).',
      path: ['startDate'],
    }
  );

export type ListActivitiesQueryInput = z.infer<typeof listActivitiesQuerySchema>;

/**
 * Valida e converte os parâmetros de query para a consulta paginada de histórico.
 */
export function validateListActivitiesQuery(raw: unknown): ListStudyActivitiesOptions {
  const result = listActivitiesQuerySchema.safeParse(raw);
  if (!result.success) {
    throw new StudyActivityDomainError(
      'ACTIVITY_INVALID_INPUT',
      result.error.issues[0]?.message ?? 'Parâmetros de consulta de atividades inválidos.',
      400,
      result.error.issues
    );
  }

  const { limit, offset, type, startDate, endDate } = result.data;
  return {
    limit,
    offset,
    type: type as StudyActivityType | undefined,
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
  };
}
