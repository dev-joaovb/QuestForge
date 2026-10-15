import { z } from 'zod';
import { OfficialAnswerKeyError } from '../types/official-answer-key.types.ts';

/**
 * Limites máximos para validação de entrada de gabaritos oficiais.
 */
export const MAX_OFFICIAL_ANSWER_KEY_ITEMS = 300;
export const MAX_ANSWER_KEY_NOTES_LENGTH = 2000;
export const MAX_ANSWER_KEY_JUSTIFICATION_LENGTH = 4000;
export const MAX_ANSWER_KEY_TEXT_EVIDENCE_LENGTH = 4000;
export const MAX_ANSWER_KEY_CORRECT_ANSWER_LENGTH = 10;

/**
 * Enums reais definidos no Prisma Schema.
 */
export const answerKeyTypeSchema = z.enum(['PRELIMINARY', 'FINAL', 'RECTIFIED']);

export const answerKeyStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED']);

export const answerKeyItemStatusSchema = z.enum(['ACTIVE', 'ANNULLED', 'CHANGED', 'NEEDS_REVIEW']);

/**
 * Schema de validação para criação de um item de gabarito oficial.
 * Não permite que o cliente defina `id`, `answerKeyId`, `createdAt` ou `updatedAt`.
 */
export const createOfficialAnswerKeyItemSchema = z
  .object({
    questionNumber: z
      .number({ message: 'O número da questão é obrigatório.' })
      .int('O número da questão deve ser um número inteiro.')
      .min(1, 'O número da questão deve ser maior ou igual a 1.')
      .max(1000, 'O número da questão não pode exceder 1000.'),
    questionId: z
      .string()
      .uuid('O identificador da questão (questionId) deve ser um UUID válido.')
      .nullable()
      .optional(),
    correctAnswer: z
      .string()
      .trim()
      .toUpperCase()
      .max(
        MAX_ANSWER_KEY_CORRECT_ANSWER_LENGTH,
        `A resposta correta deve possuir no máximo ${MAX_ANSWER_KEY_CORRECT_ANSWER_LENGTH} caracteres.`
      )
      .nullable()
      .optional()
      .transform((val) => (val === undefined ? undefined : val && val.length > 0 ? val : null)),
    previousAnswer: z
      .string()
      .trim()
      .toUpperCase()
      .max(
        MAX_ANSWER_KEY_CORRECT_ANSWER_LENGTH,
        `A resposta anterior deve possuir no máximo ${MAX_ANSWER_KEY_CORRECT_ANSWER_LENGTH} caracteres.`
      )
      .nullable()
      .optional()
      .transform((val) => (val === undefined ? undefined : val && val.length > 0 ? val : null)),
    status: answerKeyItemStatusSchema.default('ACTIVE'),
    isAnnulled: z.boolean().default(false),
    justification: z
      .string()
      .max(
        MAX_ANSWER_KEY_JUSTIFICATION_LENGTH,
        `A justificativa deve possuir no máximo ${MAX_ANSWER_KEY_JUSTIFICATION_LENGTH} caracteres.`
      )
      .nullable()
      .optional()
      .transform((val) => (val === undefined ? undefined : val && val.trim().length > 0 ? val.trim() : null)),
    textEvidence: z
      .string()
      .max(
        MAX_ANSWER_KEY_TEXT_EVIDENCE_LENGTH,
        `A evidência textual deve possuir no máximo ${MAX_ANSWER_KEY_TEXT_EVIDENCE_LENGTH} caracteres.`
      )
      .nullable()
      .optional(),
    confidence: z
      .number()
      .min(0, 'A confiança da extração deve ser maior ou igual a 0.0.')
      .max(1, 'A confiança da extração deve ser menor ou igual a 1.0.')
      .nullable()
      .optional(),
    sourcePage: z
      .number()
      .int('A página de origem deve ser um número inteiro.')
      .min(1, 'A página de origem deve ser maior ou igual a 1.')
      .max(1000, 'A página de origem deve ser menor ou igual a 1000.')
      .nullable()
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.status === 'ANNULLED' && !data.isAnnulled) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['isAnnulled'],
        message: 'Itens com status ANNULLED devem possuir isAnnulled como true.',
      });
    }
    if (data.isAnnulled && data.status !== 'ANNULLED') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'Itens com isAnnulled true devem possuir status ANNULLED.',
      });
    }
  });

