import { z } from 'zod';
import {
  AiExtractionDomainError,
  type AiQuestionExtractionRequest,
  type AnswerKeyEntryDraft,
  type ExtractedAlternativeDraft,
  type ExtractedExamMetadataDraft,
  type ExtractedQuestionDraft,
  type ExtractedQuestionReviewStatus,
  type ValidatedAiQuestionExtractionPayload,
} from '../types/ai-extraction.types.ts';
import {
  createQuestionSchema,
  questionDifficultySchema,
  questionTypeSchema,
  type ParsedCreateQuestionInput,
} from './question.validator.ts';

/**
 * Validadores e normalizadores para Extração Inteligente de Questões e Gabaritos (Sprint 4 — Etapa 4.1).
 *
 * Regras de integridade e segurança aplicadas:
 * 1. Rejeita saídas não-JSON, respostas brutas acima de `DEFAULT_MAX_RAW_AI_JSON_CHARS`, objetos truncados,
 *    propriedades inesperadas (`.strict()`), tipos incorretos ou enunciados vazios/curtos.
 * 2. Limita o tamanho bruto de `extractedText` antes de transformações e valida o texto normalizado.
 * 3. Normaliza letras de alternativas (`a)`, `A.`, ` a ` -> `A`) e valida unicidade e quantidade (2 a 10).
 * 4. Garante compatibilidade para questões `TRUE_FALSE` (ex.: `C`/`E` ou `V`/`F`) e `MULTIPLE_CHOICE`,
 *    inclusive quando a resposta vem da tabela `answerKey`.
 * 5. Rejeita `originalNumber` duplicado (não nulo) no mesmo lote para impedir associação ambígua com o gabarito.
 * 6. Nunca inventa `difficulty`, `correctAnswer`, `explanation`, `topic`, `board`, `year` ou `subject`:
 *    valores ausentes, vazios ou placeholders genéricos (`"N/A"`, `"null"`, `"undefined"`, `"desconhecido"`)
 *    são convertidos honestamente para `null`.
 * 7. Força `status` em `'NEEDS_REVIEW'` (ou `'DRAFT'`) e `requiresHumanReview: true`, anexando avisos
 *    claros em `reviewWarnings` quando campos importantes (como `subject` ou `correctAnswer`) estiverem ausentes.
 */

export const DEFAULT_MAX_EXTRACTED_QUESTIONS = 100;
export const ABSOLUTE_MAX_EXTRACTED_QUESTIONS = 500;
export const DEFAULT_MIN_EXTRACTION_TEXT_CHARS = 20;
export const DEFAULT_MAX_EXTRACTION_TEXT_CHARS = 500_000;
export const DEFAULT_MAX_RAW_AI_JSON_CHARS = 2_000_000;
export const DEFAULT_MAX_REVIEW_WARNINGS_PER_QUESTION = 20;
export const DEFAULT_MAX_GLOBAL_WARNINGS = 100;

export const ALLOWED_TRUE_FALSE_ANSWERS = ['C', 'E', 'V', 'F'] as const;

const PLACEHOLDER_NULL_VALUES = new Set([
  '',
  'null',
  'undefined',
  'n/a',
  'na',
  'none',
  'nenhum',
  'nenhuma',
  'desconhecido',
  'desconhecida',
  'nao informado',
  'não informado',
  'nao consta',
  'não consta',
  '-',
  '--',
  '?',
]);

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed || PLACEHOLDER_NULL_VALUES.has(trimmed.toLowerCase())) {
    return null;
  }
  return trimmed;
}

/**
 * Normaliza o identificador de uma alternativa ou gabarito (ex.: `"a)"`, `" (B) "`, `"c."` -> `"A"`, `"B"`, `"C"`).
 */
export function normalizeAlternativeLetter(rawLetter: string): string {
  return rawLetter
    .trim()
    .replace(/^[(\s[]+|[)\].:\s-\]]+$/g, '')
    .trim()
    .toUpperCase();
}

export const aiExtractionSourceKindSchema = z.enum([
  'DIGITAL_PDF_TEXT',
  'OCR_PDF_TEXT',
  'RAW_EXAM_TEXT',
]);

export const extractedQuestionReviewStatusSchema = z.enum(['NEEDS_REVIEW', 'DRAFT']);

