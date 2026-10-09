import type { Request, Response } from 'express';
import { AuthService } from '../services/auth.service.ts';
import { AuthDomainError } from '../types/auth.types.ts';
import {
  clearSessionCookie,
  SESSION_COOKIE_NAME,
  setSessionCookie,
} from '../utils/cookies.ts';
import { logger } from '../utils/logger.ts';

export interface AuthControllerDependencies {
  authService?: AuthService;
  nodeEnv?: string;
}

/**
 * Controller HTTP para os fluxos essenciais de Autenticação (Sprint 1 — Etapa 1.2):
 * - POST /api/auth/register
 * - POST /api/auth/login
 * - POST /api/auth/logout
 * - GET /api/auth/me
 */
export function createAuthController(deps: AuthControllerDependencies = {}) {
  const authService = deps.authService ?? new AuthService();
  const nodeEnv = deps.nodeEnv ?? process.env.NODE_ENV ?? 'development';

  return {
    async register(req: Request, res: Response): Promise<void> {
      try {
        const result = await authService.register(req.body);
        setSessionCookie(res, result.rawSessionToken, result.session.expiresAt, nodeEnv);

        res.status(201).json({
          user: result.user,
          session: result.session,
        });
      } catch (error) {
        handleAuthControllerError(error, req, res);
      }
    },

    async login(req: Request, res: Response): Promise<void> {
      try {
        const result = await authService.login(req.body);
        setSessionCookie(res, result.rawSessionToken, result.session.expiresAt, nodeEnv);

        res.status(200).json({
          user: result.user,
          session: result.session,
        });
      } catch (error) {
        handleAuthControllerError(error, req, res);
      }
    },

    async logout(req: Request, res: Response): Promise<void> {
      const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
      try {
        if (rawToken && typeof rawToken === 'string') {
          await authService.logout(rawToken);
        }
        clearSessionCookie(res, nodeEnv);
        res.status(200).json({
          message: 'Sessão encerrada com sucesso.',
        });
      } catch (error) {
        // Mesmo em caso de erro interno ao revogar no banco, limpa o cookie do cliente
        clearSessionCookie(res, nodeEnv);
        handleAuthControllerError(error, req, res);
      }
    },

    async me(req: Request, res: Response): Promise<void> {
      if (!req.user || !req.sessionInfo) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      res.status(200).json({
        user: req.user,
        session: req.sessionInfo,
      });
    },
  };
}

function handleAuthControllerError(error: unknown, req: Request, res: Response): void {
  if (error instanceof AuthDomainError) {
    res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
    });
    return;
  }

  logger.error('auth_controller_unexpected_error', {
    method: req.method,
    path: req.originalUrl,
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });

  res.status(500).json({
    error: 'InternalServerError',
    message: 'Não foi possível processar a solicitação de autenticação.',
  });
}