/**
 * Schema de validação para atualização de um item individual de gabarito oficial.
 */
export const updateOfficialAnswerKeyItemSchema = z
  .object({
    questionId: z
      .string()
      .uuid('O questionId deve ser um UUID válido.')
      .nullable()
      .optional(),
    correctAnswer: z
      .string()
      .trim()
      .toUpperCase()
      .max(
        MAX_ANSWER_KEY_CORRECT_ANSWER_LENGTH,
        `A resposta correta deve possuir no máximo ${MAX_ANSWER_KEY_CORRECT_ANSWER_LENGTH} caracteres.`
      )
      .nullable()
      .optional()
      .transform((val) => (val === undefined ? undefined : val && val.length > 0 ? val : null)),
    previousAnswer: z
      .string()
      .trim()
      .toUpperCase()
      .max(
        MAX_ANSWER_KEY_CORRECT_ANSWER_LENGTH,
        `A resposta anterior deve possuir no máximo ${MAX_ANSWER_KEY_CORRECT_ANSWER_LENGTH} caracteres.`
      )
      .nullable()
      .optional()
      .transform((val) => (val === undefined ? undefined : val && val.length > 0 ? val : null)),
    status: answerKeyItemStatusSchema.optional(),
    isAnnulled: z.boolean().optional(),
    justification: z
      .string()
      .max(
        MAX_ANSWER_KEY_JUSTIFICATION_LENGTH,
        `A justificativa deve possuir no máximo ${MAX_ANSWER_KEY_JUSTIFICATION_LENGTH} caracteres.`
      )
      .nullable()
      .optional()
      .transform((val) => (val === undefined ? undefined : val && val.trim().length > 0 ? val.trim() : null)),
    textEvidence: z
      .string()
      .max(
        MAX_ANSWER_KEY_TEXT_EVIDENCE_LENGTH,
        `A evidência textual deve possuir no máximo ${MAX_ANSWER_KEY_TEXT_EVIDENCE_LENGTH} caracteres.`
      )
      .nullable()
      .optional(),
    confidence: z
      .number()
      .min(0, 'A confiança da extração deve ser maior ou igual a 0.0.')
      .max(1, 'A confiança da extração deve ser menor ou igual a 1.0.')
      .nullable()
      .optional(),
    sourcePage: z
      .number()
      .int('A página de origem deve ser um número inteiro.')
      .min(1, 'A página de origem deve ser maior ou igual a 1.')
      .max(1000, 'A página de origem deve ser menor ou igual a 1000.')
      .nullable()
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    // QF-VAL-02: Rejeitar objetos sem nenhuma propriedade para atualização
    const hasDefinedKey = Object.values(data).some((val) => val !== undefined);
    if (!hasDefinedKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Pelo menos um campo deve ser fornecido para atualização.',
      });
      return;
    }

    // QF-VAL-01: Consistência de anulações em atualizações parciais:
    // 1. status: 'ANNULLED' sem isAnnulled: true seja rejeitado.
    if (data.status === 'ANNULLED' && data.isAnnulled !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['isAnnulled'],
        message: 'Atualizações com status ANNULLED exigem envio explícito de isAnnulled como true.',
      });
    }

    // 2. isAnnulled: true com status diferente de ANNULLED seja rejeitado.
    if (data.isAnnulled === true && data.status !== undefined && data.status !== 'ANNULLED') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'Itens com isAnnulled true não podem possuir status diferente de ANNULLED.',
      });
    }

    // Observação de arquitetura: Não se presume que o estado anterior do item é conhecido pelo validator.
    // Regras que dependem do estado persistido (ex.: envio de { isAnnulled: true } isolado, ou desanular
    // { isAnnulled: false } sem alterar status) devem ser validadas e garantidas pela camada de serviço.
  });