export const rawExtractedAlternativeSchema = z
  .object({
    letter: z
      .string()
      .max(32, 'O identificador bruto da alternativa excede o tamanho permitido.')
      .transform(normalizeAlternativeLetter)
      .pipe(
        z
          .string()
          .min(1, 'A letra da alternativa extraída é obrigatória.')
          .max(8, 'O identificador da alternativa deve ter no máximo 8 caracteres.')
          .regex(
            /^[A-Z0-9]+$/,
            'A letra da alternativa extraída deve conter apenas caracteres alfanuméricos.'
          )
      ),
    text: z
      .string()
      .max(4100, 'O texto da alternativa extraída deve ter no máximo 4000 caracteres.')
      .transform((v) => v.replace(/\r\n?/g, '\n').trim())
      .pipe(
        z
          .string()
          .min(1, 'O texto da alternativa extraída não pode estar vazio.')
          .max(4000, 'O texto da alternativa extraída deve ter no máximo 4000 caracteres.')
      ),
  })
  .strict();

export const rawExtractedExamMetadataSchema = z
  .object({
    title: z
      .string()
      .max(200)
      .nullable()
      .optional()
      .transform((v) => normalizeOptionalString(v)),
    institution: z
      .string()
      .max(160)
      .nullable()
      .optional()
      .transform((v) => normalizeOptionalString(v)),
    board: z
      .string()
      .max(120)
      .nullable()
      .optional()
      .transform((v) => normalizeOptionalString(v)),
    year: z.coerce
      .number()
      .int('O ano da prova deve ser um número inteiro.')
      .min(1950, 'O ano da prova deve ser igual ou superior a 1950.')
      .max(2100, 'O ano da prova informado é inválido.')
      .nullable()
      .optional()
      .default(null),
    position: z
      .string()
      .max(160)
      .nullable()
      .optional()
      .transform((v) => normalizeOptionalString(v)),
    description: z
      .string()
      .max(2000)
      .nullable()
      .optional()
      .transform((v) => normalizeOptionalString(v)),
  })
  .strict()
  .transform(
    (meta): ExtractedExamMetadataDraft => ({
      title: meta.title ?? null,
      institution: meta.institution ?? null,
      board: meta.board ?? null,
      year: meta.year ?? null,
      position: meta.position ?? null,
      description: meta.description ?? null,
    })
  );

export const rawAnswerKeyEntrySchema = z
  .object({
    questionNumber: z.coerce
      .number()
      .int('O número da questão no gabarito deve ser inteiro.')
      .positive('O número da questão no gabarito deve ser positivo.'),
    correctAnswer: z
      .string()
      .max(32)
      .nullable()
      .optional()
      .transform((v) => {
        const cleaned = normalizeOptionalString(v);
        if (!cleaned) return null;
        return normalizeAlternativeLetter(cleaned);
      }),
    isAnnulled: z.boolean().optional().default(false),
    sourcePage: z.coerce.number().int().positive().nullable().optional().default(null),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (!entry.isAnnulled && !entry.correctAnswer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['correctAnswer'],
        message: `O item ${entry.questionNumber} do gabarito deve informar a resposta correta ou marcar isAnnulled=true.`,
      });
    }
    if (entry.correctAnswer && !/^[A-Z0-9]{1,8}$/.test(entry.correctAnswer)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['correctAnswer'],
        message: `A resposta "${entry.correctAnswer}" do item ${entry.questionNumber} no gabarito é inválida.`,
      });
    }
  })
  .transform(
    (entry): AnswerKeyEntryDraft => ({
      questionNumber: entry.questionNumber,
      correctAnswer: entry.isAnnulled ? null : entry.correctAnswer,
      isAnnulled: entry.isAnnulled,
      sourcePage: entry.sourcePage ?? null,
    })
  );

