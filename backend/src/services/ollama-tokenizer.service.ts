import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Tokenizer } from '@huggingface/tokenizers';
import {
  AiExtractionDomainError,
} from '../types/ai-extraction.types.ts';

export const SUPPORTED_OLLAMA_TOKENIZER_MODEL =
  'qwen2.5:3b';

const TOKENIZER_ASSETS = {
  tokenizer: {
    file: 'tokenizer.json',
    sha256:
      'c0382117ea329cdf097041132f6d735924b697924d6f6fc3945713e96ce87539',
  },
  configuration: {
    file: 'tokenizer_config.json',
    sha256:
      '5b5d4f65d0acd3b2d56a35b56d374a36cbc1c8fa5cf3b3febbbfabf22f359583',
  },
} as const;

const ASSETS_DIRECTORY = new URL(
  '../assets/tokenizers/qwen2.5/',
  import.meta.url
);

let cachedTokenizer: Tokenizer | undefined;
let cachedSpecialTokens: readonly string[] | undefined;

/**
 * Carrega um asset local e verifica sua integridade
 * antes de disponibilizar o conteúdo ao tokenizador.
 */
function readVerifiedAsset(asset: {
  file: string;
  sha256: string;
}): string {
  const content = readFileSync(
    new URL(asset.file, ASSETS_DIRECTORY)
  );

  const actualHash = createHash('sha256')
    .update(content)
    .digest('hex');

  if (actualHash !== asset.sha256) {
    throw new Error('Tokenizer asset integrity failure.');
  }

  return content.toString('utf8');
}

/**
 * Inicialização sob demanda, sem acesso à rede.
 * A instância somente é armazenada após inicialização
 * bem-sucedida e verificação dos dois assets.
 */
function getTokenizer(): Tokenizer {
  if (cachedTokenizer) {
    return cachedTokenizer;
  }

  try {
    const tokenizerJson = JSON.parse(
      readVerifiedAsset(TOKENIZER_ASSETS.tokenizer)
    );

    const tokenizerConfig = JSON.parse(
      readVerifiedAsset(TOKENIZER_ASSETS.configuration)
    );

    const tokenizer = new Tokenizer(
      tokenizerJson,
      tokenizerConfig
    );

    const specialTokens: string[] =
      tokenizerJson.added_tokens
        .filter((token: { special?: boolean }) =>
          token.special === true
        )
        .map((token: { content: string }) =>
          token.content
        );

    if (
      specialTokens.length === 0 ||
      specialTokens.some(token =>
        typeof token !== 'string' ||
        token.length === 0
      ) ||
      !specialTokens.includes('<|im_start|>') ||
      !specialTokens.includes('<|im_end|>') ||
      !specialTokens.includes('<|endoftext|>')
    ) {
      throw new Error('Invalid special token configuration.');
    }

    cachedSpecialTokens = Object.freeze(specialTokens);
    cachedTokenizer = tokenizer;

    return tokenizer;
  } catch {
    throw new AiExtractionDomainError(
      'AI_EXTRACTION_UNAVAILABLE',
      'O tokenizador local do modelo Ollama está indisponível ou possui arquivos inválidos.',
      503
    );
  }
}

/**
 * Impede o uso de um tokenizador não validado
 * para o modelo de inferência configurado.
 */
export function assertSupportedTokenizerModel(
  modelName: string
): void {
  if (modelName !== SUPPORTED_OLLAMA_TOKENIZER_MODEL) {
    throw new AiExtractionDomainError(
      'AI_EXTRACTION_UNAVAILABLE',
      'O modelo Ollama configurado não possui um tokenizador local validado.',
      503
    );
  }
}

/**
 * Conta tokens utilizando o vocabulário e as regras
 * de tokenização dos assets oficiais incorporados.
 */
export function countOllamaTokens(
  text: string,
  modelName: string
): number {
  assertSupportedTokenizerModel(modelName);

  if (typeof text !== 'string') {
    throw new AiExtractionDomainError(
      'AI_EXTRACTION_INVALID_INPUT',
      'O conteúdo para tokenização deve ser textual.',
      400
    );
  }

  try {
    const count = getTokenizer().encode(text).ids.length;

    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error('Invalid tokenizer result.');
    }

    return count;
  } catch (error) {
    if (error instanceof AiExtractionDomainError) {
      throw error;
    }

    throw new AiExtractionDomainError(
      'AI_EXTRACTION_FAILED',
      'Não foi possível calcular o orçamento de tokens da extração.',
      502
    );
  }
}

/**
 * Reconstrói o formato ChatML validado para chamadas
 * com mensagens system e user, sem ferramentas.
 *
 * Inclui os delimitadores e o prefixo de geração
 * da mensagem assistant no cálculo do prompt.
 */
export function countOllamaChatPromptTokens(params: {
  modelName: string;
  systemPrompt: string;
  userPrompt: string;
}): number {
  assertSupportedTokenizerModel(params.modelName);

  if (
    typeof params.systemPrompt !== 'string' ||
    typeof params.userPrompt !== 'string'
  ) {
    throw new AiExtractionDomainError(
      'AI_EXTRACTION_INVALID_INPUT',
      'As mensagens do prompt devem ser textuais.',
      400
    );
  }

  getTokenizer();

  if (!cachedSpecialTokens) {
    throw new AiExtractionDomainError(
      'AI_EXTRACTION_UNAVAILABLE',
      'A configuração de tokens especiais do modelo está indisponível.',
      503
    );
  }

  for (const token of cachedSpecialTokens) {
    if (
      params.systemPrompt.includes(token) ||
      params.userPrompt.includes(token)
    ) {
      throw new AiExtractionDomainError(
        'AI_EXTRACTION_INVALID_INPUT',
        'As mensagens da extração contêm delimitadores especiais reservados pelo modelo.',
        400
      );
    }
  }

  const chatPrompt = [
    '<|im_start|>system\n',
    params.systemPrompt,
    '<|im_end|>\n',
    '<|im_start|>user\n',
    params.userPrompt,
    '<|im_end|>\n',
    '<|im_start|>assistant\n',
  ].join('');

  return countOllamaTokens(
    chatPrompt,
    params.modelName
  );
}
