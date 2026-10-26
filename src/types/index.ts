export interface HealthApiResponse {
  status: 'healthy' | 'degraded';
  timestamp: string;
  app: {
    name: string;
    status: 'up' | 'down';
    environment: string;
  };
  dependencies: {
    database: {
      provider: 'postgresql';
      status: 'up' | 'down' | 'unconfigured';
      latencyMs: number | null;
      message: string;
    };
    environment: {
      status: 'configured' | 'incomplete';
      missingOrInvalidCount: number;
      issues: string[];
    };
  };
}

export type HealthFetchState =
  | { state: 'loading' }
  | { state: 'loaded'; data: HealthApiResponse; httpStatus: number }
  | { state: 'error'; message: string };

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSessionInfo {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
  lastUsedAt: string;
}

export interface AuthSessionResponse {
  user: AuthUser;
  session: AuthSessionInfo;
}

export interface RegisterRequestPayload {
  name: string;
  email: string;
  password: string;
}

export interface LoginRequestPayload {
  email: string;
  password: string;
}

export type QuestionType = 'MULTIPLE_CHOICE' | 'TRUE_FALSE';
export type QuestionDifficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type QuestionStatus = 'DRAFT' | 'ACTIVE' | 'NEEDS_REVIEW' | 'ARCHIVED';

export interface QuestionAlternativeDTO {
  id: string;
  letter: string;
  text: string;
  position: number;
}

