import type {
  Alternative,
  AnswerKeySource,
  Question,
  QuestionAttempt,
  QuestionDifficulty,
  QuestionType,
  Simulation,
  SimulationQuestion,
  SimulationStatus,
} from '@prisma/client';
import type { SimulationQuestionCriteria } from '../repositories/question.repository.ts';

export type SimulationErrorCode =
  | 'SIMULATION_NOT_FOUND'
  | 'SIMULATION_FORBIDDEN'
  | 'SIMULATION_NOT_IN_PROGRESS'
  | 'SIMULATION_ALREADY_COMPLETED'
  | 'SIMULATION_EXPIRED'
  | 'SIMULATION_INVALID_INPUT'
  | 'SIMULATION_INSUFFICIENT_QUESTIONS'
  | 'SIMULATION_QUESTION_NOT_FOUND'
  | 'SIMULATION_QUESTION_MISMATCH'
  | 'ALTERNATIVE_NOT_FOUND'
  | 'ALTERNATIVE_MISMATCH';

export class SimulationDomainError extends Error {
  public readonly code: SimulationErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(
    code: SimulationErrorCode,
    message: string,
    statusCode = 400,
    details?: unknown,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'SimulationDomainError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export { SimulationStatus, AnswerKeySource };
export type { SimulationQuestionCriteria };

export interface CreateSimulationQuestionInput {
  questionId: string;
  position: number;
  answerKeySnapshot?: string | null;
  isAnnulledSnapshot?: boolean;
  snapshotSource?: AnswerKeySource;
  officialAnswerKeyId?: string | null;
  officialAnswerKeyItemId?: string | null;
  officialAnswerKeyVersion?: number | null;
}

export interface CreateSimulationInput {
  userId: string;
  title?: string | null;
  timeLimitSeconds?: number | null;
  totalQuestions: number;
  status?: SimulationStatus;
  questions: CreateSimulationQuestionInput[];
}

export interface UpdateSimulationInput {
  title?: string | null;
  status?: SimulationStatus;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  durationSeconds?: number | null;
  scorePercentage?: number | null;
  correctCount?: number | null;
  wrongCount?: number | null;
  unansweredCount?: number | null;
}

export interface UpsertQuestionAttemptInput {
  userId: string;
  simulationId: string;
  questionId: string;
  selectedAlternativeId?: string | null;
  selectedLetter?: string | null;
  isCorrect?: boolean | null;
  timeSpentSeconds?: number | null;
  answeredAt?: Date | null;
}

export interface SimulationFilterParams {
  status?: SimulationStatus;
  limit?: number;
  offset?: number;
}

export type SimulationQuestionWithQuestion = SimulationQuestion & {
  question: Question & {
    alternatives: Alternative[];
  };
};

export type QuestionAttemptWithAlternative = QuestionAttempt & {
  selectedAlternative?: Alternative | null;
};

export type SimulationWithQuestions = Simulation & {
  questions: SimulationQuestionWithQuestion[];
};

export type SimulationWithAttempts = Simulation & {
  attempts: QuestionAttempt[];
};

export type SimulationWithFullDetails = Simulation & {
  questions: SimulationQuestionWithQuestion[];
  attempts: QuestionAttemptWithAlternative[];
};

export interface PaginatedSimulationsResult {
  items: Simulation[];
  total: number;
  limit: number;
  offset: number;
}

// ============================================================================
// DTOs da Camada de Serviço (Sprint 6.3)
// ============================================================================

export interface CreateSimulationRequest {
  title?: string | null;
  totalQuestions: number;
  timeLimitSeconds?: number | null;
  criteria?: SimulationQuestionCriteria;
  questionIds?: string[];
}

export interface SubmitAnswerRequest {
  simulationId: string;
  questionId: string;
  selectedAlternativeId?: string | null;
  timeSpentSeconds?: number | null;
}

export interface SimulationAlternativeDTO {
  id: string;
  letter: string;
  text: string;
  position: number;
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
  currentAttempt?: {
    selectedAlternativeId: string | null;
    selectedLetter: string | null;
    answeredAt: Date | null;
    timeSpentSeconds: number | null;
  } | null;
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
  startedAt: Date | null;
  finishedAt: Date | null;
  durationSeconds: number | null;
  scorePercentage: number | null;
  correctCount: number | null;
  wrongCount: number | null;
  unansweredCount: number | null;
  createdAt: Date;
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
