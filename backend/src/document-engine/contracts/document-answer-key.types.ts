import type {
  DocumentRegionReference,
} from './document-geometry.types.ts';

import type {
  DocumentQuestionIdentity,
} from './document-question.types.ts';

export type DocumentAnswerValue =
  | {
      readonly kind: 'MULTIPLE_CHOICE';
      readonly letter: string;
    }
  | {
      readonly kind: 'TRUE_FALSE';
      readonly value: boolean;
    }
  | {
      readonly kind: 'NUMERIC';
      readonly value: string;
    }
  | {
      readonly kind: 'MULTIPLE_SELECT';
      readonly letters: readonly string[];
    }
  | {
      readonly kind: 'DISCURSIVE';
      readonly expectedResponse: string;
    };

export type DocumentAnswerKeyEntryStatus =
  | 'IDENTIFIED'
  | 'ANNULLED'
  | 'NEEDS_REVIEW';

export interface DocumentAnswerKeyEntryDraft {
  readonly id: string;
  readonly questionIdentity: DocumentQuestionIdentity;
  readonly status: DocumentAnswerKeyEntryStatus;
  readonly answer: DocumentAnswerValue | null;
  readonly previousAnswer: DocumentAnswerValue | null;
  readonly rawAnswerText: string | null;
  readonly sources: readonly DocumentRegionReference[];
  readonly reviewWarnings: readonly string[];
}

/**
 * Representa um gabarito extraído de uma fonte documental.
 * Não comprova, isoladamente, sua autenticidade ou
 * compatibilidade com um caderno de prova.
 */
export interface DocumentAnswerKeyDraft {
  readonly id: string;
  readonly sourceDocumentId: string;
  readonly title: string | null;
  readonly entries: readonly DocumentAnswerKeyEntryDraft[];
  readonly sources: readonly DocumentRegionReference[];
  readonly requiresHumanReview: true;
  readonly reviewWarnings: readonly string[];
}
