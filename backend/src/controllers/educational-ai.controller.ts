import type { Request, Response } from 'express';
import { EducationalAiService } from '../services/educational-ai.service.ts';
import { EducationalAiDomainError } from '../types/educational-ai.types.ts';
import { EducationalAnalyticsDomainError } from '../types/educational-analytics.types.ts';
import {
  validateEducationalAiAnalysisQuery,
  validateEducationalAiAnalysisBody,
} from '../validators/educational-ai.validator.ts';
import { logger } from '../utils/logger.ts';

export interface EducationalAiControllerDependencies {
  educationalAiService?: EducationalAiService;
}

/**
 * Controller HTTP para o subsistema de IA Educacional do QuestForge (Sprint 9.3).
 *
 * Responsabilidades e Regras de Segurança:
 * 1. A identidade do estudante é extraída estritamente da sessão autenticada (`req.user.id`).
 * 2. Nenhum `userId` é aceito em query, body ou headers customizados.
 * 3. Parâmetros de query e body são estritamente validados por Zod (.strict()).
 * 4. Aplica cabeçalhos `Cache-Control: no-store` para impedir cache de dados privados de diagnóstico.
 * 5. Gerencia cancelamento voluntário do chamador propagando AbortSignal e retornando HTTP 499.
 * 6. Falhas de inferência recuperáveis acionam o fallback determinístico no nível do serviço.
 * 7. Erros inesperados de banco ou runtime retornam HTTP 503 sem vazamento de stack traces ou segredos.
 */
export function createEducationalAiController(
  deps: EducationalAiControllerDependencies = {}
) {
  const educationalAiService = deps.educationalAiService ?? new EducationalAiService();

  return {
    /**
     * GET /api/educational-ai/analysis
     * Retorna a análise educacional consultiva para o usuário autenticado.
     */
    async getAnalysis(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      // Garante que o navegador e proxies intermediários nunca armazenem cache do diagnóstico
      res.setHeader(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate'
      );
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      try {
        // Validação estrita de ausência de parâmetros inesperados
        validateEducationalAiAnalysisQuery(req.query);
        validateEducationalAiAnalysisBody(req.body);

        // Conecta o cancelamento da requisição HTTP (AbortSignal)
        const abortController = new AbortController();
        const incomingSignal = (req as unknown as { signal?: AbortSignal }).signal;

        if (incomingSignal) {
          if (incomingSignal.aborted) {
            abortController.abort(incomingSignal.reason);
          } else {
            incomingSignal.addEventListener('abort', () => {
              abortController.abort(incomingSignal.reason);
            }, { once: true });
          }
        }

        const onClose = (): void => {
          if (!res.writableEnded) {
            abortController.abort('Client closed connection');
          }
        };
        res.on('close', onClose);

        try {
          const analysis = await educationalAiService.getEducationalAnalysis(
            req.user.id,
            { signal: abortController.signal }
          );

          if (!res.headersSent && !res.writableEnded) {
            res.status(200).json(analysis);
          }
        } finally {
          res.removeListener('close', onClose);
        }
      } catch (error) {
        handleEducationalAiControllerError(error, req, res);
      }
    },
  };
}

/**
 * Mapeia erros de domínio, erros de cancelamento e exceções inesperadas para respostas HTTP limpas.
 */
export function handleEducationalAiControllerError(
  error: unknown,
  req: Request,
  res: Response
): void {
  if (res.headersSent || res.writableEnded || res.socket?.destroyed) {
    return;
  }

  if (error instanceof EducationalAiDomainError) {
    if (error.code === 'EDUCATIONAL_AI_CANCELLED' || error.statusCode === 499) {
      res.status(499).json({
        error: error.code,
        message: error.message,
      });
      return;
    }

    res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }

  if (error instanceof EducationalAnalyticsDomainError) {
    res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }

  logger.error('educational_ai_controller_unexpected_error', {
    method: req.method,
    path: req.originalUrl,
    errorName: error instanceof Error ? error.name : 'UnknownError',
    errorMessage: error instanceof Error ? error.message : String(error),
  });

  res.status(503).json({
    error: 'ServiceUnavailable',
    message: 'Não foi possível gerar a análise educacional no momento.',
  });
}
