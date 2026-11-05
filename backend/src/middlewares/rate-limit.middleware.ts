import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';

export interface AuthRateLimitOptions {
  windowMs?: number;
  maxAttempts?: number;
}

/**
 * Cria um rate limiter para endpoints sensíveis de autenticação (cadastro e login).
 * Utiliza `req.ip` resolvido pelo Express (com `trust proxy` desabilitado por padrão,
 * impedindo falsificação via cabeçalho `X-Forwarded-For` não confiável).
 */
export function createAuthRateLimiter(
  options: AuthRateLimitOptions = {}
): RateLimitRequestHandler {
  const windowMs = options.windowMs ?? 15 * 60 * 1000; // 15 minutos
  const maxAttempts = options.maxAttempts ?? 15;

  return rateLimit({
    windowMs,
    limit: maxAttempts,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: {
      xForwardedForHeader: false,
    },
    handler: (_req, res) => {
      res.status(429).json({
        error: 'TooManyRequests',
        message: 'Muitas tentativas realizadas. Aguarde alguns minutos antes de tentar novamente.',
      });
    },
  });
}

export interface EducationalAiRateLimitOptions {
  windowMs?: number;
  maxAttempts?: number;
}

/**
 * Cria um rate limiter para o endpoint de IA Educacional (`/api/educational-ai/analysis`).
 * Protege contra sobrecarga e abuso de requisições de inferência pesada.
 */
export function createEducationalAiRateLimiter(
  options: EducationalAiRateLimitOptions = {}
): RateLimitRequestHandler {
  const windowMs = options.windowMs ?? 60 * 1000; // 1 minuto
  const maxAttempts = options.maxAttempts ?? 20;

  return rateLimit({
    windowMs,
    limit: maxAttempts,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: {
      xForwardedForHeader: false,
    },
    handler: (_req, res) => {
      res.status(429).json({
        error: 'TooManyRequests',
        message: 'Muitas requisições de análise de IA. Aguarde um momento antes de tentar novamente.',
      });
    },
  });
}

