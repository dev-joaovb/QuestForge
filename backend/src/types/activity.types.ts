import type { StudyActivity, StudyActivityType, UserStreak } from '@prisma/client';

export type { StudyActivity, StudyActivityType, UserStreak };

export class StudyActivityDomainError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(code: string, message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = 'StudyActivityDomainError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface StudyActivityDTO {
  id: string;
  userId: string;
  type: StudyActivityType;
  simulationId: string | null;
  questionId: string | null;
  examId: string | null;
  durationSeconds: number | null;
  scorePercentage: number | null;
  correctCount: number | null;
  wrongCount: number | null;
  unansweredCount: number | null;
  completedAt: Date;
  createdAt: Date;
}

export interface UserStreakDTO {
  id: string;
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecordStudyActivityInput {
  userId: string;
  type: StudyActivityType;
  simulationId?: string | null;
  questionId?: string | null;
  examId?: string | null;
  durationSeconds?: number | null;
  scorePercentage?: number | null;
  correctCount?: number | null;
  wrongCount?: number | null;
  unansweredCount?: number | null;
  completedAt?: Date;
  skipResourceValidation?: boolean;
}

export type StreakTransitionAction =
  | 'STARTED'
  | 'MAINTAINED_SAME_DAY'
  | 'INCREMENTED'
  | 'RESET'
  | 'IGNORED_RETROACTIVE';

export interface StreakTransitionResult {
  previousCurrentStreak: number;
  previousLongestStreak: number;
  previousLastActivityDate: string | null;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string;
  deltaDays: number | null;
  action: StreakTransitionAction;
  isNewRecord: boolean;
}

export interface CreateActivityResult {
  activity: StudyActivity;
  wasCreated: boolean;
}

export interface RecordActivityOutput {
  activity: StudyActivity;
  streak: UserStreak;
  transition: StreakTransitionResult;
  wasCreated: boolean;
}

export interface ListStudyActivitiesOptions {
  limit: number;
  offset: number;
  type?: StudyActivityType;
  startDate?: Date;
  endDate?: Date;
}

export interface PaginatedStudyActivitiesDTO {
  activities: StudyActivityDTO[];
  total: number;
  limit: number;
  offset: number;
}

export interface IStudyActivityRepository {
  create(data: RecordStudyActivityInput): Promise<CreateActivityResult>;
  findBySimulationId(simulationId: string): Promise<StudyActivity | null>;
  findById(id: string): Promise<StudyActivity | null>;
  findByUser(userId: string, limit?: number): Promise<StudyActivity[]>;
  findManyByUser(userId: string, options: ListStudyActivitiesOptions): Promise<StudyActivity[]>;
  countByUser(
    userId: string,
    filter?: { type?: StudyActivityType; startDate?: Date; endDate?: Date }
  ): Promise<number>;
}

export interface IUserStreakRepository {
  findByUserId(userId: string): Promise<UserStreak | null>;
  upsert(
    userId: string,
    data: {
      currentStreak: number;
      longestStreak: number;
      lastActivityDate: string;
    }
  ): Promise<UserStreak>;
  acquireUserLock(userId: string): Promise<void>;
}