/**
 * Função utilitária para verificar duplicatas de questionNumber em um array de itens.
 */
function validateUniqueQuestionNumbers(
  items: Array<{ questionNumber: number }>,
  ctx: z.RefinementCtx
) {
  const seenNumbers = new Set<number>();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (seenNumbers.has(item.questionNumber)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items', i, 'questionNumber'],
        message: `Número de questão duplicado: ${item.questionNumber}.`,
      });
    }
    seenNumbers.add(item.questionNumber);
  }
}

/**
 * Schema de validação para criação de um rascunho de gabarito oficial.
 * Não permite que o cliente defina `userId`, `status`, `isCurrent`, `createdAt` ou `updatedAt`.
 */
export const createOfficialAnswerKeyDraftSchema = z
  .object({
    examId: z
      .string({ message: 'O identificador da prova (examId) é obrigatório.' })
      .uuid('O examId deve ser um UUID válido.'),
    pdfDocumentId: z
      .string()
      .uuid('O pdfDocumentId deve ser um UUID válido.')
      .nullable()
      .optional(),
    type: answerKeyTypeSchema.default('PRELIMINARY'),
    version: z
      .number()
      .int('A versão deve ser um número inteiro.')
      .min(1, 'A versão deve ser maior ou igual a 1.')
      .max(1000, 'A versão não pode exceder 1000.')
      .optional(),
    notes: z
      .string()
      .max(
        MAX_ANSWER_KEY_NOTES_LENGTH,
        `As notas devem possuir no máximo ${MAX_ANSWER_KEY_NOTES_LENGTH} caracteres.`
      )
      .nullable()
      .optional()
      .transform((val) => (val === undefined ? undefined : val && val.trim().length > 0 ? val.trim() : null)),
    publicationDate: z.coerce
      .date()
      .nullable()
      .optional(),
    items: z
      .array(createOfficialAnswerKeyItemSchema)
      .max(
        MAX_OFFICIAL_ANSWER_KEY_ITEMS,
        `O gabarito pode conter no máximo ${MAX_OFFICIAL_ANSWER_KEY_ITEMS} itens.`
      )
      .optional()
      .default([]),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.items && data.items.length > 0) {
      validateUniqueQuestionNumbers(data.items, ctx);
    }
  });

/**
 * Schema de validação para atualização de metadados e/ou substituição de itens de um rascunho.
 */
export const updateOfficialAnswerKeyDraftSchema = z
  .object({
    type: answerKeyTypeSchema.optional(),
    version: z
      .number()
      .int('A versão deve ser um número inteiro.')
      .min(1, 'A versão deve ser maior ou igual a 1.')
      .max(1000, 'A versão não pode exceder 1000.')
      .optional(),
    notes: z
      .string()
      .max(
        MAX_ANSWER_KEY_NOTES_LENGTH,
        `As notas devem possuir no máximo ${MAX_ANSWER_KEY_NOTES_LENGTH} caracteres.`
      )
      .nullable()
      .optional()
      .transform((val) => (val === undefined ? undefined : val && val.trim().length > 0 ? val.trim() : null)),
    publicationDate: z.coerce
      .date()
      .nullable()
      .optional(),
    pdfDocumentId: z
      .string()
      .uuid('O pdfDocumentId deve ser um UUID válido.')
      .nullable()
      .optional(),
    items: z
      .array(createOfficialAnswerKeyItemSchema)
      .max(
        MAX_OFFICIAL_ANSWER_KEY_ITEMS,
        `O gabarito pode conter no máximo ${MAX_OFFICIAL_ANSWER_KEY_ITEMS} itens.`
      )
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    // QF-VAL-02: Rejeitar payload sem nenhuma propriedade para atualização
    const hasDefinedKey = Object.values(data).some((val) => val !== undefined);
    if (!hasDefinedKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Pelo menos um campo deve ser fornecido para atualização.',
      });
      return;
    }

    if (data.items && data.items.length > 0) {
      validateUniqueQuestionNumbers(data.items, ctx);
    }
  });

