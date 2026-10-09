import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/**
 * Schema de validação das variáveis de ambiente do QuestForge.
 * Não inventa credenciais nem expõe segredos em logs ou respostas HTTP.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL é obrigatória e deve apontar para uma instância PostgreSQL.'),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET é obrigatória e deve possuir pelo menos 32 caracteres.'),
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().min(1).optional(),
  MINIO_ENDPOINT: z.string().min(1).default('localhost'),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_ACCESS_KEY: z.string().min(1).optional(),
  MINIO_SECRET_KEY: z.string().min(1).optional(),
  MINIO_BUCKET: z.string().min(1).default('questforge-documents'),
  MINIO_USE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((val) => val === 'true'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export interface EnvValidationResult {
  isValid: boolean;
  config: Partial<EnvConfig>;
  missingOrInvalidVars: string[];
}

/**
 * Valida um objeto de variáveis de ambiente de forma determinística e segura,
 * sem vazar valores sensíveis nos erros.
 */
export function validateEnv(rawEnv: NodeJS.ProcessEnv = process.env): EnvValidationResult {
  const parsed = envSchema.safeParse(rawEnv);

  if (parsed.success) {
    return {
      isValid: true,
      config: parsed.data,
      missingOrInvalidVars: [],
    };
  }

  const missingOrInvalidVars = Array.from(
    new Set(
      parsed.error.issues.map((issue) => {
        const field = issue.path.join('.') || 'UNKNOWN';
        return `${field}: ${issue.message}`;
      })
    )
  );

  return {
    isValid: false,
    config: {
      NODE_ENV:
        rawEnv.NODE_ENV === 'production' || rawEnv.NODE_ENV === 'test'
          ? rawEnv.NODE_ENV
          : 'development',
      PORT: Number(rawEnv.PORT) || 3000,
      FRONTEND_URL: rawEnv.FRONTEND_URL || 'http://localhost:3000',
    },
    missingOrInvalidVars,
  };
}

/**
 * Carrega e exige todas as variáveis obrigatórias, lançando erro explícito se ausentes.
 * Utilizado em fluxos estritos ou bootstrap de produção/workers.
 */
export function loadStrictEnv(rawEnv: NodeJS.ProcessEnv = process.env): EnvConfig {
  const result = validateEnv(rawEnv);
  if (!result.isValid) {
    throw new Error(
      `Falha na validação de variáveis de ambiente:\n- ${result.missingOrInvalidVars.join('\n- ')}`
    );
  }
  return result.config as EnvConfig;
}
