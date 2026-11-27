// @vitest-environment node

import { describe, it, expectTypeOf } from 'vitest';

import type {
  BoundingBox,
  DocumentRotation,
  DocumentMeasurementUnit,
  DocumentAffineTransform,
  DocumentQuestionType,
  DocumentProfile,
  DocumentContentClassification,
  DocumentContentFragment,
  DocumentAlternativeDraft,
  DocumentQuestionIdentity,
  DocumentQuestionDraft,
  DocumentRegionReference,
  DocumentAnswerValue,
  DocumentAnswerKeyDraft,
  DocumentAnswerKeyEntryStatus,
  DocumentMetadataDraft,
  DocumentLayout,
  DocumentDetectionResult,
  DocumentExtractionOptions,
  DocumentExtractionResult,
  DocumentExtractionOutcome,
  DocumentExtractor,
  DocumentVisualAsset,
} from '../src/document-engine/contracts/index.ts';

describe('Document Engine — contratos documentais', () => {
  it('CT-01: representa geometria e rotacoes documentais', () => {
    expectTypeOf<BoundingBox>().toEqualTypeOf<{
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }>();

    expectTypeOf<DocumentRotation>()
      .toEqualTypeOf<0 | 90 | 180 | 270>();

    expectTypeOf<DocumentMeasurementUnit>()
      .toEqualTypeOf<'PDF_POINT' | 'PIXEL'>();

    expectTypeOf<DocumentAffineTransform>()
      .toEqualTypeOf<readonly [
        number, number, number,
        number, number, number,
      ]>();
  });

  it('CT-02: suporta os tipos documentais previstos', () => {
    expectTypeOf<DocumentQuestionType>().toEqualTypeOf<
      | 'MULTIPLE_CHOICE'
      | 'TRUE_FALSE'
      | 'NUMERIC'
      | 'DISCURSIVE'
      | 'MULTIPLE_SELECT'
      | 'UNKNOWN'
    >();

    expectTypeOf<
      DocumentProfile['capabilities']['supportedQuestionTypes'][number]
    >().toEqualTypeOf<
      Exclude<DocumentQuestionType, 'UNKNOWN'>
    >();
  });

  it('CT-03: representa documentos digitais, digitalizados e mistos', () => {
    expectTypeOf<DocumentContentClassification>()
      .toEqualTypeOf<
        'DIGITAL' | 'SCANNED' | 'MIXED' | 'UNKNOWN'
      >();
  });

  it('CT-04: diferencia fragmentos textuais e visuais', () => {
    type TextFragment = Extract<
      DocumentContentFragment,
      { kind: 'TEXT' }
    >;

    type VisualFragment = Extract<
      DocumentContentFragment,
      { kind: 'VISUAL' }
    >;

    expectTypeOf<TextFragment['text']>()
      .toEqualTypeOf<string>();

    expectTypeOf<VisualFragment['visualAssetId']>()
      .toEqualTypeOf<string>();

    expectTypeOf<TextFragment>()
      .not.toHaveProperty('visualAssetId');

    expectTypeOf<VisualFragment>()
      .not.toHaveProperty('text');
  });

  it('CT-05: admite alternativas exclusivamente visuais', () => {
    const alternative = {
      id: 'alternative-1',
      letter: 'A',
      position: 1,
      text: null,
      content: [{
        kind: 'VISUAL',
        position: 1,
        visualAssetId: 'asset-1',
        sources: [{
          sourceDocumentId: 'document-1',
          pageNumber: 1,
          regionId: 'region-1',
          boundingBox: {
            x: 0.1,
            y: 0.2,
            width: 0.3,
            height: 0.2,
          },
        }],
      }],
      sources: [{
        sourceDocumentId: 'document-1',
        pageNumber: 1,
        regionId: 'region-1',
        boundingBox: {
          x: 0.1,
          y: 0.2,
          width: 0.3,
          height: 0.2,
        },
      }],
    } satisfies DocumentAlternativeDraft;

    expectTypeOf(alternative)
      .toExtend<DocumentAlternativeDraft>();
  });

  it('CT-06: representa identidade contextual', () => {
    expectTypeOf<DocumentQuestionIdentity>()
      .toEqualTypeOf<{
        readonly originalNumber: number | null;
        readonly scope: string | null;
      }>();
  });

  it('CT-07: preserva referencias de origem', () => {
    expectTypeOf<DocumentRegionReference>()
      .toEqualTypeOf<{
        readonly sourceDocumentId: string;
        readonly pageNumber: number;
        readonly regionId: string;
        readonly boundingBox: BoundingBox;
      }>();

    expectTypeOf<DocumentQuestionDraft['sources']>()
      .toEqualTypeOf<readonly DocumentRegionReference[]>();

    expectTypeOf<DocumentVisualAsset['source']>()
      .toEqualTypeOf<DocumentRegionReference>();
  });

  it('CT-08: exige revisao humana nos resultados', () => {
    expectTypeOf<DocumentQuestionDraft['requiresHumanReview']>()
      .toEqualTypeOf<true>();

    expectTypeOf<DocumentAnswerKeyDraft['requiresHumanReview']>()
      .toEqualTypeOf<true>();

    expectTypeOf<DocumentExtractionResult['requiresHumanReview']>()
      .toEqualTypeOf<true>();

    expectTypeOf<DocumentQuestionDraft['status']>()
      .toEqualTypeOf<'DRAFT' | 'NEEDS_REVIEW'>();
  });

  it('CT-09: representa respostas e anulacoes', () => {
    expectTypeOf<DocumentAnswerValue['kind']>()
      .toEqualTypeOf<
        | 'MULTIPLE_CHOICE'
        | 'TRUE_FALSE'
        | 'NUMERIC'
        | 'MULTIPLE_SELECT'
        | 'DISCURSIVE'
      >();

    expectTypeOf<DocumentAnswerKeyEntryStatus>()
      .toEqualTypeOf<
        'IDENTIFIED' | 'ANNULLED' | 'NEEDS_REVIEW'
      >();

    expectTypeOf<DocumentQuestionDraft>()
      .not.toHaveProperty('correctAnswer');
  });

  it('CT-10: admite ausencia de metadados da prova', () => {
    expectTypeOf<DocumentMetadataDraft['year']>()
      .toEqualTypeOf<number | null>();

    expectTypeOf<DocumentMetadataDraft['bookletColor']>()
      .toEqualTypeOf<string | null>();

    expectTypeOf<DocumentMetadataDraft['bookletNumber']>()
      .toEqualTypeOf<string | null>();

    expectTypeOf<DocumentMetadataDraft['examDay']>()
      .toEqualTypeOf<number | null>();
  });

  it('CT-11: nao exige identificacao de provedores de IA', () => {
    expectTypeOf<DocumentExtractionResult>()
      .not.toHaveProperty('providerName');

    expectTypeOf<DocumentExtractionResult>()
      .not.toHaveProperty('modelName');

    expectTypeOf<DocumentExtractionOptions>()
      .not.toHaveProperty('modelName');

    expectTypeOf<DocumentExtractionResult['extractorVersion']>()
      .toEqualTypeOf<string>();
  });

  it('CT-12: padroniza reconhecimento e extracao', () => {
    expectTypeOf<DocumentExtractor['detect']>()
      .toEqualTypeOf<
        (document: DocumentLayout) =>
          Promise<DocumentDetectionResult>
      >();

    expectTypeOf<DocumentExtractor['extract']>()
      .toEqualTypeOf<
        (
          document: DocumentLayout,
          options: DocumentExtractionOptions,
        ) => Promise<DocumentExtractionResult>
      >();
  });

  it('CT-13: representa cancelamento e limites operacionais', () => {
    expectTypeOf<DocumentExtractionOptions['signal']>()
      .toEqualTypeOf<AbortSignal | undefined>();

    expectTypeOf<DocumentExtractionOptions['maxQuestions']>()
      .toEqualTypeOf<number>();

    expectTypeOf<DocumentExtractionOptions['timeoutMs']>()
      .toEqualTypeOf<number>();

    expectTypeOf<DocumentExtractionOutcome>()
      .toEqualTypeOf<
        'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CANCELLED'
      >();
  });

  it('CT-14: omite campos internos de armazenamento', () => {
    expectTypeOf<DocumentVisualAsset>()
      .not.toHaveProperty('objectKey');

    expectTypeOf<DocumentVisualAsset>()
      .not.toHaveProperty('storageBucket');

    expectTypeOf<DocumentVisualAsset>()
      .not.toHaveProperty('buffer');

    expectTypeOf<DocumentVisualAsset>()
      .not.toHaveProperty('secretKey');
  });
});