export const rawExtractedQuestionSchema = z
  .object({
    originalNumber: z.coerce
      .number()
      .int('O número original da questão deve ser inteiro.')
      .positive('O número original da questão deve ser positivo.')
      .nullable()
      .optional()
      .default(null),
    statement: z
      .string()
      .max(20500, 'O enunciado da questão extraída deve possuir no máximo 20000 caracteres.')
      .transform((v) => v.replace(/\r\n?/g, '\n').trim())
      .pipe(
        z
          .string()
          .min(5, 'O enunciado da questão extraída deve possuir pelo menos 5 caracteres.')
          .max(20000, 'O enunciado da questão extraída deve possuir no máximo 20000 caracteres.')
      ),
    type: questionTypeSchema.optional().default('MULTIPLE_CHOICE'),
    subject: z
      .string()
      .max(120, 'A disciplina deve possuir no máximo 120 caracteres.')
      .nullable()
      .optional()
      .transform((v) => {
        const cleaned = normalizeOptionalString(v);
        if (!cleaned || cleaned.length < 2) return null;
        return cleaned;
      }),
    topic: z
      .string()
      .max(160, 'O assunto deve possuir no máximo 160 caracteres.')
      .nullable()
      .optional()
      .transform((v) => normalizeOptionalString(v)),
    subtopic: z
      .string()
      .max(160, 'O subtópico deve possuir no máximo 160 caracteres.')
      .nullable()
      .optional()
      .transform((v) => normalizeOptionalString(v)),
    board: z
      .string()
      .max(120, 'A banca examinadora deve possuir no máximo 120 caracteres.')
      .nullable()
      .optional()
      .transform((v) => normalizeOptionalString(v)),
    examTitle: z
      .string()
      .max(200, 'O título da prova deve possuir no máximo 200 caracteres.')
      .nullable()
      .optional()
      .transform((v) => normalizeOptionalString(v)),
    year: z.coerce
      .number()
      .int('O ano deve ser um número inteiro.')
      .min(1950, 'O ano deve ser igual ou superior a 1950.')
      .max(2100, 'O ano informado é inválido.')
      .nullable()
      .optional()
      .default(null),
    difficulty: z
      .preprocess((val) => {
        if (typeof val === 'string') {
          const cleaned = normalizeOptionalString(val);
          return cleaned ? cleaned.toUpperCase() : null;
        }
        return val ?? null;
      }, questionDifficultySchema.nullable().optional())
      .default(null),
    correctAnswer: z
      .string()
      .max(32)
      .nullable()
      .optional()
      .transform((v) => {
        const cleaned = normalizeOptionalString(v);
        if (!cleaned) return null;
        return normalizeAlternativeLetter(cleaned);
      }),
    explanation: z
      .string()
      .max(20000, 'A explicação deve possuir no máximo 20000 caracteres.')
      .nullable()
      .optional()
      .transform((v) => normalizeOptionalString(v)),
    sourcePage: z.coerce
      .number()
      .int('A página de origem deve ser um número inteiro.')
      .positive('A página de origem deve ser um número inteiro positivo.')
      .nullable()
      .optional()
      .default(null),
    status: extractedQuestionReviewStatusSchema.optional().default('NEEDS_REVIEW'),
    reviewWarnings: z
      .array(z.string().trim().min(1).max(500))
      .max(
        DEFAULT_MAX_REVIEW_WARNINGS_PER_QUESTION,
        `Cada questão extraída pode conter no máximo ${DEFAULT_MAX_REVIEW_WARNINGS_PER_QUESTION} avisos de revisão.`
      )
      .optional()
      .default([]),
    alternatives: z.array(rawExtractedAlternativeSchema).optional().default([]),
  })
  .strict()
  .superRefine((question, ctx) => {
    if (question.type === 'MULTIPLE_CHOICE') {
      if (question.alternatives.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['alternatives'],
          message:
            'Questões de múltipla escolha extraídas devem conter pelo menos 2 alternativas.',
        });
        return;
      }
    }

    if (question.alternatives.length > 0 && question.alternatives.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['alternatives'],
        message: 'Quando informadas, a questão extraída deve possuir pelo menos 2 alternativas.',
      });
      return;
    }

    if (question.alternatives.length > 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['alternatives'],
        message: 'A questão extraída pode possuir no máximo 10 alternativas.',
      });
      return;
    }

    const seenLetters = new Set<string>();
    for (const alt of question.alternatives) {
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

    if (question.correctAnswer) {
      if (!/^[A-Z0-9]{1,8}$/.test(question.correctAnswer)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['correctAnswer'],
          message: `O gabarito "${question.correctAnswer}" possui formato inválido.`,
        });
        return;
      }

      if (seenLetters.size > 0 && !seenLetters.has(question.correctAnswer)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['correctAnswer'],
          message: `A resposta correta "${question.correctAnswer}" não corresponde a nenhuma das alternativas extraídas (${Array.from(seenLetters).join(', ')}).`,
        });
      } else if (
        seenLetters.size === 0 &&
        question.type === 'TRUE_FALSE' &&
        !(ALLOWED_TRUE_FALSE_ANSWERS as readonly string[]).includes(question.correctAnswer)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['correctAnswer'],
          message: `Para questões TRUE_FALSE sem alternativas explícitas, a resposta correta deve ser C, E, V ou F (recebido: "${question.correctAnswer}").`,
        });
      }
    }
  });

