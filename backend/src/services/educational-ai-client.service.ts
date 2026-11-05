import {
  EducationalAiDomainError,
  type EducationalAiClientOptions,
  type EducationalPromptPayload,
  type IEducationalAiClient,
} from '../types/educational-ai.types.ts';
import { logger } from '../utils/logger.ts';

export const DEFAULT_EDUCATIONAL_AI_TIMEOUT_MS = 45_000;
export const MAX_EDUCATIONAL_AI_RESPONSE_CHARS = 500_000;
export const MAX_EDUCATIONAL_AI_RESPONSE_BYTES = 500_000;

export interface EducationalAiClientConfig {
  fetchFn?: typeof fetch;
  baseUrl?: string;
  defaultModel?: string;
  defaultTimeoutMs?: number;
}

/**
 * Cliente HTTP desacoplado para inferência educacional com Ollama (Sprint 9.2 / 9.2.1).
 *
 * Implementa comunicação segura com:
 * - R-01: Leitura controlada por streaming via getReader, contagem antecipada de bytes e decodificação UTF-8 robusta.
 * - R-03: Separação estrita entre cancelamento voluntário do chamador e timeout interno do cliente.
 */
export class EducationalAiClient implements IEducationalAiClient {
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly defaultTimeoutMs: number;

  constructor(config: EducationalAiClientConfig = {}) {
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
    this.baseUrl = (config.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/+$/, '');
    this.defaultModel = config.defaultModel ?? process.env.OLLAMA_MODEL ?? 'llama3.1:8b';
    this.defaultTimeoutMs =
      config.defaultTimeoutMs ??
      (Number(process.env.OLLAMA_TIMEOUT_MS) || DEFAULT_EDUCATIONAL_AI_TIMEOUT_MS);
  }

  /**
   * Sanitiza a URL de destino para exibição segura em logs (sem senhas ou credenciais).
   */
  private getSanitizedOrigin(url?: string): string {
    try {
      const parsed = new URL(url || this.baseUrl);
      return parsed.origin;
    } catch {
      return 'ollama://configured-host';
    }
  }

  /**
   * R-01: Lê o corpo da resposta HTTP de forma controlada via ReadableStream/getReader,
   * contabilizando bytes recebidos para interromper a leitura antes que um payload
   * excessivo seja acumulado na memória. Decodifica UTF-8 progressivamente entre chunks.
   */
  private async readResponseBodyControlled(
    response: Response,
    maxBytes: number,
    callerSignal?: AbortSignal,
    internalSignal?: AbortSignal
  ): Promise<string> {
    // 1. Prioriza leitura via ReadableStream / getReader quando suportado
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8', { fatal: false });
      let accumulatedText = '';
      let totalBytesReceived = 0;

      try {
        while (true) {
          if (callerSignal?.aborted) {
            await reader.cancel();
            throw new EducationalAiDomainError(
              'EDUCATIONAL_AI_CANCELLED',
              'Operação de inferência cancelada pelo chamador.',
              499,
              { reason: callerSignal.reason }
            );
          }

          if (internalSignal?.aborted) {
            await reader.cancel();
            throw new EducationalAiDomainError(
              'EDUCATIONAL_AI_TIMEOUT',
              'Tempo limite excedido durante a leitura da resposta do modelo.',
              504
            );
          }

          const { done, value } = await reader.read();

          if (done) {
            accumulatedText += decoder.decode();
            break;
          }

          if (value) {
            totalBytesReceived += value.byteLength;

            if (totalBytesReceived > maxBytes) {
              await reader.cancel();
              throw new EducationalAiDomainError(
                'EDUCATIONAL_AI_INVALID_OUTPUT',
                `A resposta gerada pelo modelo excedeu o limite máximo seguro (${maxBytes} bytes).`,
                422
              );
            }

            accumulatedText += decoder.decode(value, { stream: true });
          }
        }

        return accumulatedText;
      } catch (err) {
        try {
          await reader.cancel();
        } catch {
          // Ignora falhas de cancelamento secundário
        }
        throw err;
      }
    }

    // 2. Fallback gracioso para dublês de teste com response.text()
    if (typeof response.text === 'function') {
      if (callerSignal?.aborted) {
        throw new EducationalAiDomainError(
          'EDUCATIONAL_AI_CANCELLED',
          'Operação de inferência cancelada pelo chamador.',
          499,
          { reason: callerSignal.reason }
        );
      }

      const textOutput = await response.text();
      const encoded = new TextEncoder().encode(textOutput);
      if (encoded.byteLength > maxBytes) {
        throw new EducationalAiDomainError(
          'EDUCATIONAL_AI_INVALID_OUTPUT',
          `A resposta gerada pelo modelo excedeu o limite máximo seguro (${maxBytes} bytes).`,
          422
        );
      }
      return textOutput;
    }

