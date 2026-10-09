import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.ts';

export const CSRF_HEADER_NAME = 'x-requested-with';
export const CSRF_HEADER_EXPECTED_VALUE = 'QuestForge-Client';

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface CsrfProtectionOptions {
  allowedOrigins?: string[];
}

/**
 * Extrai a lista de origens confiáveis a partir da configuração do ambiente.
 */
export function getAllowedOrigins(customOrigins?: string[]): Set<string> {
  const origins = new Set<string>();

  const configuredFrontend = process.env.FRONTEND_URL?.trim();
  if (configuredFrontend) {
    try {
      origins.add(new URL(configuredFrontend).origin);
    } catch {
      origins.add(configuredFrontend);
    }
  } else {
    origins.add('http://localhost:3000');
    origins.add('http://localhost:5173');
  }

  const configuredAppUrl = process.env.APP_URL?.trim();
  if (configuredAppUrl && configuredAppUrl !== 'MY_APP_URL') {
    try {
      origins.add(new URL(configuredAppUrl).origin);
    } catch {
      // ignora URL inválida de placeholder
    }
  }

  if (customOrigins) {
    for (const o of customOrigins) {
      origins.add(o);
    }
  }

  return origins;
}

function extractOriginFromHeader(headerValue: string | undefined): string | null {
  if (!headerValue) return null;
  try {
    return new URL(headerValue).origin;
  } catch {
    return null;
  }
}

/**
 * Middleware de proteção CSRF para métodos HTTP mutáveis (POST, PUT, PATCH, DELETE).
 *
 * Defesa em profundidade:
 * 1. Exige o cabeçalho customizado `X-Requested-With: QuestForge-Client` (que não pode ser
 *    enviado por formulários HTML cross-site sem passar por preflight CORS).
 * 2. Quando os cabeçalhos `Origin` ou `Referer` estão presentes, verifica estritamente se a
 *    origem pertence à lista de origens permitidas (`FRONTEND_URL` / mesmo host).
 */
export function createCsrfProtection(options: CsrfProtectionOptions = {}) {
  return function csrfProtection(req: Request, res: Response, next: NextFunction): void {
    if (SAFE_HTTP_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }

    const customHeader = req.headers[CSRF_HEADER_NAME];
    if (customHeader !== CSRF_HEADER_EXPECTED_VALUE) {
      logger.warn('csrf_rejected_missing_custom_header', {
        method: req.method,
        path: req.originalUrl,
      });
      res.status(403).json({
        error: 'CsrfValidationFailed',
        message: 'Requisição bloqueada pela proteção CSRF (cabeçalho de cliente ausente ou inválido).',
      });
      return;
    }

    const allowedOrigins = getAllowedOrigins(options.allowedOrigins);
    const requestHost = req.headers.host;
    if (requestHost) {
      allowedOrigins.add(`http://${requestHost}`);
      allowedOrigins.add(`https://${requestHost}`);
    }

    const originHeader = req.headers.origin;
    const refererHeader = req.headers.referer;

    if (originHeader) {
      const parsedOrigin = extractOriginFromHeader(originHeader);
      if (!parsedOrigin || !allowedOrigins.has(parsedOrigin)) {
        logger.warn('csrf_rejected_invalid_origin', {
          method: req.method,
          path: req.originalUrl,
          origin: originHeader,
        });
        res.status(403).json({
          error: 'CsrfValidationFailed',
          message: 'Origem da requisição não autorizada.',
        });
        return;
      }
    } else if (refererHeader) {
      const parsedRefererOrigin = extractOriginFromHeader(refererHeader);
      if (!parsedRefererOrigin || !allowedOrigins.has(parsedRefererOrigin)) {
        logger.warn('csrf_rejected_invalid_referer', {
          method: req.method,
          path: req.originalUrl,
        });
        res.status(403).json({
          error: 'CsrfValidationFailed',
          message: 'Origem de referência da requisição não autorizada.',
        });
        return;
      }
    }

    next();
  };
}