export const aiQuestionExtractionPayloadSchema = z
  .object({
    examMetadata: rawExtractedExamMetadataSchema.nullable().optional().default(null),
    questions: z.array(rawExtractedQuestionSchema).default([]),
    answerKey: z
      .array(rawAnswerKeyEntrySchema)
      .max(
        ABSOLUTE_MAX_EXTRACTED_QUESTIONS,
        `A tabela de gabarito pode conter no máximo ${ABSOLUTE_MAX_EXTRACTED_QUESTIONS} itens.`
      )
      .optional()
      .default([]),
    warnings: z
      .array(z.string().trim().min(1).max(500))
      .max(
        DEFAULT_MAX_GLOBAL_WARNINGS,
        `O lote extraído pode conter no máximo ${DEFAULT_MAX_GLOBAL_WARNINGS} avisos globais.`
      )
      .optional()
      .default([]),
  })
  .strict();

export const aiQuestionExtractionRequestSchema = z
  .object({
    sourceDocumentId: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .nullable()
      .optional()
      .default(null),
    sourceKind: aiExtractionSourceKindSchema.optional().default('DIGITAL_PDF_TEXT'),
    extractedText: z
      .string()
      .max(
        DEFAULT_MAX_EXTRACTION_TEXT_CHARS,
        `O texto de entrada excede o limite máximo permitido de ${DEFAULT_MAX_EXTRACTION_TEXT_CHARS} caracteres.`
      )
      .transform((v) => v.replace(/\r\n?/g, '\n').trim())
      .pipe(
        z
          .string()
          .min(
            DEFAULT_MIN_EXTRACTION_TEXT_CHARS,
            `O texto de entrada para extração inteligente deve conter pelo menos ${DEFAULT_MIN_EXTRACTION_TEXT_CHARS} caracteres.`
          )
          .max(
            DEFAULT_MAX_EXTRACTION_TEXT_CHARS,
            `O texto de entrada excede o limite máximo permitido de ${DEFAULT_MAX_EXTRACTION_TEXT_CHARS} caracteres.`
          )
      ),
    pageCount: z.coerce.number().int().positive().max(1000).nullable().optional().default(null),
    defaultSubject: z
      .string()
      .max(120)
      .nullable()
      .optional()
      .transform((v) => {
        const cleaned = normalizeOptionalString(v);
        return cleaned && cleaned.length >= 2 ? cleaned : null;
      }),
    defaultBoard: z
      .string()
      .max(120)
      .nullable()
      .optional()
      .transform((v) => normalizeOptionalString(v)),
    defaultExamTitle: z
      .string()
      .max(200)
      .nullable()
      .optional()
      .transform((v) => normalizeOptionalString(v)),
    defaultYear: z.coerce
      .number()
      .int()
      .min(1950)
      .max(2100)
      .nullable()
      .optional()
      .default(null),
    maxQuestions: z.coerce
      .number()
      .int()
      .min(1)
      .max(ABSOLUTE_MAX_EXTRACTED_QUESTIONS)
      .optional()
      .default(DEFAULT_MAX_EXTRACTED_QUESTIONS),
    timeoutMs: z.coerce.number().int().positive().max(300000).optional(),
    signal: z.custom<AbortSignal>((val) => val === undefined || val instanceof AbortSignal).optional(),
  })
  .strict();

/**
 * Extrai e faz o parse seguro de um payload JSON vindo de uma resposta textual de modelo LLM,
 * verificando o tamanho bruto (`DEFAULT_MAX_RAW_AI_JSON_CHARS`) antes de regex e `JSON.parse`,
 * aceitando JSON puro ou bloco cercado por markdown (```json ... ```) e rejeitando respostas
 * vazias, gigantescas, truncadas ou malformadas sem expor o conteúdo rejeitado.
 */
