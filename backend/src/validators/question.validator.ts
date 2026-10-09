import { z } from 'zod';

/**
 * Validadores de entrada para o Banco de Questões (Sprint 2 — Etapa 2.1).
 *
 * Regras de consistência:
 * - `difficulty` é estritamente opcional/nullable (nunca preenchida com valor artificial).
 * - `correctAnswer` e `explanation` são opcionais/nullable (permite cadastrar questões sem gabarito definido).
 * - Letras das alternativas são normalizadas para maiúsculas (`A`, `B`, `C`, etc.) e não podem se repetir.
 * - Se `correctAnswer` for informada e a questão possuir alternativas, `correctAnswer` deve corresponder
 *   exatamente a uma das letras presentes em `alternatives`.
 */

export const questionTypeSchema = z.enum(['MULTIPLE_CHOICE', 'TRUE_FALSE']);
export const questionDifficultySchema = z.enum(['EASY', 'MEDIUM', 'HARD']);
export const questionStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'NEEDS_REVIEW', 'ARCHIVED']);

export const alternativeInputSchema = z.object({
  letter: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, 'A letra da alternativa é obrigatória.')
    .max(8, 'O identificador da alternativa deve ter no máximo 8 caracteres.')
    .regex(/^[A-Z0-9]+$/, 'A letra da alternativa deve conter apenas caracteres alfanuméricos.'),
  text: z
    .string()
    .trim()
    .min(1, 'O texto da alternativa não pode estar vazio.')
    .max(4000, 'O texto da alternativa deve ter no máximo 4000 caracteres.'),
});

function validateAlternativesConsistency(
  alternatives: Array<{ letter: string; text: string }> | undefined,
  correctAnswer: string | null | undefined,
  ctx: z.RefinementCtx
) {
  if (alternatives && alternatives.length > 0) {
    if (alternatives.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['alternatives'],
        message: 'Quando informadas, a questão deve possuir pelo menos 2 alternativas.',
      });
      return;
    }

    if (alternatives.length > 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['alternatives'],
        message: 'A questão pode possuir no máximo 10 alternativas.',
      });
      return;
    }

    const seenLetters = new Set<string>();
    for (const alt of alternatives) {
      if (seenLetters.has(alt.letter)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['alternatives'],
          message: `Alternativa duplicada encontrada para a letra "${alt.letter}".`,
        });
        return;
      }
      seenLetters.add(alt.letter);
    }

    if (correctAnswer && !seenLetters.has(correctAnswer)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['correctAnswer'],
        message: `A resposta correta "${correctAnswer}" não corresponde a nenhuma das alternativas fornecidas.`,
      });
    }
  }
}

export const createQuestionSchema = z
  .object({
    statement: z
      .string()
      .trim()
      .min(5, 'O enunciado deve possuir pelo menos 5 caracteres.')
      .max(20000, 'O enunciado deve possuir no máximo 20000 caracteres.'),
    type: questionTypeSchema.default('MULTIPLE_CHOICE'),
    subject: z
      .string()
      .trim()
      .min(2, 'A disciplina deve possuir pelo menos 2 caracteres.')
      .max(120, 'A disciplina deve possuir no máximo 120 caracteres.'),
    topic: z
      .string()
      .trim()
      .max(160, 'O assunto deve possuir no máximo 160 caracteres.')
      .nullable()
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    subtopic: z
      .string()
      .trim()
      .max(160, 'O subtópico deve possuir no máximo 160 caracteres.')
      .nullable()
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    board: z
      .string()
      .trim()
      .max(120, 'A banca examinadora deve possuir no máximo 120 caracteres.')
      .nullable()
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    examTitle: z
      .string()
      .trim()
      .max(200, 'O nome do concurso/prova deve possuir no máximo 200 caracteres.')
      .nullable()
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    year: z.coerce
      .number()
      .int('O ano deve ser um número inteiro.')
      .min(1950, 'O ano deve ser igual ou superior a 1950.')
      .max(2100, 'O ano informado é inválido.')
      .nullable()
      .optional(),
    originalNumber: z.coerce
      .number()
      .int()
      .positive('O número original da questão deve ser positivo.')
      .nullable()
      .optional(),
    difficulty: questionDifficultySchema.nullable().optional().default(null),
    correctAnswer: z
      .string()
      .trim()
      .toUpperCase()
      .max(8)
      .nullable()
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    explanation: z
      .string()
      .trim()
      .max(20000, 'A explicação deve possuir no máximo 20000 caracteres.')
      .nullable()
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    sourcePage: z.coerce
      .number()
      .int()
      .positive('A página de origem deve ser um número inteiro positivo.')
      .nullable()
      .optional(),
    status: questionStatusSchema.default('ACTIVE'),
    alternatives: z.array(alternativeInputSchema).optional().default([]),
  })
  .superRefine((data, ctx) => {
    validateAlternativesConsistency(data.alternatives, data.correctAnswer, ctx);
  });

export const updateQuestionSchema = z
  .object({
    statement: z
      .string()
      .trim()
      .min(5, 'O enunciado deve possuir pelo menos 5 caracteres.')
      .max(20000, 'O enunciado deve possuir no máximo 20000 caracteres.')
      .optional(),
    type: questionTypeSchema.optional(),
    subject: z
      .string()
      .trim()
      .min(2, 'A disciplina deve possuir pelo menos 2 caracteres.')
      .max(120, 'A disciplina deve possuir no máximo 120 caracteres.')
      .optional(),
    topic: z
      .string()
      .trim()
      .max(160)
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : v && v.length > 0 ? v : null)),
    subtopic: z
      .string()
      .trim()
      .max(160)
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : v && v.length > 0 ? v : null)),
    board: z
      .string()
      .trim()
      .max(120)
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : v && v.length > 0 ? v : null)),
    examTitle: z
      .string()
      .trim()
      .max(200)
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : v && v.length > 0 ? v : null)),
    year: z.coerce
      .number()
      .int()
      .min(1950)
      .max(2100)
      .nullable()
      .optional(),
    originalNumber: z.coerce.number().int().positive().nullable().optional(),
    difficulty: questionDifficultySchema.nullable().optional(),
    correctAnswer: z
      .string()
      .trim()
      .toUpperCase()
      .max(8)
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : v && v.length > 0 ? v : null)),
    explanation: z
      .string()
      .trim()
      .max(20000)
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : v && v.length > 0 ? v : null)),
    sourcePage: z.coerce.number().int().positive().nullable().optional(),
    status: questionStatusSchema.optional(),
    alternatives: z.array(alternativeInputSchema).optional(),
  })
  .superRefine((data, ctx) => {
    validateAlternativesConsistency(data.alternatives, data.correctAnswer, ctx);
  });

export const listQuestionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  search: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  subject: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  topic: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  board: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  examTitle: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  type: questionTypeSchema.optional(),
  difficulty: questionDifficultySchema.optional(),
  includeAnswer: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
});

export type CreateQuestionInput = z.input<typeof createQuestionSchema>;
export type ParsedCreateQuestionInput = z.output<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.input<typeof updateQuestionSchema>;
export type ParsedUpdateQuestionInput = z.output<typeof updateQuestionSchema>;
export type ListQuestionsQueryInput = z.input<typeof listQuestionsQuerySchema>;
export type ParsedListQuestionsQuery = z.output<typeof listQuestionsQuerySchema>;
