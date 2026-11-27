import {
  AiExtractionDomainError,
} from '../types/ai-extraction.types.ts';

export interface OllamaDocumentUnit {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly text: string;
  readonly questionNumber: number | null;
}

export interface OllamaDocumentBoundaries {
  readonly units: readonly OllamaDocumentUnit[];
  readonly canSegment: boolean;
  readonly reason:
    | 'EXPLICIT_QUESTION_BOUNDARIES'
    | 'INSUFFICIENT_BOUNDARIES'
    | 'AMBIGUOUS_QUESTION_REFERENCES'
    | 'NON_SEQUENTIAL_QUESTIONS'
    | 'SHARED_CONTEXT_OR_ANSWER_KEY';
}

/**
 * Identifica fronteiras candidatas sem modificar
 * o texto original.
 *
 * Esta camada nao autoriza cortes arbitrarios
 * nem realiza inferencia.
 */
export function identifyOllamaDocumentBoundaries(
  text: string
): OllamaDocumentBoundaries {
  if (
    typeof text !== 'string' ||
    text.trim().length === 0 ||
    text.length > 500_000
  ) {
    throw new AiExtractionDomainError(
      'AI_EXTRACTION_INVALID_INPUT',
      'O texto informado para segmentação é inválido.',
      400
    );
  }

  const indivisible = (
    reason: OllamaDocumentBoundaries['reason']
  ): OllamaDocumentBoundaries => ({
    canSegment: false,
    reason,
    units: [{
      startOffset: 0,
      endOffset: text.length,
      text,
      questionNumber: null,
    }],
  });

  /**
   * Textos compartilhados e gabaritos exigem
   * tratamento semantico especializado.
   *
   * Nesta etapa permanecem indivisiveis.
   */
  const sharedContextPattern =
    /\b(?:gabarito|texto\s+(?:de\s+apoio|para|base)|quest(?:ões|oes)\s+\d+|(?:itens|quest(?:ões|oes))\s+(?:seguintes|subsequentes)|com\s+base\s+no\s+texto|leia\s+(?:atentamente\s+)?(?:o|a)\s+(?:texto|trecho|passagem|fragmento)|(?:texto|trecho|passagem|fragmento)\s+(?:abaixo|acima|anterior|seguinte)|com\s+base\s+no\s+trecho)\b/iu;

  if (sharedContextPattern.test(text)) {
    return indivisible(
      'SHARED_CONTEXT_OR_ANSWER_KEY'
    );
  }

  const candidates = [
    ...text.matchAll(
      /(?<![\p{L}\p{N}_])quest(?:ão|ao)[ \t]+(\d{1,4})\b/giu
    ),
  ];

  if (candidates.length < 2) {
    return indivisible(
      'INSUFFICIENT_BOUNDARIES'
    );
  }

  const boundaries: {
    offset: number;
    questionNumber: number;
  }[] = [];

  for (const candidate of candidates) {
    const offset = candidate.index;
    const questionNumber = Number(candidate[1]);

    const suffix = text.slice(
      offset + candidate[0].length
    );

    /**
     * Exige separador explicito ou fim de linha
     * depois da numeracao.
     */
    const explicitSuffix =
      /^[ \t]*(?:[-–—:.]|\r?\n|$)/u.test(suffix);

    const previousLineStart =
      text.lastIndexOf('\n', offset - 1) + 1;

    const linePrefix = text.slice(
      previousLineStart,
      offset
    );

    const startsLine =
      linePrefix.trim().length === 0;

    /**
     * Para texto digital linear, exige rotulo
     * iniciado por letra maiuscula.
     *
     * Continua sendo uma heuristica conservadora,
     * nao uma prova de independencia semantica.
     */
    const explicitLinearLabel =
      /^QUEST(?:ÃO|AO)$|^Quest(?:ão|ao)$/u.test(
        candidate[0].split(/[ \t]+/u)[0]
      );

    if (
      !explicitSuffix ||
      (!startsLine && !explicitLinearLabel) ||
      questionNumber <= 0
    ) {
      return indivisible(
        'AMBIGUOUS_QUESTION_REFERENCES'
      );
    }

    boundaries.push({
      offset,
      questionNumber,
    });
  }

  for (let index = 1; index < boundaries.length; index++) {
    if (
      boundaries[index].questionNumber !==
      boundaries[index - 1].questionNumber + 1
    ) {
      return indivisible(
        'NON_SEQUENTIAL_QUESTIONS'
      );
    }
  }

  /**
   * Exige evidencias adicionais de alternativas
   * independentes em cada unidade candidata.
   *
   * Formatos nao reconhecidos permanecem indivisiveis.
   */
  for (let index = 0; index < boundaries.length; index++) {
    const start = boundaries[index].offset;
    const end =
      boundaries[index + 1]?.offset ?? text.length;

    const candidateText = text.slice(start, end);

    const alternatives = [
      ...candidateText.matchAll(
        /(?:^|\s)([A-J])\)[ \t]*/gu
      ),
    ].map(match => match[1]);

    if (
      alternatives.length < 2 ||
      alternatives.length > 10 ||
      alternatives.some(
        (letter, position) =>
          letter !== String.fromCharCode(65 + position)
      )
    ) {
      return indivisible(
        'AMBIGUOUS_QUESTION_REFERENCES'
      );
    }
  }

  const units: OllamaDocumentUnit[] =
    boundaries.map((boundary, index) => {
      const startOffset =
        index === 0 ? 0 : boundary.offset;

      const endOffset =
        boundaries[index + 1]?.offset ??
        text.length;

      return {
        startOffset,
        endOffset,
        text: text.slice(startOffset, endOffset),
        questionNumber: boundary.questionNumber,
      };
    });

  return {
    canSegment: true,
    reason: 'EXPLICIT_QUESTION_BOUNDARIES',
    units,
  };
}
