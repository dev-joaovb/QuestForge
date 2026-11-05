import { z } from 'zod';
import type {
  EducationalStudentStatsDTO,
  TrendDirection,
} from './educational-analytics.types.ts';

/**
 * Erro de domínio do subsistema de IA Educacional.
 */
export class EducationalAiDomainError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(code: string, message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = 'EducationalAiDomainError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Nível de prioridade de estudo atribuído a uma disciplina.
 */
export type StudyPriorityLevel = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Nível de confiança estatística da análise gerada.
 */
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Ponto forte identificado no estudante.
 */
export interface StrengthItemDTO {
  subject: string;
  description: string;
  accuracyPercentage: number;
}

/**
 * Ponto fraco ou oportunidade de melhoria identificada.
 */
export interface WeaknessItemDTO {
  subject: string;
  description: string;
  accuracyPercentage: number;
}

/**
 * Prioridade de estudo recomendada.
 */
export interface StudyPriorityDTO {
  subject: string;
  priority: StudyPriorityLevel;
  reason: string;
  targetAccuracyPercentage?: number;
}

/**
 * Recomendação prática e acionável.
 */
export interface RecommendationItemDTO {
  title: string;
  description: string;
  actionableStep: string;
}

/**
 * Tendência educacional interpretada com descrição contextual.
 */
export interface EducationalTrendAnalysisDTO {
  direction: TrendDirection;
  description: string;
  deltaPercentage: number | null;
}

/**
 * Contrato de resposta consolidado da análise educacional (Sprint 9.2).
 * Exclusivamente consultivo e desprovido de qualquer PII.
 */
export interface EducationalAnalysisResponseDTO {
  summary: string;
  strengths: StrengthItemDTO[];
  weaknesses: WeaknessItemDTO[];
  trend: EducationalTrendAnalysisDTO;
  recommendations: RecommendationItemDTO[];
  priorities: StudyPriorityDTO[];
  confidenceLevel: ConfidenceLevel;
  insufficientDataNotice: string | null;
  source: 'AI_INFERENCE' | 'DETERMINISTIC_FALLBACK';
  generatedAt: string;
}

/**
 * Payload estruturado do prompt para envio ao cliente de IA.
 */
export interface EducationalPromptPayload {
  systemPrompt: string;
  userPrompt: string;
  sanitizedStats: EducationalStudentStatsDTO;
}

/**
 * Opções de chamada ao cliente de inferência.
 */
export interface EducationalAiClientOptions {
  modelName?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Interface desacoplada do cliente de IA Educacional.
 */
export interface IEducationalAiClient {
  generateAnalysis(
    prompt: EducationalPromptPayload,
    options?: EducationalAiClientOptions
  ): Promise<string>;
  isAvailable?(options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<boolean>;
}

// =========================================================================
// ESQUEMAS DE VALIDAÇÃO ZOD DA RESPOSTA DO MODELO
// =========================================================================

export const strengthItemSchema = z.object({
  subject: z.string().trim().min(1).max(100),
  description: z.string().trim().min(5).max(500),
  accuracyPercentage: z.number().min(0).max(100),
});

export const weaknessItemSchema = z.object({
  subject: z.string().trim().min(1).max(100),
  description: z.string().trim().min(5).max(500),
  accuracyPercentage: z.number().min(0).max(100),
});

export const studyPrioritySchema = z.object({
  subject: z.string().trim().min(1).max(100),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  reason: z.string().trim().min(5).max(500),
  targetAccuracyPercentage: z.number().min(0).max(100).optional(),
});

export const recommendationItemSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(600),
  actionableStep: z.string().trim().min(5).max(400),
});

export const educationalTrendSchema = z.object({
  direction: z.enum(['IMPROVING', 'STABLE', 'DECLINING', 'INSUFFICIENT_DATA']),
  description: z.string().trim().min(5).max(500),
  deltaPercentage: z.number().nullable(),
});

export const rawAiEducationalAnalysisSchema = z.object({
  summary: z.string().trim().min(10).max(2000),
  strengths: z.array(strengthItemSchema).max(10),
  weaknesses: z.array(weaknessItemSchema).max(10),
  trend: educationalTrendSchema,
  recommendations: z.array(recommendationItemSchema).min(1).max(8),
  priorities: z.array(studyPrioritySchema).max(10),
  confidenceLevel: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  insufficientDataNotice: z.string().trim().max(1000).nullable(),
});

export type RawAiEducationalAnalysis = z.infer<typeof rawAiEducationalAnalysisSchema>;
