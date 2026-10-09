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