/**
 * Schema de validação para substituição em lote dos itens de um rascunho de gabarito.
 */
export const replaceOfficialAnswerKeyItemsSchema = z
  .object({
    items: z
      .array(createOfficialAnswerKeyItemSchema)
      .max(
        MAX_OFFICIAL_ANSWER_KEY_ITEMS,
        `O gabarito pode conter no máximo ${MAX_OFFICIAL_ANSWER_KEY_ITEMS} itens.`
      ),
  })
  .strict()
  .superRefine((data, ctx) => {
    validateUniqueQuestionNumbers(data.items, ctx);
  });

/**
 * Schema para validação dos dados de entrada de uma futura publicação oficial.
 * Não publica o gabarito; apenas valida os parâmetros recebidos.
 */
export const publishOfficialAnswerKeySchema = z
  .object({
    publicationDate: z.coerce.date().optional(),
    syncQuestionAnswers: z.boolean().default(true),
    confirmAllReviewed: z.boolean().default(false),
  })
  .strict();

/**
 * Schema para filtros de consulta de versões de gabarito.
 */
export const listAnswerKeyVersionsQuerySchema = z
  .object({
    type: answerKeyTypeSchema.optional(),
  })
  .strict();

/**
 * Schema para filtros de consulta de itens de um gabarito.
 */
export const listAnswerKeyItemsQuerySchema = z
  .object({
    status: answerKeyItemStatusSchema.optional(),
  })
  .strict();

// ============================================================================
// Tipos TypeScript inferidos a partir dos schemas Zod
// ============================================================================

export type CreateOfficialAnswerKeyDraftInput = z.input<typeof createOfficialAnswerKeyDraftSchema>;
export type ParsedCreateOfficialAnswerKeyDraft = z.output<typeof createOfficialAnswerKeyDraftSchema>;

export type UpdateOfficialAnswerKeyDraftInput = z.input<typeof updateOfficialAnswerKeyDraftSchema>;
export type ParsedUpdateOfficialAnswerKeyDraft = z.output<typeof updateOfficialAnswerKeyDraftSchema>;

export type CreateOfficialAnswerKeyItemInput = z.input<typeof createOfficialAnswerKeyItemSchema>;
export type ParsedCreateOfficialAnswerKeyItem = z.output<typeof createOfficialAnswerKeyItemSchema>;

export type UpdateOfficialAnswerKeyItemInput = z.input<typeof updateOfficialAnswerKeyItemSchema>;
export type ParsedUpdateOfficialAnswerKeyItem = z.output<typeof updateOfficialAnswerKeyItemSchema>;

export type ReplaceOfficialAnswerKeyItemsInput = z.input<typeof replaceOfficialAnswerKeyItemsSchema>;
export type ParsedReplaceOfficialAnswerKeyItems = z.output<typeof replaceOfficialAnswerKeyItemsSchema>;

export type PublishOfficialAnswerKeyInput = z.input<typeof publishOfficialAnswerKeySchema>;
export type ParsedPublishOfficialAnswerKey = z.output<typeof publishOfficialAnswerKeySchema>;

export type ListAnswerKeyVersionsQueryInput = z.input<typeof listAnswerKeyVersionsQuerySchema>;
export type ParsedListAnswerKeyVersionsQuery = z.output<typeof listAnswerKeyVersionsQuerySchema>;

export type ListAnswerKeyItemsQueryInput = z.input<typeof listAnswerKeyItemsQuerySchema>;
export type ParsedListAnswerKeyItemsQuery = z.output<typeof listAnswerKeyItemsQuerySchema>;