export function parseRawAiJsonOutput(
  rawText: string,
  options?: { maxRawChars?: number }
): unknown {
  const maxRawChars = options?.maxRawChars ?? DEFAULT_MAX_RAW_AI_JSON_CHARS;

  if (typeof rawText !== 'string') {
    throw new AiExtractionDomainError(
      'AI_EXTRACTION_INVALID_OUTPUT',
      'O modelo de IA retornou uma resposta inválida.',
      422
    );
  }

  if (rawText.length > maxRawChars) {
    throw new AiExtractionDomainError(
      'AI_EXTRACTION_LIMIT_EXCEEDED',
      `A resposta bruta do modelo de IA excede o limite máximo permitido de ${maxRawChars} caracteres.`,
      422
    );
  }

  if (rawText.trim().length === 0) {
    throw new AiExtractionDomainError(
      'AI_EXTRACTION_INVALID_OUTPUT',
      'O modelo de IA retornou uma resposta vazia.',
      422
    );
  }

  let candidate = rawText.trim();

  // Remove cercas de código markdown ```json ... ``` se presentes
  const fencedMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(candidate);
  if (fencedMatch) {
    candidate = fencedMatch[1].trim();
  }

  try {
    return JSON.parse(candidate);
  } catch {
    throw new AiExtractionDomainError(
      'AI_EXTRACTION_INVALID_OUTPUT',
      'A resposta retornada pelo modelo de IA não é um JSON válido ou está truncada.',
      422
    );
  }
}

export interface ValidateAiExtractionOptions {
  sourceDocumentId?: string | null;
  defaultSubject?: string | null;
  defaultBoard?: string | null;
  defaultExamTitle?: string | null;
  defaultYear?: number | null;
  maxQuestions?: number;
  pageCount?: number | null;
}

/**
 * Valida, normaliza e cruza as questões extraídas com o gabarito estruturado (quando presente),
 * aplicando limites estritos, rastreabilidade de origem e avisos de revisão humana.
 */
