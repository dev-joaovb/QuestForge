import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.ts';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (
    err instanceof SyntaxError &&
    'status' in err &&
    (err as any).status === 400 &&
    'body' in (err as any)
  ) {
    res.status(400).json({
      error: 'BadRequest',
      message: 'JSON malformado ou inválido no corpo da requisição.',
    });
    return;
  }

  if (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    (err as any).type === 'entity.too.large'
  ) {
    res.status(413).json({
      error: 'PayloadTooLarge',
      message: 'Corpo da requisição excede o limite máximo permitido.',
    });
    return;
  }

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
