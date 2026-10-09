import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.ts';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error('unhandled_api_error', {
    method: req.method,
    path: req.originalUrl,
    errorName: err instanceof Error ? err.name : 'UnknownError',
    errorMessage: err instanceof Error ? err.message : String(err),
  });

  res.status(500).json({
    error: 'InternalServerError',
    message: 'Ocorreu um erro interno no servidor.',
  });
}
