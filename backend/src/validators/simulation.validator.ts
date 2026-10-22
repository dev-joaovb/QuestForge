import { z } from 'zod';
import { SimulationDomainError } from '../types/simulation.types.ts';

/**
 * Schemas e funções de validação para o Motor de Simulados (Sprint 6.4).
 *
 * Princípios de Segurança:
 * 1. Todos os schemas são `.strict()` para rejeitar propriedades não autorizadas
 *    (ex.: manipulação de `isCorrect`, `scorePercentage`, `correctCount`, `userId`).
 * 2. O `userId` é obtido exclusivamente da sessão autenticada no servidor (`req.user.id`).
 * 3. Sanitização rigorosa de parâmetros de rota, query strings e corpo de requisição.
 */

export const simulationStatusSchema = z.enum([
  'CREATED',
  'IN_PROGRESS',
  'COMPLETED',
  'EXPIRED',
  'ABANDONED',
]);

export const simulationCriteriaSchema = z
  .object({
    subject: z.string().trim().min(1, 'A disciplina não pode estar vazia.').max(100).optional(),
    topic: z.string().trim().min(1, 'O tópico não pode estar vazio.').max(100).optional(),
    subtopic: z.string().trim().min(1, 'O subtópico não pode estar vazio.').max(100).optional(),
    board: z.string().trim().min(1, 'A banca não pode estar vazia.').max(100).optional(),
    examTitle: z.string().trim().min(1, 'O título da prova não pode estar vazio.').max(150).optional(),
    year: z
      .number()
      .int('O ano deve ser um número inteiro.')
      .min(1990, 'Ano inválido.')
      .max(2100, 'Ano inválido.')
      .optional(),
    examId: z.string().trim().min(1, 'O ID da prova não pode estar vazio.').max(100).optional(),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
    type: z.enum(['MULTIPLE_CHOICE', 'TRUE_FALSE']).optional(),
  })
  .strict();

export const createSimulationSchema = z
  .object({
    title: z.string().trim().min(1, 'O título não pode estar vazio.').max(200, 'O título deve ter no máximo 200 caracteres.').nullable().optional(),
    totalQuestions: z
      .number({ message: 'A quantidade total de questões é obrigatória.' })
      .int('A quantidade de questões deve ser um número inteiro.')
      .min(1, 'O simulado deve conter pelo menos 1 questão.')
      .max(200, 'O simulado pode conter no máximo 200 questões.'),
    timeLimitSeconds: z
      .number()
      .int('O limite de tempo deve ser um número inteiro em segundos.')
      .min(30, 'O tempo mínimo de simulado é de 30 segundos.')
      .max(86400, 'O tempo máximo de simulado é de 24 horas (86400 segundos).')
      .nullable()
      .optional(),
    criteria: simulationCriteriaSchema.optional(),
    questionIds: z
      .array(z.string().trim().min(1, 'O identificador da questão não pode ser vazio.'))
      .min(1, 'A lista de questões deve conter pelo menos 1 questão.')
      .max(200, 'A lista de questões pode conter no máximo 200 questões.')
      .optional(),
  })
  .strict();

export type CreateSimulationInput = z.infer<typeof createSimulationSchema>;

export const submitAnswerSchema = z
  .object({
    questionId: z.string().trim().min(1, 'O identificador da questão é obrigatório.').optional(),
    selectedAlternativeId: z.string().trim().min(1).nullable().optional(),
    timeSpentSeconds: z
      .number()
      .int('O tempo decorrido deve ser um número inteiro em segundos.')
      .min(0, 'O tempo decorrido não pode ser negativo.')
      .max(86400, 'O tempo decorrido não pode exceder 24 horas.')
      .nullable()
      .optional(),
  })
  .strict();

export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;

export const listSimulationsQuerySchema = z
  .object({
    status: simulationStatusSchema.optional(),
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
    page: z.coerce.number().int().min(1).optional(),
  })
  .strict();

export type ListSimulationsQueryInput = z.infer<typeof listSimulationsQuerySchema>;

export const simulationIdParamSchema = z
  .object({
    id: z.string().trim().min(1, 'O identificador do simulado é obrigatório.'),
  })
  .strict();

export function validateCreateSimulation(raw: unknown): CreateSimulationInput {
  const result = createSimulationSchema.safeParse(raw);
  if (!result.success) {
    throw new SimulationDomainError(
      'SIMULATION_INVALID_INPUT',
      result.error.issues[0]?.message ?? 'Dados inválidos para criação do simulado.',
      400,
      result.error.issues
    );
  }
  return result.data;
}

export function validateSubmitAnswer(raw: unknown): SubmitAnswerInput {
  const result = submitAnswerSchema.safeParse(raw);
  if (!result.success) {
    throw new SimulationDomainError(
      'SIMULATION_INVALID_INPUT',
      result.error.issues[0]?.message ?? 'Dados inválidos para submissão de resposta.',
      400,
      result.error.issues
    );
  }
  return result.data;
}

export function validateListSimulationsQuery(raw: unknown): ListSimulationsQueryInput {
  const result = listSimulationsQuerySchema.safeParse(raw);
  if (!result.success) {
    throw new SimulationDomainError(
      'SIMULATION_INVALID_INPUT',
      result.error.issues[0]?.message ?? 'Parâmetros de listagem inválidos.',
      400,
      result.error.issues
    );
  }
  return result.data;
}
