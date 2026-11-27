import {
  AiExtractionDomainError,
} from '../types/ai-extraction.types.ts';

import {
  SUPPORTED_OLLAMA_TOKENIZER_MODEL,
  assertSupportedTokenizerModel,
  countOllamaChatPromptTokens,
} from './ollama-tokenizer.service.ts';

/**
 * Politica inicial de contexto validada experimentalmente
 * para o modelo qwen2.5:3b.
 *
 * Os limites incluem o prompt completo, seus delimitadores
 * ChatML, a reserva de geracao e a margem de seguranca.
 */
export const OLLAMA_CONTEXT_POLICY = Object.freeze({
  modelName: SUPPORTED_OLLAMA_TOKENIZER_MODEL,
  contextWindowTokens: 4096,
  maxInputTokens: 1800,
  maxOutputTokens: 1536,
  safetyMarginTokens: 760,
} as const);

export interface OllamaContextBudgetInput {
  modelName: string;
  systemPrompt: string;
  userPrompt: string;
}

export interface OllamaContextBudgetResult {
  readonly modelName: string;
  readonly contextWindowTokens: number;
  readonly inputTokens: number;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly safetyMarginTokens: number;
  readonly remainingInputTokens: number;
  readonly exceedsByTokens: number;
  readonly fits: boolean;
}

/**
 * Avalia o prompt completo sem modificar ou truncar
 * o conteudo recebido.
 */
export function evaluateOllamaContextBudget(
  input: OllamaContextBudgetInput
): OllamaContextBudgetResult {
  assertSupportedTokenizerModel(input.modelName);

  const policy = OLLAMA_CONTEXT_POLICY;

  const inputTokens =
    countOllamaChatPromptTokens(input);

  const remainingInputTokens =
    policy.maxInputTokens - inputTokens;

  return {
    modelName: input.modelName,
    contextWindowTokens:
      policy.contextWindowTokens,
    inputTokens,
    maxInputTokens:
      policy.maxInputTokens,
    maxOutputTokens:
      policy.maxOutputTokens,
    safetyMarginTokens:
      policy.safetyMarginTokens,
    remainingInputTokens,
    exceedsByTokens:
      Math.max(0, -remainingInputTokens),
    fits:
      remainingInputTokens >= 0,
  };
}

/**
 * Falha de maneira explicita quando o prompt
 * excede o limite de entrada permitido.
 *
 * Nao permite truncamento silencioso nem substitui
 * a futura segmentacao semantica do documento.
 */
export function assertOllamaContextBudget(
  input: OllamaContextBudgetInput
): OllamaContextBudgetResult {
  const result =
    evaluateOllamaContextBudget(input);

  if (!result.fits) {
    throw new AiExtractionDomainError(
      'AI_EXTRACTION_LIMIT_EXCEEDED',
      'O bloco de extracao excede o orçamento seguro de tokens do modelo Ollama.',
      422
    );
  }

  return result;
}