export function validateAndNormalizeAiExtractionPayload(
  rawPayload: unknown,
  options: ValidateAiExtractionOptions = {}
): ValidatedAiQuestionExtractionPayload {
  const maxQuestions =
    options.maxQuestions ??
    (Number(process.env.AI_MAX_QUESTIONS_PER_DOCUMENT) || DEFAULT_MAX_EXTRACTED_QUESTIONS);

  const parsed = aiQuestionExtractionPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const pathLabel = firstIssue?.path.length ? ` (${firstIssue.path.join('.')})` : '';
    throw new AiExtractionDomainError(
      'AI_EXTRACTION_SCHEMA_MISMATCH',
      `A saída estruturada da extração inteligente violou o contrato de validação${pathLabel}: ${firstIssue?.message ?? 'formato inválido.'}`,
      422
    );
  }

  const data = parsed.data;

  if (data.questions.length === 0 && data.answerKey.length === 0) {
    throw new AiExtractionDomainError(
      'AI_EXTRACTION_SCHEMA_MISMATCH',
      'Nenhuma questão ou gabarito válido foi encontrado na estrutura retornada.',
      422
    );
  }

  if (data.questions.length > maxQuestions) {
    throw new AiExtractionDomainError(
      'AI_EXTRACTION_LIMIT_EXCEEDED',
      `O lote extraído contém ${data.questions.length} questões, excedendo o limite máximo permitido de ${maxQuestions} questões por documento.`,
      422
    );
  }

  if (data.answerKey.length > maxQuestions) {
    throw new AiExtractionDomainError(
      'AI_EXTRACTION_LIMIT_EXCEEDED',
      `O gabarito extraído contém ${data.answerKey.length} itens, excedendo o limite máximo permitido de ${maxQuestions} itens por documento.`,
      422
    );
  }

  // Verifica unicidade de originalNumber (quando não nulo) dentro do mesmo lote de questões
  const seenQuestionNumbers = new Set<number>();
  for (const q of data.questions) {
    if (q.originalNumber !== null) {
      if (seenQuestionNumbers.has(q.originalNumber)) {
        throw new AiExtractionDomainError(
          'AI_EXTRACTION_SCHEMA_MISMATCH',
          `Número original de questão duplicado encontrado no mesmo lote: ${q.originalNumber}.`,
          422
        );
      }
      seenQuestionNumbers.add(q.originalNumber);
    }
  }

  // Indexa o gabarito separado por número da questão e detecta conflitos
  const answerKeyByNumber = new Map<number, AnswerKeyEntryDraft>();
  for (const entry of data.answerKey) {
    const existing = answerKeyByNumber.get(entry.questionNumber);
    if (
      existing &&
      (existing.correctAnswer !== entry.correctAnswer ||
        existing.isAnnulled !== entry.isAnnulled)
    ) {
      throw new AiExtractionDomainError(
        'AI_EXTRACTION_SCHEMA_MISMATCH',
        `Conflito detectado no gabarito extraído para a questão número ${entry.questionNumber}.`,
        422
      );
    }
    answerKeyByNumber.set(entry.questionNumber, entry);
  }

  const fallbackSubject = normalizeOptionalString(options.defaultSubject);
  const fallbackBoard =
    normalizeOptionalString(options.defaultBoard) ?? data.examMetadata?.board ?? null;
  const fallbackExamTitle =
    normalizeOptionalString(options.defaultExamTitle) ?? data.examMetadata?.title ?? null;
  const fallbackYear = options.defaultYear ?? data.examMetadata?.year ?? null;
  const sourceDocumentId = normalizeOptionalString(options.sourceDocumentId);

  const normalizedQuestions: ExtractedQuestionDraft[] = data.questions.map((q) => {
    const warnings = new Set<string>(q.reviewWarnings);

    if (
      options.pageCount &&
      q.sourcePage !== null &&
      q.sourcePage > options.pageCount
    ) {
      throw new AiExtractionDomainError(
        'AI_EXTRACTION_SCHEMA_MISMATCH',
        `A questão ${q.originalNumber ?? '(sem número)'} referencia a página ${q.sourcePage}, mas o documento possui apenas ${options.pageCount} página(s).`,
        422
      );
    }

    const mappedAlternatives: ExtractedAlternativeDraft[] = q.alternatives.map(
      (alt, idx) => ({
        letter: alt.letter,
        text: alt.text,
        position: idx + 1,
      })
    );

    const validLetters = new Set(mappedAlternatives.map((a) => a.letter));

    // Reconcilia correctAnswer com o answerKey estruturado caso ambos ou um deles exista
    let resolvedCorrectAnswer = q.correctAnswer;
    const matchedKeyEntry =
      q.originalNumber !== null ? answerKeyByNumber.get(q.originalNumber) : undefined;

    if (matchedKeyEntry) {
      if (matchedKeyEntry.isAnnulled) {
        resolvedCorrectAnswer = null;
        warnings.add(
          `Questão ${q.originalNumber} consta como anulada no gabarito extraído.`
        );
      } else if (matchedKeyEntry.correctAnswer) {
        if (
          resolvedCorrectAnswer &&
          resolvedCorrectAnswer !== matchedKeyEntry.correctAnswer
        ) {
          throw new AiExtractionDomainError(
            'AI_EXTRACTION_SCHEMA_MISMATCH',
            `Divergência entre o gabarito da questão ${q.originalNumber} ("${resolvedCorrectAnswer}") e a tabela de gabarito ("${matchedKeyEntry.correctAnswer}").`,
            422
          );
        }

        if (validLetters.size > 0 && !validLetters.has(matchedKeyEntry.correctAnswer)) {
          throw new AiExtractionDomainError(
            'AI_EXTRACTION_SCHEMA_MISMATCH',
            `O gabarito "${matchedKeyEntry.correctAnswer}" da questão ${q.originalNumber} não corresponde a nenhuma das alternativas extraídas (${Array.from(validLetters).join(', ')}).`,
            422
          );
        } else if (
          validLetters.size === 0 &&
          q.type === 'TRUE_FALSE' &&
          !(ALLOWED_TRUE_FALSE_ANSWERS as readonly string[]).includes(
            matchedKeyEntry.correctAnswer
          )
        ) {
          throw new AiExtractionDomainError(
            'AI_EXTRACTION_SCHEMA_MISMATCH',
            `Para questões TRUE_FALSE sem alternativas explícitas, o gabarito da questão ${q.originalNumber} deve ser C, E, V ou F (recebido: "${matchedKeyEntry.correctAnswer}").`,
            422
          );
        }

        resolvedCorrectAnswer = matchedKeyEntry.correctAnswer;
      }
    }

    const resolvedSubject = q.subject ?? fallbackSubject ?? null;
    if (!resolvedSubject) {
      warnings.add(
        'Disciplina (subject) não identificada automaticamente; defina a disciplina antes de aprovar a questão.'
      );
    }

    if (!resolvedCorrectAnswer) {
      warnings.add(
        'Gabarito (correctAnswer) ausente; revise ou vincule o gabarito oficial.'
      );
    }

    if (q.type === 'TRUE_FALSE' && mappedAlternatives.length === 0) {
      warnings.add(
        'Questão de Certo/Errado extraída sem alternativas explícitas; confirme o formato durante a revisão.'
      );
    }

    const reviewStatus: ExtractedQuestionReviewStatus =
      q.status === 'DRAFT' ? 'DRAFT' : 'NEEDS_REVIEW';

    return {
      originalNumber: q.originalNumber,
      statement: q.statement,
      type: q.type,
      subject: resolvedSubject,
      topic: q.topic,
      subtopic: q.subtopic,
      board: q.board ?? fallbackBoard,
      examTitle: q.examTitle ?? fallbackExamTitle,
      year: q.year ?? fallbackYear,
      difficulty: q.difficulty,
      correctAnswer: resolvedCorrectAnswer,
      explanation: q.explanation,
      sourcePage: q.sourcePage,
      sourceDocumentId,
      status: reviewStatus,
      requiresHumanReview: true,
      reviewWarnings: Array.from(warnings),
      alternatives: mappedAlternatives,
    };
  });

  return {
    examMetadata: data.examMetadata,
    questions: normalizedQuestions,
    answerKey: data.answerKey,
    warnings: data.warnings,
  };
}

