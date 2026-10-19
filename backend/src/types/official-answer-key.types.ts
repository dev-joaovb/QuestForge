import type {
  AnswerKeyItemStatus,
  AnswerKeyStatus,
  AnswerKeyType,
  OfficialAnswerKey,
  OfficialAnswerKeyItem,
} from '@prisma/client';

export type OfficialAnswerKeyErrorCode =
  | 'ANSWER_KEY_NOT_FOUND'
  | 'ANSWER_KEY_NOT_DRAFT'
  | 'ANSWER_KEY_ITEM_NOT_FOUND'
  | 'ANSWER_KEY_DUPLICATE_VERSION'
  | 'ANSWER_KEY_DUPLICATE_ITEM'
  | 'ANSWER_KEY_INVALID_DATA'
  | 'ANSWER_KEY_FORBIDDEN'
  | 'ANSWER_KEY_PUBLISH_CONFLICT'
  | 'EXAM_NOT_FOUND'
  | 'EXAM_FORBIDDEN'
  | 'DOCUMENT_NOT_FOUND'
  | 'DOCUMENT_FORBIDDEN'
  | 'DOCUMENT_INVALID_TYPE'
  | 'QUESTION_NOT_FOUND'
  | 'QUESTION_FORBIDDEN'
  | 'QUESTION_EXAM_MISMATCH';

export class OfficialAnswerKeyError extends Error {
  public readonly code: OfficialAnswerKeyErrorCode;
  public readonly statusCode: number;

  constructor(
    code: OfficialAnswerKeyErrorCode,
    message: string,
    statusCode = 400,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'OfficialAnswerKeyError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type OfficialAnswerKeyWithItems = OfficialAnswerKey & {
  items: OfficialAnswerKeyItem[];
};

export interface CreateOfficialAnswerKeyItemInput {
  questionNumber: number;
  questionId?: string | null;
  correctAnswer?: string | null;
  previousAnswer?: string | null;
  status?: AnswerKeyItemStatus;
  isAnnulled?: boolean;
  justification?: string | null;
  textEvidence?: string | null;
  confidence?: number | null;
  sourcePage?: number | null;
}

export interface CreateOfficialAnswerKeyDraftInput {
  userId: string;
  examId: string;
  pdfDocumentId?: string | null;
  type?: AnswerKeyType;
  version?: number;
  publicationDate?: Date | null;
  notes?: string | null;
  items?: CreateOfficialAnswerKeyItemInput[];
}

export interface UpdateOfficialAnswerKeyDraftInput {
  type?: AnswerKeyType;
  version?: number;
  notes?: string | null;
  publicationDate?: Date | null;
  pdfDocumentId?: string | null;
  items?: CreateOfficialAnswerKeyItemInput[];
}

export interface UpdateOfficialAnswerKeyItemInput {
  questionId?: string | null;
  correctAnswer?: string | null;
  previousAnswer?: string | null;
  status?: AnswerKeyItemStatus;
  isAnnulled?: boolean;
  justification?: string | null;
  textEvidence?: string | null;
  confidence?: number | null;
  sourcePage?: number | null;
}

export interface FindAnswerKeyOptions {
  includeItems?: boolean;
}

export interface FindAnswerKeyVersionsOptions {
  type?: AnswerKeyType;
}

export interface FindAnswerKeyItemsOptions {
  status?: AnswerKeyItemStatus;
}
