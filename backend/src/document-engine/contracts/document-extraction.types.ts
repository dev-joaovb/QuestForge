import type {
  DocumentRegionReference,
} from './document-geometry.types.ts';

import type {
  DocumentProfileSelectionMode,
} from './document-profile.types.ts';

import type {
  DocumentLayout,
} from './document-layout.types.ts';

import type {
  DocumentVisualAsset,
  DocumentSharedContext,
} from './document-content.types.ts';

import type {
  DocumentQuestionDraft,
} from './document-question.types.ts';

import type {
  DocumentAnswerKeyDraft,
} from './document-answer-key.types.ts';

export type DocumentDetectionStatus =
  | 'MATCH'
  | 'POSSIBLE_MATCH'
  | 'NO_MATCH';

export interface DocumentDetectionResult {
  readonly profileId: string;
  readonly profileVersion: string;
  readonly extractorId: string;
  readonly extractorVersion: string;
  readonly status: DocumentDetectionStatus;
  readonly confidence: number | null;
  readonly reasons: readonly string[];
  readonly sources: readonly DocumentRegionReference[];
}

export interface DocumentMetadataDraft {
  readonly title: string | null;
  readonly institution: string | null;
  readonly board: string | null;
  readonly year: number | null;
  readonly position: string | null;
  readonly description: string | null;
  readonly bookletColor: string | null;
  readonly bookletNumber: string | null;
  readonly examDay: number | null;
  readonly sources: readonly DocumentRegionReference[];
}

export type DocumentExtractionIssueSeverity =
  | 'INFO'
  | 'WARNING'
  | 'ERROR';

export type DocumentExtractionIssueCode =
  | 'UNKNOWN_DOCUMENT_FORMAT'
  | 'AMBIGUOUS_DOCUMENT_FORMAT'
  | 'UNSUPPORTED_QUESTION_TYPE'
  | 'MISSING_QUESTION_NUMBER'
  | 'DUPLICATE_QUESTION_IDENTITY'
  | 'QUESTION_NUMBER_GAP'
  | 'INCOMPLETE_QUESTION'
  | 'AMBIGUOUS_CONTINUATION'
  | 'MISSING_ALTERNATIVE'
  | 'AMBIGUOUS_SHARED_CONTEXT'
  | 'UNRESOLVED_VISUAL_ASSET'
  | 'INVALID_REGION_REFERENCE'
  | 'OCR_REQUIRED'
  | 'LOW_OCR_CONFIDENCE'
  | 'ANSWER_KEY_MISMATCH'
  | 'AMBIGUOUS_ANSWER_KEY_ENTRY'
  | 'EXTRACTION_LIMIT_EXCEEDED'
  | 'UNCLASSIFIED_CONTENT';

export interface DocumentExtractionIssue {
  readonly id: string;
  readonly code: DocumentExtractionIssueCode;
  readonly severity: DocumentExtractionIssueSeverity;
  readonly message: string;
  readonly questionId: string | null;
  readonly sources: readonly DocumentRegionReference[];
  readonly requiresHumanReview: boolean;
}

export type DocumentExtractionOutcome =
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCELLED';

export interface DocumentExtractionOptions {
  readonly profileId: string;
  readonly profileVersion: string;
  readonly selectionMode: DocumentProfileSelectionMode;
  readonly maxQuestions: number;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

/**
 * Resultado estrutural independente de provedores de IA.
 *
 * COMPLETED indica conclusão da extração, não aprovação
 * das questões para publicação.
 */
export interface DocumentExtractionResult {
  readonly sourceDocumentId: string;
  readonly profileId: string;
  readonly profileVersion: string;
  readonly extractorId: string;
  readonly extractorVersion: string;
  readonly outcome: DocumentExtractionOutcome;
  readonly layout: DocumentLayout;
  readonly metadata: DocumentMetadataDraft | null;
  readonly questions: readonly DocumentQuestionDraft[];
  readonly answerKeys: readonly DocumentAnswerKeyDraft[];
  readonly sharedContexts: readonly DocumentSharedContext[];
  readonly visualAssets: readonly DocumentVisualAsset[];
  readonly issues: readonly DocumentExtractionIssue[];
  readonly requiresHumanReview: true;
  readonly extractedAt: Date;
}
