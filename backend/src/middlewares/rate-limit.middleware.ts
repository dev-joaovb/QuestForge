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
