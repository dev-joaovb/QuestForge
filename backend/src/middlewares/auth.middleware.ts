import type { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.ts';
import {
  AuthDomainError,
  type PublicUserDTO,
  type SessionInfoDTO,
} from '../types/auth.types.ts';
import { clearSessionCookie, SESSION_COOKIE_NAME } from '../utils/cookies.ts';
import { logger } from '../utils/logger.ts';

declare global {
  namespace Express {
    interface Request {
      user?: PublicUserDTO;
      sessionInfo?: SessionInfoDTO;
    }
  }
}

/**
 * Middleware de autenticação que exige sessão válida via cookie HttpOnly (`qf_session`).
 * Comportamento estritamente Fail-Closed:
 * - Se o cookie estiver ausente, expirado ou revogado: limpa o cookie e retorna HTTP 401.
 * - Se ocorrer falha de banco/infraestrutura: retorna HTTP 500/503 e NUNCA autentica a requisição.
 */
export function createRequireAuthMiddleware(authService: AuthService = new AuthService()) {
  return async function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];

    if (!rawToken || typeof rawToken !== 'string' || rawToken.trim() === '') {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Autenticação necessária.',
      });
      return;
    }

    try {
      const validated = await authService.validateSession(rawToken);
      req.user = validated.user;
      req.sessionInfo = validated.session;
      next();
    } catch (error) {
      if (error instanceof AuthDomainError && error.statusCode === 401) {
        clearSessionCookie(res);
        res.status(401).json({
          error: 'Unauthorized',
          message: error.message,
        });
        return;
      }

      logger.error('auth_middleware_unexpected_error', {
        path: req.originalUrl,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });

      res.status(503).json({
        error: 'ServiceUnavailable',
        message: 'Não foi possível verificar a sessão no momento.',
      });
    }
  };
}
