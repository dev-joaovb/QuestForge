/**
 * Tipos de questões admitidos durante a extração documental.
 * Não representam diretamente os enums persistidos pelo Prisma.
 *
 * UNKNOWN é permitido exclusivamente durante a extração e revisão.
 */
export type DocumentQuestionType =
  | 'MULTIPLE_CHOICE'
  | 'TRUE_FALSE'
  | 'NUMERIC'
  | 'DISCURSIVE'
  | 'MULTIPLE_SELECT'
  | 'UNKNOWN';

export type DocumentProfileKind =
  | 'SPECIALIZED'
  | 'CONFIGURABLE'
  | 'GENERIC';

export type DocumentProfileStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'DISABLED';

export type DocumentProfileSelectionMode =
  | 'AUTO'
  | 'MANUAL';

export interface DocumentProfileCapabilities {
  readonly supportedQuestionTypes: readonly Exclude<
    DocumentQuestionType,
    'UNKNOWN'
  >[];
  readonly supportsSharedContexts: boolean;
  readonly supportsVisualContent: boolean;
  readonly supportsCrossPageQuestions: boolean;
  readonly supportsOfficialAnswerKeys: boolean;
  readonly supportsRepeatedQuestionNumbers: boolean;
}

export interface DocumentProfile {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string | null;
  readonly kind: DocumentProfileKind;
  readonly status: DocumentProfileStatus;
  readonly extractorId: string;
  readonly capabilities: DocumentProfileCapabilities;
}
