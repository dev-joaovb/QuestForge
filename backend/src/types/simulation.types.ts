import type {
  Alternative,
  AnswerKeySource,
  Question,
  QuestionAttempt,
  Simulation,
  SimulationQuestion,
  SimulationStatus,
} from '@prisma/client';

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