// ============================================================================
// Funções auxiliares com disparo de OfficialAnswerKeyError (ANSWER_KEY_INVALID_DATA)
// ============================================================================

function handleZodValidationError(error: z.ZodError): never {
  const firstIssue = error.issues[0];
  const fieldPath = firstIssue?.path?.length ? ` (${firstIssue.path.join('.')})` : '';
  let message = firstIssue?.message ?? 'dados incorretos.';
  if (firstIssue?.code === 'unrecognized_keys') {
    const keys = (firstIssue as any).keys?.join(', ');
    message = `Propriedades não permitidas no payload: ${keys}.`;
  }
  throw new OfficialAnswerKeyError(
    'ANSWER_KEY_INVALID_DATA',
    `Dados inválidos${fieldPath}: ${message}`,
    400
  );
}

export function validateCreateOfficialAnswerKeyDraft(raw: unknown): ParsedCreateOfficialAnswerKeyDraft {
  const parsed = createOfficialAnswerKeyDraftSchema.safeParse(raw);
  if (!parsed.success) {
    handleZodValidationError(parsed.error);
  }
  return parsed.data;
}

export function validateUpdateOfficialAnswerKeyDraft(raw: unknown): ParsedUpdateOfficialAnswerKeyDraft {
  const parsed = updateOfficialAnswerKeyDraftSchema.safeParse(raw);
  if (!parsed.success) {
    handleZodValidationError(parsed.error);
  }
  return parsed.data;
}

export function validateCreateOfficialAnswerKeyItem(raw: unknown): ParsedCreateOfficialAnswerKeyItem {
  const parsed = createOfficialAnswerKeyItemSchema.safeParse(raw);
  if (!parsed.success) {
    handleZodValidationError(parsed.error);
  }
  return parsed.data;
}

export function validateUpdateOfficialAnswerKeyItem(raw: unknown): ParsedUpdateOfficialAnswerKeyItem {
  const parsed = updateOfficialAnswerKeyItemSchema.safeParse(raw);
  if (!parsed.success) {
    handleZodValidationError(parsed.error);
  }
  return parsed.data;
}

/**
 * Aliases para compatibilidade de nomenclatura de itens de rascunho
 */
export const updateOfficialAnswerKeyDraftItemSchema = updateOfficialAnswerKeyItemSchema;
export type UpdateOfficialAnswerKeyDraftItemInput = UpdateOfficialAnswerKeyItemInput;
export type ParsedUpdateOfficialAnswerKeyDraftItem = ParsedUpdateOfficialAnswerKeyItem;
export const validateUpdateOfficialAnswerKeyDraftItem = validateUpdateOfficialAnswerKeyItem;

export function validateReplaceOfficialAnswerKeyItems(raw: unknown): ParsedReplaceOfficialAnswerKeyItems {
  const parsed = replaceOfficialAnswerKeyItemsSchema.safeParse(raw);
  if (!parsed.success) {
    handleZodValidationError(parsed.error);
  }
  return parsed.data;
}

export function validatePublishOfficialAnswerKey(raw: unknown): ParsedPublishOfficialAnswerKey {
  const parsed = publishOfficialAnswerKeySchema.safeParse(raw);
  if (!parsed.success) {
    handleZodValidationError(parsed.error);
  }
  return parsed.data;
}

export function validateListAnswerKeyVersionsQuery(raw: unknown): ParsedListAnswerKeyVersionsQuery {
  const parsed = listAnswerKeyVersionsQuerySchema.safeParse(raw);
  if (!parsed.success) {
    handleZodValidationError(parsed.error);
  }
  return parsed.data;
}

export function validateListAnswerKeyItemsQuery(raw: unknown): ParsedListAnswerKeyItemsQuery {
  const parsed = listAnswerKeyItemsQuerySchema.safeParse(raw);
  if (!parsed.success) {
    handleZodValidationError(parsed.error);
  }
  return parsed.data;
}
