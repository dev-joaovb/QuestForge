import type {
  BoundingBox,
  DocumentPageGeometry,
} from './document-geometry.types.ts';

/**
 * Classificação documental independente da disponibilidade de IA.
 */
export type DocumentContentClassification =
  | 'DIGITAL'
  | 'SCANNED'
  | 'MIXED'
  | 'UNKNOWN';

export type DocumentTextSource =
  | 'PDF_TEXT'
  | 'OCR';

export type DocumentRegionType =
  | 'HEADER'
  | 'FOOTER'
  | 'INSTRUCTIONS'
  | 'QUESTION_STATEMENT'
  | 'ALTERNATIVE'
  | 'SHARED_CONTEXT'
  | 'IMAGE'
  | 'CHART'
  | 'TABLE'
  | 'FORMULA'
  | 'CAPTION'
  | 'UNKNOWN';

export interface DocumentTextBlock {
  readonly id: string;
  readonly pageNumber: number;
  readonly boundingBox: BoundingBox;
  readonly text: string;
  readonly source: DocumentTextSource;
  readonly readingOrder: number;
  readonly columnIndex: number | null;
  readonly confidence: number | null;
}

export interface DocumentRegion {
  readonly id: string;
  readonly pageNumber: number;
  readonly type: DocumentRegionType;
  readonly boundingBox: BoundingBox;
  readonly readingOrder: number;
  readonly columnIndex: number | null;
  readonly textBlockIds: readonly string[];
  readonly visualAssetIds: readonly string[];
}

export interface DocumentPage {
  readonly pageNumber: number;
  readonly geometry: DocumentPageGeometry;
  readonly classification: DocumentContentClassification;
  readonly requiresOcr: boolean;
  readonly columnCount: number | null;
  readonly textBlocks: readonly DocumentTextBlock[];
  readonly regions: readonly DocumentRegion[];
}

export interface DocumentLayout {
  readonly sourceDocumentId: string;
  readonly checksumSha256: string;
  readonly pageCount: number;
  readonly classification: DocumentContentClassification;
  readonly pages: readonly DocumentPage[];
}
