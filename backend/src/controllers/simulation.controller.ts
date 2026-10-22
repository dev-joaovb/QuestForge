import type { Request, Response } from 'express';
import { SimulationService } from '../services/simulation.service.ts';
import {
  SimulationDomainError,
  type PublicQuestionAttemptDTO,
  type QuestionAttempt,
} from '../types/simulation.types.ts';
import {
  validateCreateSimulation,
  validateListSimulationsQuery,
  validateSubmitAnswer,
  simulationIdParamSchema,
} from '../validators/simulation.validator.ts';
import { logger } from '../utils/logger.ts';

export interface SimulationControllerDependencies {
  simulationService?: SimulationService;
}

/**
 * Mapeia e sanitiza a entidade de tentativa persistida no banco (QuestionAttempt)
 * para um DTO público estrito (PublicQuestionAttemptDTO).
 *
 * Garante que informações autoritativas de gabarito e correção (`isCorrect`,
 * snapshots de gabarito, anulações, justificativas) NUNCA vazem pela API HTTP
 * durante a submissão de respostas com o simulado em andamento.
 */
export function toPublicQuestionAttemptDTO(
  attempt: QuestionAttempt
): PublicQuestionAttemptDTO {
  return {
    id: attempt.id,
    simulationId: attempt.simulationId,
    questionId: attempt.questionId,
    userId: attempt.userId,
    selectedAlternativeId: attempt.selectedAlternativeId,
    selectedLetter: attempt.selectedLetter,
    timeSpentSeconds: attempt.timeSpentSeconds,
    answeredAt: attempt.answeredAt,
  };
}

/**
 * Controller HTTP para o Motor de Simulados (Sprint 6.4).
 *
 * Responsabilidades e Regras de Segurança:
 * 1. A identidade do usuário autenticado é obtida exclusivamente de `req.user.id`.
 *    Qualquer `userId` enviado no corpo ou query da requisição é descartado e rejeitado pelos schemas Zod `.strict()`.
 * 2. Mapeia erros de domínio (`SimulationDomainError`) para códigos de status HTTP apropriados
 *    (400, 403, 404, 409, 410, 422), sem vazar stack traces, queries SQL ou detalhes internos do banco de dados.
 * 3. Falhas inesperadas resultam em HTTP 503 (ServiceUnavailable) com log estruturado seguro.
 * 4. Protege contra a exposição antecipada de gabaritos e snapshots durante o andamento da prova.
 */