export interface QuestionBaseDTO {
  id: string;
  userId: string;
  examId: string | null;
  originalNumber: number | null;
  statement: string;
  type: QuestionType;
  subject: string;
  topic: string | null;
  subtopic: string | null;
  board: string | null;
  examTitle: string | null;
  year: number | null;
  difficulty: QuestionDifficulty | null;
  sourcePage: number | null;
  status: QuestionStatus;
  hasAnswerKey: boolean;
  hasExplanation: boolean;
  alternatives: QuestionAlternativeDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface QuestionPublicViewDTO extends QuestionBaseDTO {
  answerKeyRevealed: false;
}

export interface QuestionOwnerDetailDTO extends QuestionBaseDTO {
  answerKeyRevealed: true;
  correctAnswer: string | null;
  explanation: string | null;
}

export type QuestionResponseDTO = QuestionPublicViewDTO | QuestionOwnerDetailDTO;

export interface PaginatedQuestionsResponse {
  items: QuestionResponseDTO[];
  total: number;
  currentPage: number;
  totalPages: number;
  limit: number;
}

export interface ListQuestionsParams {
  page?: number;
  limit?: number;
  search?: string;
  subject?: string;
  topic?: string;
  board?: string;
  examTitle?: string;
  type?: QuestionType | '';
  difficulty?: QuestionDifficulty | '';
  includeAnswer?: boolean;
}

export interface QuestionAlternativeInput {
  letter: string;
  text: string;
}

export interface CreateOrUpdateQuestionPayload {
  statement: string;
  type: QuestionType;
  subject: string;
  topic?: string | null;
  subtopic?: string | null;
  board?: string | null;
  examTitle?: string | null;
  year?: number | null;
  originalNumber?: number | null;
  difficulty?: QuestionDifficulty | null;
  correctAnswer?: string | null;
  explanation?: string | null;
  sourcePage?: number | null;
  status?: QuestionStatus;
  alternatives?: QuestionAlternativeInput[];
}

export type DocumentProcessingStatus =
  | 'UPLOADED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'NEEDS_OCR'
  | 'FAILED';

export interface PdfDocumentDTO {
  id: string;
  userId: string;
  examId: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  status: DocumentProcessingStatus;
  pageCount: number | null;
  extractedCharCount: number | null;
  requiresOcr: boolean;
  errorMessage: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedPdfDocumentsResponse {
  items: PdfDocumentDTO[];
  total: number;
  currentPage: number;
  totalPages: number;
  limit: number;
}

export interface ListPdfDocumentsParams {
  page?: number;
  limit?: number;
  status?: DocumentProcessingStatus | '';
}

// ============================================================================
// Tipos para Gabaritos Oficiais (Sprint 5)
// ============================================================================

export type OfficialAnswerKeyType = 'PRELIMINARY' | 'FINAL' | 'RECTIFIED';
export type OfficialAnswerKeyStatus = 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED' | 'ARCHIVED';
export type OfficialAnswerKeyItemStatus = 'ACTIVE' | 'ANNULLED' | 'CHANGED' | 'NEEDS_REVIEW';

export interface OfficialAnswerKeyItemDTO {
  id: string;
  answerKeyId: string;
  questionNumber: number;
  questionId: string | null;
  correctAnswer: string | null;
  previousAnswer: string | null;
  status: OfficialAnswerKeyItemStatus;
  isAnnulled: boolean;
  justification: string | null;
  textEvidence: string | null;
  confidence: number | null;
  sourcePage: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface OfficialAnswerKeyDTO {
  id: string;
  userId: string;
  examId: string;
  pdfDocumentId: string | null;
  type: OfficialAnswerKeyType;
  status: OfficialAnswerKeyStatus;
  version: number;
  isCurrent: boolean;
  publicationDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items?: OfficialAnswerKeyItemDTO[];
}

export interface CreateOfficialAnswerKeyItemPayload {
  questionNumber: number;
  questionId?: string | null;
  correctAnswer?: string | null;
  previousAnswer?: string | null;
  status?: OfficialAnswerKeyItemStatus;
  isAnnulled?: boolean;
  justification?: string | null;
  textEvidence?: string | null;
  confidence?: number | null;
  sourcePage?: number | null;
}

export interface CreateOfficialAnswerKeyDraftPayload {
  examId: string;
  pdfDocumentId?: string | null;
  type?: OfficialAnswerKeyType;
  version?: number;
  notes?: string | null;
  publicationDate?: string | null;
  items?: CreateOfficialAnswerKeyItemPayload[];
}

export interface UpdateOfficialAnswerKeyDraftPayload {
  type?: OfficialAnswerKeyType;
  version?: number;
  notes?: string | null;
  publicationDate?: string | null;
  pdfDocumentId?: string | null;
  items?: CreateOfficialAnswerKeyItemPayload[];
}

export interface UpdateOfficialAnswerKeyItemPayload {
  questionId?: string | null;
  correctAnswer?: string | null;
  previousAnswer?: string | null;
  status?: OfficialAnswerKeyItemStatus;
  isAnnulled?: boolean;
  justification?: string | null;
  textEvidence?: string | null;
  confidence?: number | null;
  sourcePage?: number | null;
}

export interface ReplaceOfficialAnswerKeyItemsPayload {
  items: CreateOfficialAnswerKeyItemPayload[];
}

export interface PublishOfficialAnswerKeyPayload {
  publicationDate?: string | null;
  syncQuestionAnswers?: boolean;
  confirmAllReviewed?: boolean;
}

export interface ListAnswerKeyVersionsParams {
  type?: OfficialAnswerKeyType | '';
}

export interface ListAnswerKeyItemsParams {
  status?: OfficialAnswerKeyItemStatus | '';
}

// ============================================================================
// Tipos para Motor de Simulados (Sprint 6)
// ============================================================================

export type SimulationStatus =
  | 'CREATED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'ABANDONED';

export type AnswerKeySource = 'OFFICIAL_KEY' | 'QUESTION_BANK';

export interface SimulationQuestionCriteria {
  subject?: string;
  topic?: string;
  subtopic?: string;
  board?: string;
  examTitle?: string;
  year?: number;
  difficulty?: QuestionDifficulty;
  type?: QuestionType;
  examId?: string;
}

export interface SimulationAlternativeDTO {
  id: string;
  letter: string;
  text: string;
  position: number;
}

export interface SimulationCurrentAttemptDTO {
  selectedAlternativeId: string | null;
  selectedLetter: string | null;
  answeredAt: string | null;
  timeSpentSeconds: number | null;
}

export interface SimulationPublicQuestionDTO {
  id: string;
  simulationId: string;
  questionId: string;
  position: number;
  statement: string;
  type: QuestionType;
  subject: string;
  topic: string | null;
  subtopic: string | null;
  board: string | null;
  examTitle: string | null;
  year: number | null;
  difficulty: QuestionDifficulty | null;
  alternatives: SimulationAlternativeDTO[];
  currentAttempt?: SimulationCurrentAttemptDTO | null;
}

export interface SimulationReviewQuestionDTO extends SimulationPublicQuestionDTO {
  answerKeySnapshot: string | null;
  isAnnulledSnapshot: boolean;
  snapshotSource: AnswerKeySource;
  officialAnswerKeyVersion: number | null;
  explanation: string | null;
  isCorrect: boolean | null;
}

export interface SimulationSummaryDTO {
  id: string;
  userId: string;
  title: string | null;
  status: SimulationStatus;
  totalQuestions: number;
  timeLimitSeconds: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationSeconds: number | null;
  scorePercentage: number | null;
  correctCount: number | null;
  wrongCount: number | null;
  unansweredCount: number | null;
  createdAt: string;
}

export interface SimulationDetailDTO extends SimulationSummaryDTO {
  timeRemainingSeconds: number | null;
  isExpired: boolean;
  questions: (SimulationPublicQuestionDTO | SimulationReviewQuestionDTO)[];
}

export interface SimulationResultDTO extends SimulationDetailDTO {
  scorePercentage: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  durationSeconds: number;
  questions: SimulationReviewQuestionDTO[];
}

export interface PublicQuestionAttemptDTO {
  id: string;
  simulationId: string;
  questionId: string;
  userId: string;
  selectedAlternativeId: string | null;
  selectedLetter: string | null;
  timeSpentSeconds: number | null;
  answeredAt: string | null;
}

export interface CreateSimulationPayload {
  title?: string | null;
  totalQuestions: number;
  timeLimitSeconds?: number | null;
  criteria?: SimulationQuestionCriteria;
  questionIds?: string[];
}

export interface SubmitAnswerPayload {
  questionId?: string;
  selectedAlternativeId?: string | null;
  timeSpentSeconds?: number | null;
}

export interface ListSimulationsParams {
  status?: SimulationStatus;
  limit?: number;
  offset?: number;
  page?: number;
}

export interface PaginatedSimulationsResponse {
  simulations: SimulationSummaryDTO[];
  total: number;
  limit: number;
  offset: number;
}

