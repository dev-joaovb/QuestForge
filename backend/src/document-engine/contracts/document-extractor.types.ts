import type {
  DocumentLayout,
} from './document-layout.types.ts';

import type {
  DocumentDetectionResult,
  DocumentExtractionOptions,
  DocumentExtractionResult,
} from './document-extraction.types.ts';

/**
 * Contrato comum dos extratores documentais.
 *
 * Cada implementação possui identidade e versão próprias.
 * O reconhecimento e a extração estrutural não exigem
 * disponibilidade de um provedor de inteligência artificial.
 */
export interface DocumentExtractor {
  readonly id: string;
  readonly name: string;
  readonly version: string;

  detect(
    document: DocumentLayout,
  ): Promise<DocumentDetectionResult>;

  extract(
    document: DocumentLayout,
    options: DocumentExtractionOptions,
  ): Promise<DocumentExtractionResult>;
}
