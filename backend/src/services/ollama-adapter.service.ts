import { AiExtractionDomainError } from '../types/ai-extraction.types.ts';
import type { AiModelCompletionContext } from './ai-extraction.service.ts';
import { logger } from '../utils/logger.ts';

export interface OllamaChatAdapterOptions {
  fetchFn?: typeof fetch;
  baseUrl?: string;
  defaultModel?: string;
  defaultTimeoutMs?: number;
}

export interface OllamaModelInfo {
  name: string;
  model?: string;
  modified_at?: string;
  size?: number;
}

export interface OllamaTagsResponse {
  models?: OllamaModelInfo[];
}

export interface OllamaChatResponseEnvelope {
  model?: string;
  message?: {
    role?: string;
    content?: string;
  };
  done?: boolean;
  total_duration?: number;
  error?: string;
}

export interface OllamaHealthStatus {
  reachable: boolean;
  modelConfigured: string | null;
  modelAvailableOnServer: boolean | null;
  message: string;
}

/**
 * Adaptador concreto de comunicação HTTP com o Ollama (Sprint 4 — Etapa 4.2).
 *
 * Responsabilidade estrita:
 * 1. Enviar requisições HTTP seguras para o endpoint `POST /api/chat` do Ollama com `stream: false`
 *    e `format: 'json'`.
 * 2. Propagar o `AbortSignal` e o tempo limite para o `fetch`.
 * 3. Validar a resposta em 3 níveis distintos:
 *    - Nível 1: Resposta HTTP de rede e status code (404, 503, 500, etc.).
 *    - Nível 2: Envelope JSON retornado pela API do Ollama (`response.json()`).
 *    - Nível 3: Presença e integridade do conteúdo textual do modelo (`message.content`).
 * 4. Jamais expor credenciais, URLs internas com credenciais, texto bruto do PDF ou prompts em
 *    mensagens públicas ou logs.
 * 5. Não duplicar regras de negócio nem o schema de domínio Zod, entregando o conteúdo extraído
 *    ao validador existente da Etapa 4.1.
 */
export class OllamaChatAdapter {
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;
  private readonly defaultModel?: string;
  private readonly defaultTimeoutMs?: number;

  constructor(options: OllamaChatAdapterOptions = {}) {
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.baseUrl = (options.baseUrl ?? 'http://localhost:11434').replace(/\/+$/, '');
    this.defaultModel = options.defaultModel;
    this.defaultTimeoutMs = options.defaultTimeoutMs;
  }

  /**
   * Sanitiza a URL base para exibição segura em logs e mensagens (sem paths acidentais ou credenciais).
   */
  private getSanitizedOrigin(targetUrl?: string): string {
    try {
      const parsed = new URL(targetUrl || this.baseUrl);
      return parsed.origin;
    } catch {
      return 'ollama://configured-host';
    }
  }