export function createSimulationController(deps: SimulationControllerDependencies = {}) {
  const simulationService = deps.simulationService ?? new SimulationService();

  return {
    /**
     * POST /api/simulations
     * Cria um novo simulado com critérios de filtragem ou lista fixa de questões.
     */
    async create(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      try {
        const validatedInput = validateCreateSimulation(req.body);
        const result = await simulationService.createSimulation(
          req.user.id,
          validatedInput
        );
        res.status(201).json({ simulation: result });
      } catch (error) {
        handleSimulationControllerError(error, req, res);
      }
    },

    /**
     * GET /api/simulations
     * Lista os simulados pertencentes ao usuário autenticado com paginação e filtro por status.
     */
    async list(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      try {
        const query = validateListSimulationsQuery(req.query);
        const offset = query.page !== undefined ? (query.page - 1) * query.limit : query.offset;

        const result = await simulationService.listUserSimulations(req.user.id, {
          status: query.status,
          limit: query.limit,
          offset,
        });

        res.status(200).json({
          simulations: result.items,
          total: result.total,
          limit: result.limit,
          offset: result.offset,
        });
      } catch (error) {
        handleSimulationControllerError(error, req, res);
      }
    },

    /**
     * GET /api/simulations/:id
     * Consulta os detalhes de um simulado específico.
     * Preserva a política de proteção de gabarito para simulados em andamento.
     */
    async getById(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      const paramResult = simulationIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        res.status(400).json({
          error: 'SIMULATION_INVALID_INPUT',
          message: 'Identificador do simulado inválido.',
        });
        return;
      }

      try {
        const result = await simulationService.getSimulation(
          req.user.id,
          paramResult.data.id
        );
        res.status(200).json({ simulation: result });
      } catch (error) {
        handleSimulationControllerError(error, req, res);
      }
    },

    /**
     * POST /api/simulations/:id/start
     * Inicia a contagem oficial de tempo do simulado no servidor.
     */
    async start(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      const paramResult = simulationIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        res.status(400).json({
          error: 'SIMULATION_INVALID_INPUT',
          message: 'Identificador do simulado inválido.',
        });
        return;
      }

      try {
        const result = await simulationService.startSimulation(
          req.user.id,
          paramResult.data.id
        );
        res.status(200).json({ simulation: result });
      } catch (error) {
        handleSimulationControllerError(error, req, res);
      }
    },

    /**
     * POST /api/simulations/:id/answers
     * Envia ou altera a resposta de uma questão no simulado sob bloqueio atômico.
     */
    async submitAnswer(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      const paramResult = simulationIdParamSchema.safeParse({ id: req.params.id });
      if (!paramResult.success) {
        res.status(400).json({
          error: 'SIMULATION_INVALID_INPUT',
          message: 'Identificador do simulado inválido.',
        });
        return;
      }

      try {
        const validatedBody = validateSubmitAnswer(req.body);
        const questionId = req.params.questionId ?? validatedBody.questionId;

        if (!questionId || typeof questionId !== 'string' || questionId.trim() === '') {
          res.status(400).json({
            error: 'SIMULATION_INVALID_INPUT',
            message: 'O identificador da questão (questionId) é obrigatório.',
          });
          return;
        }

        const attempt = await simulationService.submitAnswer(req.user.id, {
          simulationId: paramResult.data.id,
          questionId: questionId.trim(),
          selectedAlternativeId: validatedBody.selectedAlternativeId,
          timeSpentSeconds: validatedBody.timeSpentSeconds,
        });

        res.status(200).json({ attempt: toPublicQuestionAttemptDTO(attempt) });
      } catch (error) {
        handleSimulationControllerError(error, req, res);
      }
    },

    /**
     * POST /api/simulations/:id/finish
     * Finaliza o simulado, calcula nota e contadores atomicamente e retorna o resultado consolidado.
     */
    async finish(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      const paramResult = simulationIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        res.status(400).json({
          error: 'SIMULATION_INVALID_INPUT',
          message: 'Identificador do simulado inválido.',
        });
        return;
      }

      try {
        const result = await simulationService.finishSimulation(
          req.user.id,
          paramResult.data.id
        );
        res.status(200).json({ result });
      } catch (error) {
        handleSimulationControllerError(error, req, res);
      }
    },

    /**
     * POST /api/simulations/:id/abandon
     * Abandona o simulado em andamento, impedindo novas respostas e finalizações.
     */
    async abandon(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      const paramResult = simulationIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        res.status(400).json({
          error: 'SIMULATION_INVALID_INPUT',
          message: 'Identificador do simulado inválido.',
        });
        return;
      }

      try {
        const result = await simulationService.abandonSimulation(
          req.user.id,
          paramResult.data.id
        );
        res.status(200).json({ simulation: result });
      } catch (error) {
        handleSimulationControllerError(error, req, res);
      }
    },

    /**
     * DELETE /api/simulations/:id
     * Exclui o simulado e suas tentativas de forma atômica sob bloqueio serializado.
     */
    async delete(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Autenticação necessária.',
        });
        return;
      }

      const paramResult = simulationIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        res.status(400).json({
          error: 'SIMULATION_INVALID_INPUT',
          message: 'Identificador do simulado inválido.',
        });
        return;
      }

      try {
        await simulationService.deleteSimulation(
          req.user.id,
          paramResult.data.id
        );
        res.status(200).json({
          success: true,
          message: 'Simulado excluído com sucesso.',
        });
      } catch (error) {
        handleSimulationControllerError(error, req, res);
      }
    },
  };
}

/**
 * Converte erros de domínio e exceções não tratadas em respostas HTTP limpas e seguras.
 */
export function handleSimulationControllerError(
  error: unknown,
  req: Request,
  res: Response
): void {
  if (error instanceof SimulationDomainError) {
    res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }

  logger.error('simulation_controller_unexpected_error', {
    method: req.method,
    path: req.originalUrl,
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });

  res.status(503).json({
    error: 'ServiceUnavailable',
    message: 'Não foi possível processar a operação de simulado no momento.',
  });
}
