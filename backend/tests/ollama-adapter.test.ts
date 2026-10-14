import { describe, expect, it, vi } from 'vitest';
import {
  OllamaChatAdapter,
  createOllamaCompletionFn,
} from '../src/services/ollama-adapter.service.ts';
import {
  ConfigurableAiQuestionExtractionService,
  createAiQuestionExtractionService,
} from '../src/services/ai-extraction.service.ts';
import { AiExtractionDomainError } from '../src/types/ai-extraction.types.ts';
import { logger } from '../src/utils/logger.ts';

describe('Sprint 4, Etapa 4.2 — Adaptador Ollama (OllamaChatAdapter)', () => {
  const mockSystemPrompt = 'Você é um extrator de questões...';
  const mockUserPrompt = '{"untrustedDocumentText": "Questão 1..."}';

  const validModelJsonOutput = JSON.stringify({
    examMetadata: {
      title: 'Concurso TRF 2025',
      board: 'CEBRASPE',
      year: 2025,
    },
    questions: [
      {
        originalNumber: 1,
        statement: 'Assinale a alternativa correta sobre o protocolo UDP.',
        type: 'MULTIPLE_CHOICE',
        subject: 'Redes de Computadores',
        correctAnswer: 'A',
        alternatives: [
          { letter: 'A', text: 'Não orientado a conexão' },
          { letter: 'B', text: 'Orientado a conexão' },
        ],
      },
    ],
    answerKey: [],
  });

  it('1. deve construir a requisição HTTP com método POST, endpoint /api/chat, modelo e mensagens corretos (stream: false, format: json)', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;

    const mockFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(
        JSON.stringify({
          model: 'llama3.1:8b',
          message: {
            role: 'assistant',
            content: validModelJsonOutput,
          },
          done: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const adapter = new OllamaChatAdapter({
      fetchFn: mockFetch,
      baseUrl: 'http://localhost:11434',
    });

    const abortController = new AbortController();
    const result = await adapter.completeChat({
      modelName: 'llama3.1:8b',
      baseUrl: 'http://localhost:11434',
      systemPrompt: mockSystemPrompt,
      userPrompt: mockUserPrompt,
      timeoutMs: 5000,
      signal: abortController.signal,
    });

    expect(capturedUrl).toBe('http://localhost:11434/api/chat');
    expect(capturedInit?.method).toBe('POST');
    expect(capturedInit?.headers).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });

    const parsedBody = JSON.parse(capturedInit?.body as string);
    expect(parsedBody.model).toBe('llama3.1:8b');
    expect(parsedBody.stream).toBe(false);
    expect(parsedBody.format).toBe('json');
    expect(parsedBody.messages).toEqual([
      { role: 'system', content: mockSystemPrompt },
      { role: 'user', content: mockUserPrompt },
    ]);
    expect(result).toBe(validModelJsonOutput);
  });

  it('2. deve extrair somente o conteúdo textual de uma resposta válida da API', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'llama3.1:8b',
          message: {
            role: 'assistant',
            content: '{"questions": []}',
          },
          done: true,
          total_duration: 1234567,
        }),
        { status: 200 }
      )
    );

    const adapter = new OllamaChatAdapter({ fetchFn: mockFetch });
    const content = await adapter.completeChat({
      modelName: 'llama3.1:8b',
      baseUrl: 'http://localhost:11434',
      systemPrompt: 'sys',
      userPrompt: 'usr',
      timeoutMs: 5000,
      signal: new AbortController().signal,
    });

    expect(content).toBe('{"questions": []}');
  });

  it('3. deve tratar resposta HTTP de erro (ex: 500 ou 503) lançando erro de domínio apropriado sem vazar o corpo bruto', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'internal server failure details' }), {
        status: 500,
        statusText: 'Internal Server Error',
      })
    );

    const adapter = new OllamaChatAdapter({ fetchFn: mockFetch });

    try {
      await adapter.completeChat({
        modelName: 'llama3.1:8b',
        baseUrl: 'http://localhost:11434',
        systemPrompt: 'sys',
        userPrompt: 'usr',
        timeoutMs: 5000,
        signal: new AbortController().signal,
      });
      expect.fail('Deveria ter lançado erro');
    } catch (err) {
      expect(err).toBeInstanceOf(AiExtractionDomainError);
      const domainErr = err as AiExtractionDomainError;
      expect(domainErr.code).toBe('AI_EXTRACTION_FAILED');
      expect(domainErr.statusCode).toBe(502);
      expect(domainErr.message).toContain('HTTP 500');
      expect(domainErr.message).not.toContain('internal server failure details');
    }
  });

  it('4. deve tratar falha de conexão de rede convertendo para AI_EXTRACTION_UNAVAILABLE (503)', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const adapter = new OllamaChatAdapter({ fetchFn: mockFetch });

    try {
      await adapter.completeChat({
        modelName: 'llama3.1:8b',
        baseUrl: 'http://localhost:11434',
        systemPrompt: 'sys',
        userPrompt: 'usr',
        timeoutMs: 5000,
        signal: new AbortController().signal,
      });
      expect.fail('Deveria ter lançado erro');
    } catch (err) {
      expect(err).toBeInstanceOf(AiExtractionDomainError);
      const domainErr = err as AiExtractionDomainError;
      expect(domainErr.code).toBe('AI_EXTRACTION_UNAVAILABLE');
      expect(domainErr.statusCode).toBe(503);
      expect(domainErr.message).toContain('Falha de conexão com o servidor Ollama');
    }
  });

  it('5. deve propagar o AbortSignal e lançar AI_EXTRACTION_TIMEOUT (504) em caso de timeout do sinal', async () => {
    const abortController = new AbortController();
    abortController.abort(); // já abortado

    const mockFetch = vi.fn().mockImplementation(async (_url, init) => {
      if (init?.signal?.aborted) {
        const abortErr = new Error('The operation was aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      return new Response('{}');
    });

    const adapter = new OllamaChatAdapter({ fetchFn: mockFetch });

    try {
      await adapter.completeChat({
        modelName: 'llama3.1:8b',
        baseUrl: 'http://localhost:11434',
        systemPrompt: 'sys',
        userPrompt: 'usr',
        timeoutMs: 3000,
        signal: abortController.signal,
      });
      expect.fail('Deveria ter lançado erro de timeout');
    } catch (err) {
      expect(err).toBeInstanceOf(AiExtractionDomainError);
      const domainErr = err as AiExtractionDomainError;
      expect(domainErr.code).toBe('AI_EXTRACTION_TIMEOUT');
      expect(domainErr.statusCode).toBe(504);
      expect(domainErr.message).toContain('3000 ms');
    }
  });

  it('6. deve rejeitar envelope JSON malformado ou não-JSON com AI_EXTRACTION_INVALID_OUTPUT (422)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('<html><body>502 Bad Gateway</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    );

    const adapter = new OllamaChatAdapter({ fetchFn: mockFetch });

    try {
      await adapter.completeChat({
        modelName: 'llama3.1:8b',
        baseUrl: 'http://localhost:11434',
        systemPrompt: 'sys',
        userPrompt: 'usr',
        timeoutMs: 5000,
        signal: new AbortController().signal,
      });
      expect.fail('Deveria ter lançado erro');
    } catch (err) {
      expect(err).toBeInstanceOf(AiExtractionDomainError);
      const domainErr = err as AiExtractionDomainError;
      expect(domainErr.code).toBe('AI_EXTRACTION_INVALID_OUTPUT');
      expect(domainErr.statusCode).toBe(422);
    }
  });

  it('7. deve rejeitar conteúdo textual do modelo ausente, nulo ou vazio com AI_EXTRACTION_INVALID_OUTPUT (422)', async () => {
    // 7.1 Mensagem sem content
    const mockFetchNoContent = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ model: 'llama3.1:8b', message: { role: 'assistant' } }))
    );
    const adapter1 = new OllamaChatAdapter({ fetchFn: mockFetchNoContent });
    await expect(
      adapter1.completeChat({
        modelName: 'llama3.1:8b',
        baseUrl: 'http://localhost:11434',
        systemPrompt: 'sys',
        userPrompt: 'usr',
        timeoutMs: 5000,
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({
      code: 'AI_EXTRACTION_INVALID_OUTPUT',
      statusCode: 422,
    });

    // 7.2 Content vazio
    const mockFetchEmpty = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'llama3.1:8b',
          message: { role: 'assistant', content: '   ' },
        })
      )
    );
    const adapter2 = new OllamaChatAdapter({ fetchFn: mockFetchEmpty });
    await expect(
      adapter2.completeChat({
        modelName: 'llama3.1:8b',
        baseUrl: 'http://localhost:11434',
        systemPrompt: 'sys',
        userPrompt: 'usr',
        timeoutMs: 5000,
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({
      code: 'AI_EXTRACTION_INVALID_OUTPUT',
      statusCode: 422,
    });
  });

  it('8. deve identificar modelo inexistente quando Ollama responder 404 ou reportar model not found com AI_EXTRACTION_UNAVAILABLE (503)', async () => {
    const mockFetch404 = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'model "llama3.1:nonexistent" not found, try pulling it first' }), {
        status: 404,
      })
    );

    const adapter = new OllamaChatAdapter({ fetchFn: mockFetch404 });

    try {
      await adapter.completeChat({
        modelName: 'llama3.1:nonexistent',
        baseUrl: 'http://localhost:11434',
        systemPrompt: 'sys',
        userPrompt: 'usr',
        timeoutMs: 5000,
        signal: new AbortController().signal,
      });
      expect.fail('Deveria ter lançado erro');
    } catch (err) {
      expect(err).toBeInstanceOf(AiExtractionDomainError);
      const domainErr = err as AiExtractionDomainError;
      expect(domainErr.code).toBe('AI_EXTRACTION_UNAVAILABLE');
      expect(domainErr.statusCode).toBe(503);
      expect(domainErr.message).toContain('não foi encontrado no servidor Ollama');
    }
  });

  it('9. não deve vazar prompts, texto do documento ou respostas brutas nos logs do adapter', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');
    const mockFetchFail = vi.fn().mockRejectedValue(new Error('Sensitive network glitch'));

    const adapter = new OllamaChatAdapter({ fetchFn: mockFetchFail });

    try {
      await adapter.completeChat({
        modelName: 'llama3.1:8b',
        baseUrl: 'http://localhost:11434',
        systemPrompt: 'SEGREDO_SISTEMA_NAO_VAZAR',
        userPrompt: 'TEXTO_CONFIDENCIAL_PDF_NAO_VAZAR',
        timeoutMs: 5000,
        signal: new AbortController().signal,
      });
    } catch {
      // Ignora erro esperado
    }

    expect(warnSpy).toHaveBeenCalledWith(
      'ollama_connection_failed',
      expect.objectContaining({
        sanitizedHost: 'http://localhost:11434',
        modelName: 'llama3.1:8b',
      })
    );

    // Confirma que os argumentos do logger NÃO contêm prompts ou textos
    const calls = warnSpy.mock.calls;
    for (const call of calls) {
      const serializedCall = JSON.stringify(call);
      expect(serializedCall).not.toContain('SEGREDO_SISTEMA_NAO_VAZAR');
      expect(serializedCall).not.toContain('TEXTO_CONFIDENCIAL_PDF_NAO_VAZAR');
    }

    warnSpy.mockRestore();
  });

  it('10. deve se integrar perfeitamente com ConfigurableAiQuestionExtractionService e manter as validações da Etapa 4.1', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'llama3.1:8b',
          message: {
            role: 'assistant',
            content: validModelJsonOutput,
          },
          done: true,
        }),
        { status: 200 }
      )
    );

    const completionFn = createOllamaCompletionFn({
      fetchFn: mockFetch,
      baseUrl: 'http://localhost:11434',
      defaultModel: 'llama3.1:8b',
    });

    const service = new ConfigurableAiQuestionExtractionService({
      providerName: 'ollama',
      modelName: 'llama3.1:8b',
      baseUrl: 'http://localhost:11434',
      completionFn,
    });

    expect(service.isAvailable()).toBe(true);

    const result = await service.extractQuestionsFromText({
      extractedText: 'Texto com mais de vinte caracteres para passar na validação de entrada.',
      sourceDocumentId: 'doc-ollama-live',
    });

    expect(result.providerName).toBe('ollama');
    expect(result.modelName).toBe('llama3.1:8b');
    expect(result.totalExtractedQuestions).toBe(1);
    expect(result.questions[0].statement).toBe(
      'Assinale a alternativa correta sobre o protocolo UDP.'
    );
    expect(result.questions[0].status).toBe('NEEDS_REVIEW');
    expect(result.questions[0].requiresHumanReview).toBe(true);
    expect(result.questions[0].correctAnswer).toBe('A');
  });

  it('11. checkAvailability deve verificar tags no endpoint GET /api/tags com timeout curto e distinguir se o modelo existe', async () => {
    // 11.1 Servidor responde com modelo existente
    const createSuccessResponse = () =>
      new Response(
        JSON.stringify({
          models: [{ name: 'llama3.1:8b' }, { name: 'qwen2.5:7b' }],
        }),
        { status: 200 }
      );

    const mockFetchAvailable = vi.fn().mockImplementation(async () => createSuccessResponse());

    const adapter1 = new OllamaChatAdapter({
      fetchFn: mockFetchAvailable,
      defaultModel: 'llama3.1:8b',
    });

    const status1 = await adapter1.checkAvailability();
    expect(status1.reachable).toBe(true);
    expect(status1.modelAvailableOnServer).toBe(true);
    expect(status1.message).toContain('ativo e modelo "llama3.1:8b" disponível');

    // 11.2 Servidor responde mas modelo não existe
    const adapter2 = new OllamaChatAdapter({
      fetchFn: mockFetchAvailable,
      defaultModel: 'deepseek-r1:8b',
    });

    const status2 = await adapter2.checkAvailability();
    expect(status2.reachable).toBe(true);
    expect(status2.modelAvailableOnServer).toBe(false);
    expect(status2.message).toContain('não foi encontrado');

    // 11.3 Servidor inacessível
    const mockFetchDown = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const adapter3 = new OllamaChatAdapter({
      fetchFn: mockFetchDown,
      defaultModel: 'llama3.1:8b',
    });

    const status3 = await adapter3.checkAvailability();
    expect(status3.reachable).toBe(false);
    expect(status3.modelAvailableOnServer).toBe(false);
    expect(status3.message).toContain('inacessível');
  });

  it('12. createAiQuestionExtractionService factory deve instanciar Unconfigured se modelo não informado e Configurable quando modelo configurado', () => {
    // Sem modelo: retorna Unconfigured honesto
    const unconfigured = createAiQuestionExtractionService({ modelName: null });
    expect(unconfigured.isAvailable()).toBe(false);
    expect(unconfigured.getStatus().available).toBe(false);

    // Com modelo configurado: instancia Configurable conectado
    const configured = createAiQuestionExtractionService({
      modelName: 'llama3.1:8b',
      baseUrl: 'http://localhost:11434',
    });
    expect(configured.isAvailable()).toBe(true);
    expect(configured.getStatus().available).toBe(true);
  });
});
