import type {
  QuestionDifficultyValue,
  QuestionStatusValue,
  QuestionTypeValue,
} from './question.types.ts';

/**
 * Contratos de domínio para Extração Inteligente de Questões e Gabaritos (Sprint 4 — Etapa 4.1).
 *
 * Princípios arquiteturais e de integridade de dados:
 * 1. Compatibilidade estrita com os modelos `Exam`, `Question` e `Alternative` do Prisma.
 * 2. Toda questão extraída de forma automatizada nasce para revisão humana (`status: 'NEEDS_REVIEW'`
 *    por padrão, admitindo `'DRAFT'` quando explicitamente indicado), nunca ativada silenciosamente
 *    sem validação.
 * 3. Proibição absoluta de valores inventados:
 *    - `difficulty`, `correctAnswer`, `explanation`, `topic`, `subtopic`, `board`, `examTitle`, `year`,
 *      `originalNumber` e `sourcePage` são estritamente opcionais/nullable (`null` quando ausentes na fonte).
 *    - Se `subject` não puder ser determinado com segurança a partir do documento ou do contexto fornecido,
 *      permanece `null` no item bruto extraído e exige definição ou revisão humana antes de persistir em `Question`.
 * 4. Rastreabilidade de origem: cada item extraído preserva `sourceDocumentId`, `sourcePage` e avisos de
 *    revisão (`reviewWarnings`), sem expor caminhos internos do MinIO (`objectKey`, `storageBucket`) ou segredos.
 */

export type AiExtractionErrorCode =
  | 'AI_EXTRACTION_UNAVAILABLE'
  | 'AI_EXTRACTION_INVALID_INPUT'
  | 'AI_EXTRACTION_INVALID_OUTPUT'
  | 'AI_EXTRACTION_SCHEMA_MISMATCH'
  | 'AI_EXTRACTION_LIMIT_EXCEEDED'
  | 'AI_EXTRACTION_TIMEOUT'
  | 'AI_EXTRACTION_FAILED';

export class AiExtractionDomainError extends Error {
  public readonly code: AiExtractionErrorCode;
  public readonly statusCode: number;

  constructor(code: AiExtractionErrorCode, message: string, statusCode = 400) {
    super(message);
    this.name = 'AiExtractionDomainError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type AiExtractionSourceKind = 'DIGITAL_PDF_TEXT' | 'OCR_PDF_TEXT' | 'RAW_EXAM_TEXT';

export type ExtractedQuestionReviewStatus = Extract<
  QuestionStatusValue,
  'NEEDS_REVIEW' | 'DRAFT'
>;

export interface ExtractedAlternativeDraft {
  letter: string;
  text: string;
  position: number;
}

export interface ExtractedExamMetadataDraft {
  title: string | null;
  institution: string | null;
  board: string | null;
  year: number | null;
  position: string | null;
  description: string | null;
}

/**
 * Representa uma questão estruturada extraída pela IA e validada pelo schema Zod.
 * Mantém rastreabilidade com o documento de origem e destaca eventuais pendências para revisão humana.
 */
export interface ExtractedQuestionDraft {
  originalNumber: number | null;
  statement: string;
  type: QuestionTypeValue;
  subject: string | null;
  topic: string | null;
  subtopic: string | null;
  board: string | null;
  examTitle: string | null;
  year: number | null;
  difficulty: QuestionDifficultyValue | null;
  correctAnswer: string | null;
  explanation: string | null;
  sourcePage: number | null;
  sourceDocumentId: string | null;
  status: ExtractedQuestionReviewStatus;
  requiresHumanReview: true;
  reviewWarnings: string[];
  alternatives: ExtractedAlternativeDraft[];
}

export interface AnswerKeyEntryDraft {
  questionNumber: number;
  correctAnswer: string | null;
  isAnnulled: boolean;
  sourcePage: number | null;
}

export interface ValidatedAiQuestionExtractionPayload {
  examMetadata: ExtractedExamMetadataDraft | null;
  questions: ExtractedQuestionDraft[];
  answerKey: AnswerKeyEntryDraft[];
  warnings: string[];
}

export interface AiQuestionExtractionRequest {
  sourceDocumentId?: string | null;
  sourceKind?: AiExtractionSourceKind;
  extractedText: string;
  pageCount?: number | null;
  defaultSubject?: string | null;
  defaultBoard?: string | null;
  defaultExamTitle?: string | null;
  defaultYear?: number | null;
  maxQuestions?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AiExtractionServiceStatus {
  available: boolean;
  providerName: string;
  modelName: string | null;
  baseUrl: string;
  message: string;
}

export interface AiQuestionExtractionResult {
  providerName: string;
  modelName: string;
  sourceDocumentId: string | null;
  sourceKind: AiExtractionSourceKind;
  examMetadata: ExtractedExamMetadataDraft | null;
  questions: ExtractedQuestionDraft[];
  answerKey: AnswerKeyEntryDraft[];
  totalExtractedQuestions: number;
  questionsNeedingSubject: number;
  warnings: string[];
  extractedAt: Date;
}
