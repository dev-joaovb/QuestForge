import {
  AiExtractionDomainError,
  type ValidatedAiQuestionExtractionPayload,
} from '../types/ai-extraction.types.ts';

import type {
  OllamaDocumentBlock,
} from './ollama-document-segmenter.service.ts';

export interface SequentialExtractionInput {
  readonly blocks: readonly OllamaDocumentBlock[];
  readonly maxQuestions: number;
  readonly signal: AbortSignal;
  readonly deadlineAt: number;

  readonly complete: (
    block: OllamaDocumentBlock,
    timeoutMs: number,
    signal: AbortSignal
  ) => Promise<unknown>;

  readonly validate: (
    payload: unknown
  ) => ValidatedAiQuestionExtractionPayload;
}

type RawRecord = Record<string, unknown>;

function invalidOutput(message: string): never {
  throw new AiExtractionDomainError(
    'AI_EXTRACTION_SCHEMA_MISMATCH',
    message,
    422
  );
}

function asRecord(value: unknown): RawRecord {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    invalidOutput(
      'A resposta do bloco não contém um objeto válido.'
    );
  }

  return value as RawRecord;
}

function remainingTime(
  input: SequentialExtractionInput
): number {
  const remaining = input.deadlineAt - Date.now();

  if (input.signal.aborted || remaining <= 0) {
    throw new AiExtractionDomainError(
      'AI_EXTRACTION_TIMEOUT',
      'O processamento sequencial foi interrompido ou excedeu o prazo global.',
      504
    );
  }

  // Cada bloco utiliza somente o tempo restante
  // do prazo global, sem reiniciar o orçamento.
  return remaining;
}

export async function executeOllamaSequentialExtraction(
  input: SequentialExtractionInput
): Promise<unknown> {
  if (
    input.blocks.length === 0 ||
    input.blocks.length > 32 ||
    !Number.isSafeInteger(input.maxQuestions) ||
    input.maxQuestions < 1 ||
    input.maxQuestions > 500 ||
    !Number.isFinite(input.deadlineAt)
  ) {
    throw new AiExtractionDomainError(
      'AI_EXTRACTION_INVALID_INPUT',
      'Os parâmetros do processamento sequencial são inválidos.',
      400
    );
  }

  const questions: unknown[] = [];
  const answerKey: unknown[] = [];
  const warnings = new Set<string>();

  const metadata: RawRecord = {};
  const seenNumbers = new Set<number>();

  const expectedCount = input.blocks.reduce(
    (total, block) =>
      total + block.questionNumbers.length,
    0
  );

  if (expectedCount > input.maxQuestions) {
    throw new AiExtractionDomainError(
      'AI_EXTRACTION_LIMIT_EXCEEDED',
      'O documento excede o limite máximo de questões.',
      422
    );
  }

  for (const block of input.blocks) {
    const timeoutMs = remainingTime(input);

    const raw = await input.complete(
      block,
      timeoutMs,
      input.signal
    );

    remainingTime(input);

    /**
     * Valida cada resposta antes da consolidação.
     * Preserva o payload bruto para evitar dupla
     * normalização na validação definitiva.
     */
    const validated = input.validate(raw);
    const record = asRecord(raw);

    if (block.questionNumbers.length > 0) {
      const actualNumbers =
        validated.questions.map(
          question => question.originalNumber
        );

      if (
        actualNumbers.length !==
          block.questionNumbers.length ||
        actualNumbers.some(
          (number, index) =>
            number !== block.questionNumbers[index]
        )
      ) {
        invalidOutput(
          'A resposta do bloco não preservou todas as questões esperadas na ordem original.'
        );
      }

      const expectedNumbers =
        new Set(block.questionNumbers);

      for (const entry of validated.answerKey) {
        if (!expectedNumbers.has(entry.questionNumber)) {
          invalidOutput(
            'O gabarito retornado referencia uma questão externa ao bloco.'
          );
        }
      }
    }

    for (const question of validated.questions) {
      const number = question.originalNumber;

      if (number !== null) {
        if (seenNumbers.has(number)) {
          invalidOutput(
            'Questão duplicada durante a consolidação dos blocos.'
          );
        }

        seenNumbers.add(number);
      }
    }

    if (validated.examMetadata !== null) {
      for (const [key, value] of Object.entries(
        validated.examMetadata
      )) {
        if (value === null || value === undefined) {
          continue;
        }

        if (
          Object.hasOwn(metadata, key) &&
          metadata[key] !== value
        ) {
          invalidOutput(
            'Foram encontrados metadados conflitantes entre os blocos.'
          );
        }

        metadata[key] = value;
      }
    }

    if (Array.isArray(record.questions)) {
      questions.push(...record.questions);
    }

    if (Array.isArray(record.answerKey)) {
      answerKey.push(...record.answerKey);
    }

    for (const warning of validated.warnings) {
      warnings.add(warning);
    }

    if (
      questions.length > input.maxQuestions ||
      answerKey.length > input.maxQuestions ||
      warnings.size > 100
    ) {
      throw new AiExtractionDomainError(
        'AI_EXTRACTION_LIMIT_EXCEEDED',
        'A consolidação excedeu os limites permitidos para o documento.',
        422
      );
    }
  }

  remainingTime(input);

  const consolidated = {
    examMetadata:
      Object.keys(metadata).length > 0
        ? metadata
        : null,

    questions,
    answerKey,
    warnings: [...warnings],
  };

  /**
   * Verifica conflitos e limites globais utilizando
   * o mesmo contrato de validação existente.
   */
  input.validate(consolidated);

  remainingTime(input);

  return consolidated;
}