/**
 * Converte um `ExtractedQuestionDraft` (revisado ou com disciplina informada) em um payload
 * estritamente validado pelo `createQuestionSchema` do Banco de Questões (`QuestionService`),
 * garantindo compatibilidade total com os modelos `Question` e `Alternative` do Prisma
 * e preservando o status inicial de revisão (`NEEDS_REVIEW` ou `DRAFT`).
 */
export function toCreateQuestionInputFromDraft(
  draft: ExtractedQuestionDraft,
  overrides?: {
    subject?: string;
    status?: ExtractedQuestionReviewStatus;
  }
): ParsedCreateQuestionInput {
  const effectiveSubject = normalizeOptionalString(overrides?.subject ?? draft.subject);
  if (!effectiveSubject) {
    throw new AiExtractionDomainError(
      'AI_EXTRACTION_SCHEMA_MISMATCH',
      `A questão ${draft.originalNumber ?? '(sem número)'} não possui disciplina (subject) definida e não pode ser convertida para persistência sem revisão humana.`,
      400
    );
  }

  if (
    draft.type === 'TRUE_FALSE' &&
    draft.alternatives.length === 0 &&
    draft.correctAnswer !== null &&
    !(ALLOWED_TRUE_FALSE_ANSWERS as readonly string[]).includes(draft.correctAnswer)
  ) {
    throw new AiExtractionDomainError(
      'AI_EXTRACTION_SCHEMA_MISMATCH',
      `Para questões TRUE_FALSE sem alternativas explícitas, a resposta correta deve ser C, E, V ou F (recebido: "${draft.correctAnswer}").`,
      400
    );
  }

  const candidate = {
    statement: draft.statement,
    type: draft.type,
    subject: effectiveSubject,
    topic: draft.topic,
    subtopic: draft.subtopic,
    board: draft.board,
    examTitle: draft.examTitle,
    year: draft.year,
    originalNumber: draft.originalNumber,
    difficulty: draft.difficulty,
    correctAnswer: draft.correctAnswer,
    explanation: draft.explanation,
    sourcePage: draft.sourcePage,
    status: overrides?.status ?? draft.status ?? 'NEEDS_REVIEW',
    alternatives: draft.alternatives.map((alt) => ({
      letter: alt.letter,
      text: alt.text,
    })),
  };

  const parsed = createQuestionSchema.safeParse(candidate);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new AiExtractionDomainError(
      'AI_EXTRACTION_SCHEMA_MISMATCH',
      firstIssue?.message ??
        'A questão extraída não atende aos critérios de persistência do Banco de Questões.',
      400
    );
  }

  return parsed.data;
}

export function validateAiQuestionExtractionRequest(
  rawRequest: AiQuestionExtractionRequest
) {
  const parsed = aiQuestionExtractionRequestSchema.safeParse(rawRequest);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new AiExtractionDomainError(
      'AI_EXTRACTION_INVALID_INPUT',
      firstIssue?.message ?? 'Dados de entrada inválidos para a extração inteligente.',
      400
    );
  }
  return parsed.data;
}
