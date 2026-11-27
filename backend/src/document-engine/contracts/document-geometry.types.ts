/**
 * Coordenadas normalizadas entre 0 e 1.
 * Origem no canto superior esquerdo da página.
 *
 * A validação dos limites geométricos será realizada
 * pelos validadores documentais.
 */
export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type DocumentRotation = 0 | 90 | 180 | 270;

export type DocumentMeasurementUnit =
  | 'PDF_POINT'
  | 'PIXEL';

export interface DocumentDimensions {
  readonly width: number;
  readonly height: number;
  readonly unit: DocumentMeasurementUnit;
}

export type DocumentAffineTransform = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface DocumentPageGeometry {
  readonly originalDimensions: DocumentDimensions;
  readonly orientedDimensions: DocumentDimensions;
  readonly rotation: DocumentRotation;
  readonly sourceToNormalizedTransform: DocumentAffineTransform;
}

export interface DocumentRegionReference {
  readonly sourceDocumentId: string;
  readonly pageNumber: number;
  readonly regionId: string;
  readonly boundingBox: BoundingBox;
}