  /**
   * Verifica a disponibilidade do servidor Ollama e se o modelo configurado existe localmente.
   * Não realiza chamadas repetidas por questão e opera com timeout curto dedicado (padrão 4000ms).
   */
  async checkAvailability(options?: {
    modelName?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<OllamaHealthStatus> {
    const modelTarget = options?.modelName ?? this.defaultModel ?? null;
    const timeoutMs = options?.timeoutMs ?? 4000;
    const sanitizedHost = this.getSanitizedOrigin();

    if (!modelTarget) {
      return {
        reachable: false,
        modelConfigured: null,
        modelAvailableOnServer: null,
        message: 'Nenhum modelo Ollama está configurado (OLLAMA_MODEL não definido).',
      };
    }

    const abortController = new AbortController();
    const externalSignal = options?.signal;
    const onExternalAbort = () => abortController.abort();

    if (externalSignal) {
      if (externalSignal.aborted) {
        abortController.abort();
      } else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }

    const timer = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await this.fetchFn(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: abortController.signal,
      });

      if (!response.ok) {
        return {
          reachable: false,
          modelConfigured: modelTarget,
          modelAvailableOnServer: false,
          message: `Servidor Ollama em ${sanitizedHost} respondeu com status HTTP ${response.status}.`,
        };
      }

      const body = (await response.json()) as OllamaTagsResponse;
      const modelsList = Array.isArray(body?.models) ? body.models : [];
      const isModelPresent = modelsList.some(
        (m) =>
          m.name === modelTarget ||
          m.model === modelTarget ||
          m.name?.startsWith(`${modelTarget}:`) ||
          m.model?.startsWith(`${modelTarget}:`)
      );

      return {
        reachable: true,
        modelConfigured: modelTarget,
        modelAvailableOnServer: isModelPresent,
        message: isModelPresent
          ? `Servidor Ollama ativo e modelo "${modelTarget}" disponível.`
          : `Servidor Ollama ativo em ${sanitizedHost}, porém o modelo "${modelTarget}" não foi encontrado.`,
      };
    } catch {
      return {
        reachable: false,
        modelConfigured: modelTarget,
        modelAvailableOnServer: false,
        message: `Servidor Ollama inacessível em ${sanitizedHost}.`,
      };
    } finally {
      clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  /**
   * Executa a chamada `POST /api/chat` para obter a conclusão estruturada do Ollama.
   * Atende à assinatura `AiStructuredCompletionFn` para integração direta com `ConfigurableAiQuestionExtractionService`.
   */
  async completeChat(context: AiModelCompletionContext): Promise<string> {
    const targetBaseUrl = (context.baseUrl || this.baseUrl).replace(/\/+$/, '');
    const sanitizedHost = this.getSanitizedOrigin(targetBaseUrl);
    const endpoint = `${targetBaseUrl}/api/chat`;

    const requestBody = {
      model: context.modelName,
      messages: [
        {
          role: 'system',
          content: context.systemPrompt,
        },
        {
          role: 'user',
          content: context.userPrompt,
        },
      ],
      stream: false,
      format: 'json',
      options: {
        temperature: 0.1,
      },
    };

    let response: Response;
    try {
      response = await this.fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: context.signal,
      });
    } catch (fetchError: unknown) {
      if (
        context.signal.aborted ||
        (fetchError instanceof Error && fetchError.name === 'AbortError')
      ) {
        throw new AiExtractionDomainError(
          'AI_EXTRACTION_TIMEOUT',
          `A comunicação com o provedor Ollama excedeu o tempo limite de ${context.timeoutMs} ms.`,
          504
        );
      }

      logger.warn('ollama_connection_failed', {
        sanitizedHost,
        modelName: context.modelName,
        errorName: fetchError instanceof Error ? fetchError.name : 'NetworkError',
      });

      throw new AiExtractionDomainError(
        'AI_EXTRACTION_UNAVAILABLE',
        `Falha de conexão com o servidor Ollama em ${sanitizedHost}. Verifique se o serviço está ativo.`,
        503
      );
    }

    // Nível 1: Validação do status HTTP da resposta
    if (!response.ok) {
      let errorBodyMessage = '';
      try {
        const errJson = (await response.json()) as { error?: string };
        if (errJson && typeof errJson.error === 'string') {
          errorBodyMessage = errJson.error;
        }
      } catch {
        // Ignora falha de parse do corpo de erro HTTP
      }

      logger.warn('ollama_http_error', {
        status: response.status,
        modelName: context.modelName,
        sanitizedHost,
      });

      // Modelo inexistente ou não baixado
      if (
        response.status === 404 ||
        /model .* not found|pull model/i.test(errorBodyMessage)
      ) {
        throw new AiExtractionDomainError(
          'AI_EXTRACTION_UNAVAILABLE',
          `O modelo "${context.modelName}" não foi encontrado no servidor Ollama.`,
          503
        );
      }

      if (response.status === 503 || response.status === 502) {
        throw new AiExtractionDomainError(
          'AI_EXTRACTION_UNAVAILABLE',
          `O serviço Ollama em ${sanitizedHost} está temporariamente indisponível (HTTP ${response.status}).`,
          503
        );
      }

      throw new AiExtractionDomainError(
        'AI_EXTRACTION_FAILED',
        `O servidor Ollama retornou erro HTTP ${response.status}.`,
        502
      );
    }

    // Nível 2: Validação do envelope JSON retornado pela API do Ollama
    let envelope: OllamaChatResponseEnvelope;
    try {
      envelope = (await response.json()) as OllamaChatResponseEnvelope;
    } catch {
      logger.warn('ollama_invalid_envelope_json', {
        modelName: context.modelName,
        sanitizedHost,
      });

      throw new AiExtractionDomainError(
        'AI_EXTRACTION_INVALID_OUTPUT',
        'O servidor Ollama retornou uma resposta que não constitui um envelope JSON válido.',
        422
      );
    }

    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
      throw new AiExtractionDomainError(
        'AI_EXTRACTION_INVALID_OUTPUT',
        'O envelope de resposta da API do Ollama possui estrutura inválida.',
        422
      );
    }

    if (envelope.error) {
      logger.warn('ollama_envelope_reported_error', {
        modelName: context.modelName,
      });

      if (/model .* not found/i.test(envelope.error)) {
        throw new AiExtractionDomainError(
          'AI_EXTRACTION_UNAVAILABLE',
          `O modelo "${context.modelName}" não está carregado ou disponível no Ollama.`,
          503
        );
      }

      throw new AiExtractionDomainError(
        'AI_EXTRACTION_FAILED',
        'O provedor Ollama indicou falha no processamento da solicitação.',
        502
      );
    }

    // Nível 3: Validação do conteúdo textual da mensagem gerada pelo modelo
    const message = envelope.message;
    if (!message || typeof message !== 'object') {
      throw new AiExtractionDomainError(
        'AI_EXTRACTION_INVALID_OUTPUT',
        'A resposta do Ollama não contém o campo "message" esperado.',
        422
      );
    }

    const content = message.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new AiExtractionDomainError(
        'AI_EXTRACTION_INVALID_OUTPUT',
        'O modelo de IA retornou uma mensagem sem conteúdo textual.',
        422
      );
    }

    return content;
  }
}

/**
 * Cria a função de conclusão estruturada acoplada ao adaptador HTTP do Ollama, pronta para
 * ser injetada em `ConfigurableAiQuestionExtractionService`.
 */
export function createOllamaCompletionFn(
  adapterOptions?: OllamaChatAdapterOptions
): (context: AiModelCompletionContext) => Promise<string> {
  const adapter = new OllamaChatAdapter(adapterOptions);
  return (context: AiModelCompletionContext) => adapter.completeChat(context);
}
