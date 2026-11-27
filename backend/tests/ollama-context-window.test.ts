// @vitest-environment node

import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  ConfigurableAiQuestionExtractionService,
  buildQuestionExtractionPrompts,
} from '../src/services/ai-extraction.service.ts';

import {
  evaluateOllamaContextBudget,
  OLLAMA_CONTEXT_POLICY,
} from '../src/services/ollama-context-budget.service.ts';

import {
  segmentOllamaDocument,
} from '../src/services/ollama-document-segmenter.service.ts';

const modelName = 'qwen2.5:3b';

const question = (
  number: number,
  repetitions = 60
) =>
  `Questão ${number} - Enunciado de teste. ` +
  'Considere os dados apresentados. '.repeat(repetitions) +
  'A) Primeira alternativa B) Segunda alternativa.\n';

const smallDocument =
  '[Página 1]\n' + question(1, 2);

const largeDocument =
  '[Página 1]\n' +
  Array.from(
    { length: 8 },
    (_, index) => question(index + 1)
  ).join('');

const buildPrompts = (extractedText: string) =>
  buildQuestionExtractionPrompts({
    extractedText,
    maxQuestions: 100,
  });

function createService(timeoutMs = 10_000) {
  return new ConfigurableAiQuestionExtractionService({
    modelName,
    baseUrl: 'http://localhost:11434',
    timeoutMs,
    maxQuestionsPerDocument: 100,
  });
}

type MockMode =
  | 'SUCCESS'
  | 'TRUNCATED'
  | 'TOKEN_MISMATCH'
  | 'MISSING_DONE'
  | 'OUTPUT_OVERFLOW'
  | 'OMITTED_QUESTION'
  | 'SECOND_BLOCK_FAILURE';

