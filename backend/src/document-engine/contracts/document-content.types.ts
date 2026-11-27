import type {
  DocumentRegionReference,
} from './document-geometry.types.ts';

export type DocumentVisualAssetType =
  | 'IMAGE'
  | 'ILLUSTRATION'
  | 'CHART'
  | 'TABLE'
  | 'FORMULA'
  | 'MAP'
  | 'DIAGRAM'
  | 'COMIC'
  | 'UNKNOWN';

export type DocumentVisualExtractionMethod =
  | 'EMBEDDED_IMAGE'
  | 'REGION_RENDER'
  | 'FULL_PAGE_RENDER';

export type DocumentVisualMimeType =
  | 'image/png'
  | 'image/jpeg';

/**
 * Descritor documental sem buffers, credenciais
 * ou caminhos internos de armazenamento.
 */
export interface DocumentVisualAsset {
  readonly id: string;
  readonly source: DocumentRegionReference;
  readonly type: DocumentVisualAssetType;
  readonly extractionMethod: DocumentVisualExtractionMethod;
  readonly mimeType: DocumentVisualMimeType;
  readonly width: number;
  readonly height: number;
  readonly sizeBytes: number;
  readonly checksumSha256: string;
  readonly caption: string | null;
  readonly textRepresentation: string | null;
}

/**
 * Preserva a sequência original entre texto e elementos visuais.
 */
export type DocumentContentFragment =
  | {
      readonly kind: 'TEXT';
      readonly position: number;
      readonly text: string;
      readonly sources: readonly DocumentRegionReference[];
    }
  | {
      readonly kind: 'VISUAL';
      readonly position: number;
      readonly visualAssetId: string;
      readonly sources: readonly DocumentRegionReference[];
    };

export interface DocumentSharedContext {
  readonly id: string;
  readonly sourceDocumentId: string;
  readonly title: string | null;
  readonly content: readonly DocumentContentFragment[];
  readonly sources: readonly DocumentRegionReference[];
}
