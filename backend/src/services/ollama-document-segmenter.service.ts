import {
  AiExtractionDomainError,
} from '../types/ai-extraction.types.ts';

import {
  evaluateOllamaContextBudget,
  type OllamaContextBudgetInput,
} from './ollama-context-budget.service.ts';

import {
  identifyOllamaDocumentBoundaries,
} from './ollama-document-boundaries.service.ts';

export const MAX_OLLAMA_DOCUMENT_BLOCKS = 32;

export interface OllamaDocumentSegmenterInput {
  readonly extractedText: string;
  readonly modelName: string;
  readonly buildPrompts: (
    text: string
  ) => Omit<OllamaContextBudgetInput, 'modelName'>;
}

export interface OllamaDocumentBlock {
  readonly index: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly originalText: string;
  readonly contextualText: string;
  readonly inheritedPage: number | null;
  readonly inputTokens: number;
  readonly questionNumbers: readonly number[];
}

export interface OllamaDocumentSegmentation {
  readonly blocks: readonly OllamaDocumentBlock[];
  readonly segmented: boolean;
}

function limitExceeded(
  message: string
): never {
  throw new AiExtractionDomainError(
    'AI_EXTRACTION_LIMIT_EXCEEDED',
    message,
    422
  );
}

export function segmentOllamaDocument(
  input: OllamaDocumentSegmenterInput
): OllamaDocumentSegmentation {
  const text = input.extractedText;

  if (
    typeof text !== 'string' ||
    text.trim().length === 0 ||
    text.length > 500_000
  ) {
    throw new AiExtractionDomainError(
      'AI_EXTRACTION_INVALID_INPUT',
      'O documento informado para segmentação é inválido.',
      400
    );
  }

  const measure = (content: string) =>
    evaluateOllamaContextBudget({
      ...input.buildPrompts(content),
      modelName: input.modelName,
    });

  /**
   * Preserva o caminho de processamento integral
   * quando o documento cabe no orçamento.
   *
   * A avaliacao integral tambem verifica a
   * presenca de delimitadores especiais.
   */
  const fullBudget = measure(text);

  if (fullBudget.fits) {
    return {
      segmented: false,
      blocks: [{
        index: 0,
        startOffset: 0,
        endOffset: text.length,
        originalText: text,
        contextualText: text,
        inheritedPage: null,
        inputTokens: fullBudget.inputTokens,
        questionNumbers: [],
      }],
    };
  }

  const boundaries =
    identifyOllamaDocumentBoundaries(text);

  if (!boundaries.canSegment) {
    limitExceeded(
      'O documento excede o orçamento de contexto e não possui fronteiras semânticas suficientemente seguras para segmentação.'
    );
  }

  const pageMarkers = [
    ...text.matchAll(
      /^\[Página ([1-9]\d{0,3})\][ \t]*\r?$/gmu
    ),
  ].map(match => ({
    offset: match.index,
    pageNumber: Number(match[1]),
  }));

  for (let index = 1; index < pageMarkers.length; index++) {
    if (
      pageMarkers[index].pageNumber <=
      pageMarkers[index - 1].pageNumber
    ) {
      limitExceeded(
        'O documento contém marcadores de páginas duplicados ou fora de ordem.'
      );
    }
  }

  const blocks: OllamaDocumentBlock[] = [];

  function createCandidate(
    startOffset: number,
    endOffset: number,
    questionNumbers: readonly number[]
  ) {
    const originalText =
      text.slice(startOffset, endOffset);

    let inheritedPage: number | null = null;

    const beginsWithPage =
      /^\s*\[Página [1-9]\d{0,3}\]/u
        .test(originalText);

    if (startOffset > 0 && !beginsWithPage) {
      for (const marker of pageMarkers) {
        if (marker.offset >= startOffset) {
          break;
        }

        inheritedPage = marker.pageNumber;
      }
    }

    const contextualText =
      inheritedPage === null
        ? originalText
        : `[Página ${inheritedPage}]\n${originalText}`;

    const budget = measure(contextualText);

    return {
      fits: budget.fits,
      block: {
        index: blocks.length,
        startOffset,
        endOffset,
        originalText,
        contextualText,
        inheritedPage,
        inputTokens: budget.inputTokens,
        questionNumbers: [...questionNumbers],
      },
    };
  }

  function appendBlock(
    block: OllamaDocumentBlock
  ): void {
    if (
      blocks.length >=
      MAX_OLLAMA_DOCUMENT_BLOCKS
    ) {
      limitExceeded(
        'O documento excede a quantidade máxima de blocos permitida para extração.'
      );
    }

    blocks.push({
      ...block,
      index: blocks.length,
    });
  }

  let pending: OllamaDocumentBlock | null = null;

  for (const unit of boundaries.units) {
    const numbers =
      unit.questionNumber === null
        ? []
        : [unit.questionNumber];

    if (pending !== null) {
      const combined = createCandidate(
        pending.startOffset,
        unit.endOffset,
        [
          ...pending.questionNumbers,
          ...numbers,
        ]
      );

      if (combined.fits) {
        pending = combined.block;
        continue;
      }

      appendBlock(pending);
      pending = null;
    }

    const individual = createCandidate(
      unit.startOffset,
      unit.endOffset,
      numbers
    );

    if (!individual.fits) {
      limitExceeded(
        'Uma unidade indivisível do documento excede o orçamento seguro de contexto do modelo.'
      );
    }

    pending = individual.block;
  }

  if (pending !== null) {
    appendBlock(pending);
  }

  /**
   * Verificacao final de cobertura integral,
   * continuidade e orcamento de cada bloco.
   */
  let offset = 0;

  for (const block of blocks) {
    if (
      block.startOffset !== offset ||
      block.endOffset <= block.startOffset ||
      block.originalText !== text.slice(
        block.startOffset,
        block.endOffset
      ) ||
      !measure(block.contextualText).fits
    ) {
      throw new AiExtractionDomainError(
        'AI_EXTRACTION_FAILED',
        'Não foi possível garantir a integridade da segmentação do documento.',
        502
      );
    }

    offset = block.endOffset;
  }

  if (
    blocks.length === 0 ||
    offset !== text.length ||
    blocks.map(
      block => block.originalText
    ).join('') !== text
  ) {
    throw new AiExtractionDomainError(
      'AI_EXTRACTION_FAILED',
      'A segmentação não preservou integralmente o documento.',
      502
    );
  }

  return {
    blocks,
    segmented: blocks.length > 1,
  };
}