function mockOllama(mode: MockMode = 'SUCCESS') {
  const calls: {
    numbers: number[];
    inputTokens: number;
    options: Record<string, unknown>;
  }[] = [];

  let active = 0;
  let maxActive = 0;

  const fetchMock = vi.fn(
    async (
      _url: unknown,
      init?: RequestInit
    ) => {
      active++;
      maxActive = Math.max(maxActive, active);

      try {
        const body = JSON.parse(String(init?.body));

        expect(body.model).toBe(modelName);
        expect(body.stream).toBe(false);
        expect(body.format).toBeTypeOf('object');

        const systemPrompt =
          body.messages[0].content;

        const userPrompt =
          body.messages[1].content;

        const budget = evaluateOllamaContextBudget({
          modelName,
          systemPrompt,
          userPrompt,
        });

        expect(budget.fits).toBe(true);

        const document = JSON.parse(
          userPrompt.split('\n').slice(1).join('\n')
        ).untrustedDocumentText as string;

        const numbers = [
          ...document.matchAll(
            /Questão (\d+) -/gu
          ),
        ].map(match => Number(match[1]));

        calls.push({
          numbers,
          inputTokens: budget.inputTokens,
          options: body.options,
        });

        await Promise.resolve();

        if (
          mode === 'SECOND_BLOCK_FAILURE' &&
          calls.length === 2
        ) {
          return new Response(
            JSON.stringify({
              error: 'SIMULATED_FAILURE',
            }),
            { status: 500 }
          );
        }

        const questions = numbers.map(number => ({
          originalNumber: number,
          statement: `Enunciado da questão ${number}.`,
          type: 'MULTIPLE_CHOICE',
          subject: 'Matemática',
          correctAnswer: null,
          alternatives: [
            {
              letter: 'A',
              text: 'Primeira alternativa',
            },
            {
              letter: 'B',
              text: 'Segunda alternativa',
            },
          ],
          sourcePage: 1,
          status: 'NEEDS_REVIEW',
        }));

        if (mode === 'OMITTED_QUESTION') {
          questions.pop();
        }

        const payload = {
          examMetadata: calls.length === 1
            ? { board: 'CEBRASPE' }
            : null,

          questions,
          answerKey: [],
          warnings: [],
        };

        return new Response(
          JSON.stringify({
            model: modelName,

            done: mode === 'MISSING_DONE'
              ? undefined
              : true,

            done_reason: mode === 'TRUNCATED'
              ? 'length'
              : 'stop',

            prompt_eval_count:
              mode === 'TOKEN_MISMATCH'
                ? budget.inputTokens - 1
                : budget.inputTokens,

            eval_count:
              mode === 'OUTPUT_OVERFLOW'
                ? 1537
                : 200,

            message: {
              role: 'assistant',
              content: JSON.stringify(payload),
            },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      } finally {
        active--;
      }
    }
  );

  vi.stubGlobal('fetch', fetchMock);

  return {
    calls,
    fetchMock,
    getMaxActive: () => maxActive,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AUD-OLLAMA-03 — Janela de contexto', () => {
  it('mantém a política de contexto consistente', () => {
    const policy = OLLAMA_CONTEXT_POLICY;

    expect(policy.contextWindowTokens).toBe(4096);
    expect(policy.maxInputTokens).toBe(1800);
    expect(policy.maxOutputTokens).toBe(1536);

    expect(
      policy.maxInputTokens +
      policy.maxOutputTokens +
      policy.safetyMarginTokens
    ).toBe(policy.contextWindowTokens);
  });

  it('preserva integralmente o documento segmentado', () => {
    const result = segmentOllamaDocument({
      extractedText: largeDocument,
      modelName,
      buildPrompts,
    });

    expect(result.segmented).toBe(true);

    expect(
      result.blocks.map(
        block => block.originalText
      ).join('')
    ).toBe(largeDocument);

    expect(
      result.blocks.flatMap(
        block => block.questionNumbers
      )
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    expect(
      result.blocks.every(
        block => block.inputTokens <= 1800
      )
    ).toBe(true);
  });

  it('processa documento pequeno em uma única chamada', async () => {
    const mock = mockOllama();

    const result = await createService()
      .extractQuestionsFromText({
        extractedText: smallDocument,
        pageCount: 1,
      });

    expect(mock.calls).toHaveLength(1);
    expect(result.totalExtractedQuestions).toBe(1);

    expect(mock.calls[0].options).toMatchObject({
      num_ctx: 4096,
      num_predict: 1536,
    });
  });

  it('processa documentos extensos sequencialmente', async () => {
    const mock = mockOllama();

    const result = await createService()
      .extractQuestionsFromText({
        extractedText: largeDocument,
        pageCount: 1,
      });

    expect(mock.calls.length).toBeGreaterThan(1);
    expect(mock.getMaxActive()).toBe(1);

    expect(result.totalExtractedQuestions).toBe(8);

    expect(
      result.questions.map(q => q.originalNumber)
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    expect(
      result.questions.every(
        q =>
          q.board === 'CEBRASPE' &&
          q.requiresHumanReview === true
      )
    ).toBe(true);

    for (const call of mock.calls) {
      expect(call.inputTokens).toBeLessThanOrEqual(1800);

      expect(call.options).toMatchObject({
        num_ctx: 4096,
        num_predict: 1536,
      });
    }
  });

  it.each([
    'TRUNCATED',
    'TOKEN_MISMATCH',
    'MISSING_DONE',
    'OUTPUT_OVERFLOW',
  ] as const)(
    'rejeita envelope inconsistente: %s',
    async mode => {
      const mock = mockOllama(mode);

      await expect(
        createService().extractQuestionsFromText({
          extractedText: smallDocument,
        })
      ).rejects.toMatchObject({
        code: 'AI_EXTRACTION_INVALID_OUTPUT',
        statusCode: 422,
      });

      expect(mock.calls).toHaveLength(1);
    }
  );

  it('rejeita questões omitidas em blocos', async () => {
    mockOllama('OMITTED_QUESTION');

    await expect(
      createService().extractQuestionsFromText({
        extractedText: largeDocument,
      })
    ).rejects.toMatchObject({
      code: 'AI_EXTRACTION_SCHEMA_MISMATCH',
      statusCode: 422,
    });
  });

  it('interrompe o documento quando um bloco falha', async () => {
    const mock = mockOllama(
      'SECOND_BLOCK_FAILURE'
    );

    await expect(
      createService().extractQuestionsFromText({
        extractedText: largeDocument,
      })
    ).rejects.toMatchObject({
      code: 'AI_EXTRACTION_FAILED',
      statusCode: 502,
    });

    expect(mock.calls).toHaveLength(2);
  });

  it('rejeita documento extenso com gabarito compartilhado', async () => {
    const mock = mockOllama();

    await expect(
      createService().extractQuestionsFromText({
        extractedText:
          largeDocument +
          '\nGabarito oficial: 1-A 2-B',
      })
    ).rejects.toMatchObject({
      code: 'AI_EXTRACTION_LIMIT_EXCEEDED',
      statusCode: 422,
    });

    expect(mock.calls).toHaveLength(0);
  });

  it('rejeita delimitadores especiais reservados', async () => {
    const mock = mockOllama();

    await expect(
      createService().extractQuestionsFromText({
        extractedText:
          smallDocument + '\n<|im_start|>',
      })
    ).rejects.toMatchObject({
      code: 'AI_EXTRACTION_INVALID_INPUT',
      statusCode: 400,
    });

    expect(mock.calls).toHaveLength(0);
  });

  it('rejeita documento acima do limite de questões antes da inferência', async () => {
    const mock = mockOllama();

    await expect(
      createService().extractQuestionsFromText({
        extractedText: largeDocument,
        maxQuestions: 2,
      })
    ).rejects.toMatchObject({
      code: 'AI_EXTRACTION_LIMIT_EXCEEDED',
      statusCode: 422,
    });

    expect(mock.calls).toHaveLength(0);
  });

  it('respeita cancelamento anterior à inferência', async () => {
    const mock = mockOllama();
    const controller = new AbortController();

    controller.abort();

    await expect(
      createService().extractQuestionsFromText({
        extractedText: smallDocument,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({
      code: 'AI_EXTRACTION_TIMEOUT',
      statusCode: 504,
    });

    expect(mock.calls).toHaveLength(0);
  });

  it('respeita timeout mesmo quando o transporte ignora o sinal', async () => {
    let receivedSignal: AbortSignal | null = null;

    const fetchMock = vi.fn(
      async (
        _url: unknown,
        init?: RequestInit
      ): Promise<Response> => {
        receivedSignal = init?.signal ?? null;

        return new Promise<Response>(() => {});
      }
    );

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createService(500).extractQuestionsFromText({
        extractedText: smallDocument,
      })
    ).rejects.toMatchObject({
      code: 'AI_EXTRACTION_TIMEOUT',
      statusCode: 504,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(receivedSignal).not.toBeNull();

    expect(
      (receivedSignal as AbortSignal | null)?.aborted
    ).toBe(true);
  });
});


describe('Orçamento temporal sequencial', () => {
  async function createSequentialFixture() {
    const {
      executeOllamaSequentialExtraction,
    } = await import(
      '../src/services/ollama-sequential-extraction.service.ts'
    );

    const blocks = [1, 2].map((number, index) => ({
      index,
      startOffset: index * 100,
      endOffset: (index + 1) * 100,
      originalText: `Questão ${number}`,
      contextualText: `Questão ${number}`,
      inheritedPage: null,
      inputTokens: 1000,
      questionNumbers: [number],
    }));

    const {
      validateAndNormalizeAiExtractionPayload,
    } = await import(
      '../src/validators/ai-extraction.validator.ts'
    );

    const validate = (payload: unknown) =>
      validateAndNormalizeAiExtractionPayload(
        payload,
        {
          sourceDocumentId: null,
          defaultSubject: null,
          defaultBoard: null,
          defaultExamTitle: null,
          defaultYear: null,
          maxQuestions: 2,
          pageCount: 1,
        }
      );

    function createQuestion(number: number) {
      return {
        originalNumber: number,
        statement: `Enunciado da questão ${number}.`,
        type: 'MULTIPLE_CHOICE',
        subject: 'Matemática',
        correctAnswer: null,
        alternatives: [
          {
            letter: 'A',
            text: 'Primeira alternativa',
          },
          {
            letter: 'B',
            text: 'Segunda alternativa',
          },
        ],
        sourcePage: 1,
        status: 'NEEDS_REVIEW',
      };
    }

    return {
      executeOllamaSequentialExtraction,
      blocks,
      validate,
      createQuestion,
    };
  }

  it('permite inferência superior a 45 segundos sem renovar o prazo global', async () => {
    const fixture = await createSequentialFixture();

    const now = Date.now();
    let currentTime = now;

    vi.spyOn(Date, 'now')
      .mockImplementation(() => currentTime);

    const receivedTimeouts: number[] = [];

    const result =
      await fixture.executeOllamaSequentialExtraction({
        blocks: fixture.blocks,
        maxQuestions: 2,
        signal: new AbortController().signal,
        deadlineAt: now + 240_000,
        validate: fixture.validate,

        complete: async (block, timeoutMs) => {
          receivedTimeouts.push(timeoutMs);

          currentTime += 60_000;

          return {
            questions: [
              fixture.createQuestion(
                block.questionNumbers[0]
              ),
            ],
            answerKey: [],
            warnings: [],
          };
        },
      });

    expect(receivedTimeouts).toEqual([
      240_000,
      180_000,
    ]);

    expect(result).toMatchObject({
      questions: [
        { originalNumber: 1 },
        { originalNumber: 2 },
      ],
    });
  });

  it('interrompe a consolidação quando o prazo global é esgotado', async () => {
    const fixture = await createSequentialFixture();

    const now = Date.now();
    let currentTime = now;

    vi.spyOn(Date, 'now')
      .mockImplementation(() => currentTime);

    const complete = vi.fn(async () => {
      currentTime += 240_001;

      return {
        questions: [fixture.createQuestion(1)],
        answerKey: [],
        warnings: [],
      };
    });

    await expect(
      fixture.executeOllamaSequentialExtraction({
        blocks: fixture.blocks,
        maxQuestions: 2,
        signal: new AbortController().signal,
        deadlineAt: now + 240_000,
        validate: fixture.validate,
        complete,
      })
    ).rejects.toMatchObject({
      code: 'AI_EXTRACTION_TIMEOUT',
      statusCode: 504,
    });

    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('não inicia outro bloco após cancelamento externo', async () => {
    const fixture = await createSequentialFixture();

    const controller = new AbortController();

    const complete = vi.fn(async () => {
      controller.abort();

      return {
        questions: [fixture.createQuestion(1)],
        answerKey: [],
        warnings: [],
      };
    });

    await expect(
      fixture.executeOllamaSequentialExtraction({
        blocks: fixture.blocks,
        maxQuestions: 2,
        signal: controller.signal,
        deadlineAt: Date.now() + 240_000,
        validate: fixture.validate,
        complete,
      })
    ).rejects.toMatchObject({
      code: 'AI_EXTRACTION_TIMEOUT',
      statusCode: 504,
    });

    expect(complete).toHaveBeenCalledTimes(1);
  });
});
