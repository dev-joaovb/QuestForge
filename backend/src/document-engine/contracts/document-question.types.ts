import type {
  DocumentRegionReference,
} from './document-geometry.types.ts';

import type {
  DocumentContentFragment,
} from './document-content.types.ts';

import type {
  DocumentQuestionType,
} from './document-profile.types.ts';

/**
 * Identidade contextual da questão dentro do documento.
 *
 * O escopo diferencia numerações repetidas, como
 * questões de inglês e espanhol em uma mesma prova.
 * O número permanece nulo quando não for identificado.
 */
export interface DocumentQuestionIdentity {
  readonly originalNumber: number | null;
  readonly scope: string | null;
}

export type DocumentQuestionStructureStatus =
  | 'COMPLETE'
  | 'INCOMPLETE'
  | 'AMBIGUOUS';

export type DocumentQuestionReviewStatus =
  | 'DRAFT'
  | 'NEEDS_REVIEW';

export interface DocumentAlternativeDraft {
  readonly id: string;
  readonly letter: string | null;
  readonly position: number;
  readonly text: string | null;
  readonly content: readonly DocumentContentFragment[];
  readonly sources: readonly DocumentRegionReference[];
}

export interface DocumentQuestionDraft {
  readonly id: string;
  readonly sourceDocumentId: string;
  readonly identity: DocumentQuestionIdentity;
  readonly type: DocumentQuestionType;
  readonly statement: string | null;
  readonly content: readonly DocumentContentFragment[];
  readonly alternatives: readonly DocumentAlternativeDraft[];
  readonly sharedContextIds: readonly string[];
  readonly sources: readonly DocumentRegionReference[];
  readonly structureStatus: DocumentQuestionStructureStatus;
  readonly status: DocumentQuestionReviewStatus;
  readonly requiresHumanReview: true;
  readonly reviewWarnings: readonly string[];
}
