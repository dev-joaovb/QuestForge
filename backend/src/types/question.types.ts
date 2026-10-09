/**
 * Tipos de domínio e DTOs do Banco de Questões (Sprint 2 — Etapa 2.1).
 *
 * Política explícita de proteção do gabarito:
 * - `QuestionPublicViewDTO`: omite estruturalmente `correctAnswer` e `explanation` (informa apenas
 *   `hasAnswerKey: boolean` e `hasExplanation: boolean`), evitando exposição involuntária durante
 *   listagens e consultas de estudo.
 * - `QuestionOwnerDetailDTO`: inclui `correctAnswer` e `explanation` exclusivamente quando a política
 *   de domínio verifica que o solicitante é o proprietário autenticado (`question.userId === actorUserId`)
 *   e que a operação solicita explicitamente os dados de gabarito/edição.
 */

export type QuestionTypeValue = 'MULTIPLE_CHOICE' | 'TRUE_FALSE';
export type QuestionDifficultyValue = 'EASY' | 'MEDIUM' | 'HARD';
export type QuestionStatusValue = 'DRAFT' | 'ACTIVE' | 'NEEDS_REVIEW' | 'ARCHIVED';

export interface AlternativeDTO {
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
  type: QuestionTypeValue;
  subject: string;
  topic: string | null;
  subtopic: string | null;
  board: string | null;
  examTitle: string | null;
  year: number | null;
  difficulty: QuestionDifficultyValue | null;
  sourcePage: number | null;
  status: QuestionStatusValue;
  hasAnswerKey: boolean;
  hasExplanation: boolean;
  alternatives: AlternativeDTO[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * DTO padrão de visualização/listagem sem exposição de gabarito (`correctAnswer`) ou comentário (`explanation`).
 */
export interface QuestionPublicViewDTO extends QuestionBaseDTO {
  answerKeyRevealed: false;
}

/**
 * DTO autorizado ao proprietário quando o gabarito é explicitamente solicitado ou durante criação/edição.
 */
export interface QuestionOwnerDetailDTO extends QuestionBaseDTO {
  answerKeyRevealed: true;
  correctAnswer: string | null;
  explanation: string | null;
}

export type QuestionResponseDTO = QuestionPublicViewDTO | QuestionOwnerDetailDTO;

export interface PaginatedQuestionsResult<T = QuestionResponseDTO> {
  items: T[];
  total: number;
  currentPage: number;
  totalPages: number;
  limit: number;
}

export type QuestionErrorCode =
  | 'QUESTION_NOT_FOUND'
  | 'QUESTION_FORBIDDEN'
  | 'QUESTION_VALIDATION_ERROR';

export class QuestionDomainError extends Error {
  public readonly code: QuestionErrorCode;
  public readonly statusCode: number;

  constructor(code: QuestionErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = 'QuestionDomainError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