    return '';
  }

  /**
   * Envia o prompt educacional ao modelo local via API HTTP do Ollama (`POST /api/chat`).
   */
  async generateAnalysis(
    prompt: EducationalPromptPayload,
    options: EducationalAiClientOptions = {}
  ): Promise<string> {
    const modelToUse = options.modelName ?? this.defaultModel;
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const sanitizedHost = this.getSanitizedOrigin();

    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    // Conecta timeout interno
    timeoutHandle = setTimeout(() => {
      controller.abort(new Error(`Timeout de ${timeoutMs}ms excedido na inferência educacional.`));
    }, timeoutMs);

    // Conecta signal externo caso fornecido
    const callerSignal = options.signal;
    const onCallerAbort = () => {
      controller.abort(callerSignal?.reason);
    };

    if (callerSignal) {
      if (callerSignal.aborted) {
        clearTimeout(timeoutHandle);
        throw new EducationalAiDomainError(
          'EDUCATIONAL_AI_CANCELLED',
          'Operação de inferência cancelada pelo chamador.',
          499,
          { reason: callerSignal.reason }
        );
      }
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }

    try {
      const chatEndpoint = `${this.baseUrl}/api/chat`;
      const response = await this.fetchFn(chatEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          model: modelToUse,
          messages: [
            { role: 'system', content: prompt.systemPrompt },
            { role: 'user', content: prompt.userPrompt },
          ],
          stream: false,
          format: 'json',
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        logger.warn('educational_ai_http_error', {
          status: response.status,
          model: modelToUse,
          sanitizedHost,
        });

        if (response.status === 404) {
          throw new EducationalAiDomainError(
            'EDUCATIONAL_AI_UNAVAILABLE',
            `Modelo '${modelToUse}' não encontrado no servidor Ollama.`,
            503
          );
        }

        throw new EducationalAiDomainError(
          'EDUCATIONAL_AI_UNAVAILABLE',
          `Servidor de inferência respondeu com HTTP ${response.status}.`,
          503
        );
      }

      // R-01: Leitura com proteção contra respostas gigantescas via stream controlado
      const textOutput = await this.readResponseBodyControlled(
        response,
        MAX_EDUCATIONAL_AI_RESPONSE_BYTES,
        callerSignal,
        controller.signal
      );

      if (!textOutput || !textOutput.trim()) {
        throw new EducationalAiDomainError(
          'EDUCATIONAL_AI_EMPTY_RESPONSE',
          'O modelo retornou uma resposta vazia.',
          422
        );
      }

      let parsedEnvelope: { message?: { content?: string } };
      try {
        parsedEnvelope = JSON.parse(textOutput);
      } catch (jsonErr) {
        throw new EducationalAiDomainError(
          'EDUCATIONAL_AI_INVALID_OUTPUT',
          'O envelope retornado pelo servidor Ollama não é um JSON válido.',
          422,
          { error: String(jsonErr) }
        );
      }

      const content = parsedEnvelope.message?.content?.trim();
      if (!content) {
        throw new EducationalAiDomainError(
          'EDUCATIONAL_AI_EMPTY_RESPONSE',
          'O campo content da mensagem do modelo está vazio.',
          422
        );
      }

      return content;
    } catch (err: unknown) {
      if (err instanceof EducationalAiDomainError) {
        throw err;
      }

      // R-03: Se o chamador cancelou explicitamente
      if (callerSignal?.aborted) {
        throw new EducationalAiDomainError(
          'EDUCATIONAL_AI_CANCELLED',
          'Operação de inferência cancelada pelo chamador.',
          499,
          { reason: callerSignal.reason }
        );
      }

      // Trata timeouts internos
      if (controller.signal.aborted) {
        throw new EducationalAiDomainError(
          'EDUCATIONAL_AI_TIMEOUT',
          `Tempo limite excedido (${timeoutMs}ms) durante a inferência educacional.`,
          504
        );
      }

      logger.warn('educational_ai_network_error', {
        sanitizedHost,
        error: String(err),
      });

      throw new EducationalAiDomainError(
        'EDUCATIONAL_AI_UNAVAILABLE',
        'Falha de conexão com o serviço de inferência educacional.',
        503,
        { error: String(err) }
      );
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (callerSignal) {
        callerSignal.removeEventListener('abort', onCallerAbort);
      }
    }
  }

  /**
   * Checagem opcional de disponibilidade do serviço Ollama.
   */
  async isAvailable(options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<boolean> {
    const timeoutMs = options.timeoutMs ?? 3000;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.fetchFn(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
