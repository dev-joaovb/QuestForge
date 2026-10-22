import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { QuestionAttempt, Simulation } from '@prisma/client';
import { createApp } from '../src/app.ts';
import { AuthService } from '../src/services/auth.service.ts';
import { SimulationService } from '../src/services/simulation.service.ts';
import {
  SimulationDomainError,
  type SimulationDetailDTO,
  type SimulationResultDTO,
  type SimulationSummaryDTO,
} from '../src/types/simulation.types.ts';
import { type ValidatedSessionResult } from '../src/types/auth.types.ts';
import { CSRF_HEADER_EXPECTED_VALUE } from '../src/middlewares/csrf.middleware.ts';
import { SESSION_COOKIE_NAME } from '../src/utils/cookies.ts';

describe('Rotas HTTP de Simulados (/api/simulations) — Sprint 6.4', () => {
  const ALLOWED_ORIGIN = 'http://localhost:3000';

  const userOwner = {
    id: 'user-owner-1',
    name: 'Estudante Concurseiro',
    email: 'estudante@questforge.local',
    avatarUrl: null,
    createdAt: new Date('2026-10-20T10:00:00Z'),
    updatedAt: new Date('2026-10-20T10:00:00Z'),
  };

  const otherUser = {
    id: 'user-other-2',
    name: 'Outro Estudante',
    email: 'outro@questforge.local',
    avatarUrl: null,
    createdAt: new Date('2026-10-20T10:00:00Z'),
    updatedAt: new Date('2026-10-20T10:00:00Z'),
  };

  const sampleDate = new Date('2026-10-20T12:00:00Z');
  const simId = 'sim-test-123';
  const qId1 = 'q-101';
  const qId2 = 'q-102';
  const altId1 = 'alt-1a';

  const baseSimulationDTO: SimulationDetailDTO = {
    id: simId,
    userId: userOwner.id,
    title: 'Simulado PF 2026',
    status: 'IN_PROGRESS',
    totalQuestions: 2,
    timeLimitSeconds: 3600,
    startedAt: sampleDate,
    finishedAt: null,
    durationSeconds: null,
    scorePercentage: null,
    correctCount: null,
    wrongCount: null,
    unansweredCount: null,
    createdAt: sampleDate,
    timeRemainingSeconds: 3500,
    isExpired: false,
    questions: [
      {
        id: 'sq-1',
        simulationId: simId,
        questionId: qId1,
        position: 1,
        statement: 'Questão 1 sobre Direito Constitucional',
        type: 'MULTIPLE_CHOICE',
        subject: 'Direito Constitucional',
        topic: 'Direitos Fundamentais',
        subtopic: null,
        board: 'CESPE',
        examTitle: 'PF 2026',
        year: 2026,
        difficulty: 'MEDIUM',
        alternatives: [
          { id: altId1, letter: 'A', text: 'Opção A', position: 1 },
          { id: 'alt-1b', letter: 'B', text: 'Opção B', position: 2 },
        ],
        currentAttempt: null,
      },
      {
        id: 'sq-2',
        simulationId: simId,
        questionId: qId2,
        position: 2,
        statement: 'Questão 2 sobre Língua Portuguesa',
        type: 'MULTIPLE_CHOICE',
        subject: 'Língua Portuguesa',
        topic: 'Sintaxe',
        subtopic: null,
        board: 'FGV',
        examTitle: 'PF 2026',
        year: 2026,
        difficulty: 'EASY',
        alternatives: [
          { id: 'alt-2a', letter: 'A', text: 'Opção A', position: 1 },
          { id: 'alt-2b', letter: 'B', text: 'Opção B', position: 2 },
        ],
        currentAttempt: null,
      },
    ],
  };

  const sampleAttempt: QuestionAttempt = {
    id: 'att-1',
    userId: userOwner.id,
    simulationId: simId,
    questionId: qId1,
    selectedAlternativeId: altId1,
    selectedLetter: 'A',
    isCorrect: true,
    timeSpentSeconds: 45,
    answeredAt: sampleDate,
    createdAt: sampleDate,
    updatedAt: sampleDate,
  };

  const sampleCompletedResultDTO: SimulationResultDTO = {
    ...baseSimulationDTO,
    status: 'COMPLETED',
    finishedAt: new Date('2026-10-20T12:45:00Z'),
    durationSeconds: 2700,
    scorePercentage: 100,
    correctCount: 2,
    wrongCount: 0,
    unansweredCount: 0,
    timeRemainingSeconds: 900,
    isExpired: false,
    questions: [
      {
        ...baseSimulationDTO.questions[0],
        answerKeySnapshot: 'A',
        isAnnulledSnapshot: false,
        snapshotSource: 'OFFICIAL_KEY',
        officialAnswerKeyVersion: 1,
        explanation: 'Comentário da questão 1.',
        isCorrect: true,
      },
      {
        ...baseSimulationDTO.questions[1],
        answerKeySnapshot: 'B',
        isAnnulledSnapshot: false,
        snapshotSource: 'QUESTION_BANK',
        officialAnswerKeyVersion: null,
        explanation: 'Comentário da questão 2.',
        isCorrect: true,
      },
    ],
  };

  const sampleSummaryDTO: SimulationSummaryDTO = {
    id: simId,
    userId: userOwner.id,
    title: 'Simulado PF 2026',
    status: 'ABANDONED',
    totalQuestions: 2,
    timeLimitSeconds: 3600,
    startedAt: sampleDate,
    finishedAt: new Date(),
    durationSeconds: null,
    scorePercentage: null,
    correctCount: null,
    wrongCount: null,
    unansweredCount: null,
    createdAt: sampleDate,
  };

  let mockAuthService: AuthService;
  let mockSimulationService: SimulationService;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    mockAuthService = {
      validateSession: vi.fn().mockImplementation(async (token: string): Promise<ValidatedSessionResult> => {
        if (token === 'valid-token-owner') {
          return {
            user: userOwner,
            session: {
              id: 'session-1',
              userId: userOwner.id,
              expiresAt: new Date(Date.now() + 3600000),
              createdAt: new Date(),
              lastUsedAt: new Date(),
            },
          };
        }
        if (token === 'valid-token-other') {
          return {
            user: otherUser,
            session: {
              id: 'session-2',
              userId: otherUser.id,
              expiresAt: new Date(Date.now() + 3600000),
              createdAt: new Date(),
              lastUsedAt: new Date(),
            },
          };
        }
        throw new Error('Invalid token');
      }),
    } as unknown as AuthService;

    mockSimulationService = {
      createSimulation: vi.fn(),
      listUserSimulations: vi.fn(),
      getSimulation: vi.fn(),
      startSimulation: vi.fn(),
      submitAnswer: vi.fn(),
      finishSimulation: vi.fn(),
      abandonSimulation: vi.fn(),
      deleteSimulation: vi.fn(),
    } as unknown as SimulationService;

    app = createApp({
      auth: { authService: mockAuthService },
      simulations: {
        authService: mockAuthService,
        simulationService: mockSimulationService,
      },
      csrf: {
        allowedOrigins: [ALLOWED_ORIGIN],
      },
    });
  });

  // Helper para requisições autenticadas do proprietário com CSRF
  function authRequest(
    method: 'get' | 'post' | 'put' | 'delete',
    url: string,
    token = 'valid-token-owner'
  ) {
    const req = request(app)[method](url).set('Cookie', [`${SESSION_COOKIE_NAME}=${token}`]);
    if (['post', 'put', 'patch', 'delete'].includes(method)) {
      req.set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE);
      req.set('Origin', ALLOWED_ORIGIN);
    }
    return req;
  }

  // ==========================================================================
  // 1. Autenticação Obrigatória (Fail-Closed)
  // ==========================================================================
  describe('Autenticação e Proteção CSRF', () => {
    it('deve rejeitar POST /api/simulations sem autenticação com 401', async () => {
      const res = await request(app)
        .post('/api/simulations')
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .set('Origin', ALLOWED_ORIGIN)
        .send({ totalQuestions: 10 });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
      expect(mockSimulationService.createSimulation).not.toHaveBeenCalled();
    });

    it('deve rejeitar GET /api/simulations sem autenticação com 401', async () => {
      const res = await request(app).get('/api/simulations');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('deve rejeitar operações mutáveis sem cabeçalho CSRF com 403', async () => {
      const res = await request(app)
        .post('/api/simulations')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`])
        .set('Origin', ALLOWED_ORIGIN)
        .send({ totalQuestions: 10 });

      expect(res.status).toBe(403);
      expect(mockSimulationService.createSimulation).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 2. Criação de Simulados (POST /api/simulations)
  // ==========================================================================
  describe('POST /api/simulations', () => {
    it('deve criar um simulado com sucesso e retornar HTTP 201', async () => {
      vi.mocked(mockSimulationService.createSimulation).mockResolvedValue(baseSimulationDTO);

      const res = await authRequest('post', '/api/simulations').send({
        title: 'Simulado PF 2026',
        totalQuestions: 2,
        timeLimitSeconds: 3600,
        criteria: { subject: 'Direito Constitucional' },
      });

      expect(res.status).toBe(201);
      expect(res.body.simulation.id).toBe(simId);
      expect(res.body.simulation.totalQuestions).toBe(2);
      expect(mockSimulationService.createSimulation).toHaveBeenCalledWith(
        userOwner.id,
        expect.objectContaining({
          title: 'Simulado PF 2026',
          totalQuestions: 2,
          timeLimitSeconds: 3600,
          criteria: { subject: 'Direito Constitucional' },
        })
      );
    });

    it('deve derivar userId exclusivamente da sessão e descartar qualquer userId injetado pelo cliente', async () => {
      vi.mocked(mockSimulationService.createSimulation).mockResolvedValue(baseSimulationDTO);

      const res = await authRequest('post', '/api/simulations').send({
        title: 'Invasão Tentada',
        totalQuestions: 2,
        userId: 'hacker-user-id', // Campo não permitido pelo schema .strict()
      });

      // O schema .strict() rejeita imediatamente campos não autorizados
      expect(res.status).toBe(400);
      expect(mockSimulationService.createSimulation).not.toHaveBeenCalled();
    });

    it('deve rejeitar criação quando totalQuestions for menor que 1 ou ausente com 400', async () => {
      const res = await authRequest('post', '/api/simulations').send({
        totalQuestions: 0,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('SIMULATION_INVALID_INPUT');
      expect(mockSimulationService.createSimulation).not.toHaveBeenCalled();
    });

    it('deve rejeitar tempo limite menor que 30 segundos com 400', async () => {
      const res = await authRequest('post', '/api/simulations').send({
        totalQuestions: 5,
        timeLimitSeconds: 15,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('SIMULATION_INVALID_INPUT');
      expect(mockSimulationService.createSimulation).not.toHaveBeenCalled();
    });

    it('deve mapear erro de questões insuficientes do domínio para HTTP 422', async () => {
      vi.mocked(mockSimulationService.createSimulation).mockRejectedValue(
        new SimulationDomainError(
          'SIMULATION_INSUFFICIENT_QUESTIONS',
          'Banco de questões insuficiente.',
          422
        )
      );

      const res = await authRequest('post', '/api/simulations').send({
        totalQuestions: 50,
      });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('SIMULATION_INSUFFICIENT_QUESTIONS');
      expect(res.body.message).toBe('Banco de questões insuficiente.');
    });
  });

  // ==========================================================================
  // 3. Listagem de Simulados (GET /api/simulations)
  // ==========================================================================
  describe('GET /api/simulations', () => {
    it('deve listar simulados do usuário autenticado com paginação padrão', async () => {
      const mockResult = {
        items: [sampleSummaryDTO as unknown as Simulation],
        total: 1,
        limit: 10,
        offset: 0,
      };
      vi.mocked(mockSimulationService.listUserSimulations).mockResolvedValue(mockResult);

      const res = await authRequest('get', '/api/simulations?limit=10&page=1');

      expect(res.status).toBe(200);
      expect(res.body.simulations).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.limit).toBe(10);
      expect(res.body.offset).toBe(0);
      expect(mockSimulationService.listUserSimulations).toHaveBeenCalledWith(
        userOwner.id,
        expect.objectContaining({ limit: 10, offset: 0 })
      );
    });

    it('deve filtrar listagem por status válido', async () => {
      vi.mocked(mockSimulationService.listUserSimulations).mockResolvedValue({
        items: [],
        total: 0,
        limit: 20,
        offset: 0,
      });

      const res = await authRequest('get', '/api/simulations?status=COMPLETED');

      expect(res.status).toBe(200);
      expect(mockSimulationService.listUserSimulations).toHaveBeenCalledWith(
        userOwner.id,
        expect.objectContaining({ status: 'COMPLETED' })
      );
    });

    it('deve rejeitar status inválido com HTTP 400', async () => {
      const res = await authRequest('get', '/api/simulations?status=STATUS_INVENTADO');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('SIMULATION_INVALID_INPUT');
    });
  });

  // ==========================================================================
  // 4. Detalhes do Simulado e Proteção de Gabarito (GET /api/simulations/:id)
  // ==========================================================================
  describe('GET /api/simulations/:id', () => {
    it('deve retornar os detalhes do simulado omitindo gabarito e respostas quando em andamento', async () => {
      vi.mocked(mockSimulationService.getSimulation).mockResolvedValue(baseSimulationDTO);

      const res = await authRequest('get', `/api/simulations/${simId}`);

      expect(res.status).toBe(200);
      expect(res.body.simulation.id).toBe(simId);
      expect(res.body.simulation.status).toBe('IN_PROGRESS');
      // Garantia de proteção: questões NÃO expõem answerKeySnapshot nem isCorrect
      const q1 = res.body.simulation.questions[0];
      expect(q1.statement).toBe('Questão 1 sobre Direito Constitucional');
      expect(q1.answerKeySnapshot).toBeUndefined();
      expect(q1.isCorrect).toBeUndefined();
      expect(q1.explanation).toBeUndefined();
    });

    it('deve retornar HTTP 404 quando o simulado pertencer a outro usuário ou não existir', async () => {
      vi.mocked(mockSimulationService.getSimulation).mockRejectedValue(
        new SimulationDomainError('SIMULATION_NOT_FOUND', 'Simulado não encontrado.', 404)
      );

      const res = await authRequest('get', '/api/simulations/sim-inexistente');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('SIMULATION_NOT_FOUND');
    });
  });

  // ==========================================================================
  // 5. Início do Simulado (POST /api/simulations/:id/start)
  // ==========================================================================
  describe('POST /api/simulations/:id/start', () => {
    it('deve iniciar o simulado com sucesso e retornar HTTP 200', async () => {
      vi.mocked(mockSimulationService.startSimulation).mockResolvedValue({
        ...baseSimulationDTO,
        status: 'IN_PROGRESS',
      });

      const res = await authRequest('post', `/api/simulations/${simId}/start`).send({});

      expect(res.status).toBe(200);
      expect(res.body.simulation.status).toBe('IN_PROGRESS');
      expect(mockSimulationService.startSimulation).toHaveBeenCalledWith(
        userOwner.id,
        simId
      );
    });

    it('deve rejeitar início de simulado já finalizado com HTTP 409', async () => {
      vi.mocked(mockSimulationService.startSimulation).mockRejectedValue(
        new SimulationDomainError(
          'SIMULATION_ALREADY_COMPLETED',
          'Este simulado já foi finalizado e não pode ser reiniciado.',
          409
        )
      );

      const res = await authRequest('post', `/api/simulations/${simId}/start`).send({});

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('SIMULATION_ALREADY_COMPLETED');
    });
  });

  // ==========================================================================
  // 6. Submissão de Respostas (POST /api/simulations/:id/answers)
  // ==========================================================================
  describe('Submissão de Respostas (POST / PUT /api/simulations/:id/answers)', () => {
    it('deve submeter resposta com sucesso, retornar HTTP 200 e omitir terminantemente isCorrect e gabarito (Anti-Cheating)', async () => {
      // O mock do serviço calcula e persiste isCorrect = true internamente
      expect(sampleAttempt.isCorrect).toBe(true);
      vi.mocked(mockSimulationService.submitAnswer).mockResolvedValue(sampleAttempt);

      const res = await authRequest('post', `/api/simulations/${simId}/answers`).send({
        questionId: qId1,
        selectedAlternativeId: altId1,
        timeSpentSeconds: 45,
      });

      expect(res.status).toBe(200);

      // 1. Campos públicos esperados DEVEM estar presentes
      expect(res.body.attempt.id).toBe('att-1');
      expect(res.body.attempt.simulationId).toBe(simId);
      expect(res.body.attempt.questionId).toBe(qId1);
      expect(res.body.attempt.userId).toBe(userOwner.id);
      expect(res.body.attempt.selectedAlternativeId).toBe(altId1);
      expect(res.body.attempt.selectedLetter).toBe('A');
      expect(res.body.attempt.timeSpentSeconds).toBe(45);
      expect(res.body.attempt.answeredAt).toBeDefined();

      // 2. Proteção Anti-Cheating: isCorrect e campos de gabarito NUNCA devem existir no payload HTTP
      expect(res.body.attempt).not.toHaveProperty('isCorrect');
      expect(res.body.attempt.isCorrect).toBeUndefined();
      expect(res.body.attempt).not.toHaveProperty('correctAnswer');
      expect(res.body.attempt).not.toHaveProperty('answerKeySnapshot');
      expect(res.body.attempt).not.toHaveProperty('isAnnulledSnapshot');
      expect(res.body.attempt).not.toHaveProperty('snapshotSource');
      expect(res.body.attempt).not.toHaveProperty('officialAnswerKeyVersion');
      expect(res.body.attempt).not.toHaveProperty('explanation');

      // 3. O serviço de domínio continua recebendo os parâmetros integrais
      expect(mockSimulationService.submitAnswer).toHaveBeenCalledWith(
        userOwner.id,
        expect.objectContaining({
          simulationId: simId,
          questionId: qId1,
          selectedAlternativeId: altId1,
          timeSpentSeconds: 45,
        })
      );
    });

    it('deve suportar rota PUT /api/simulations/:id/answers com a mesma sanitização anti-cheating', async () => {
      vi.mocked(mockSimulationService.submitAnswer).mockResolvedValue(sampleAttempt);

      const res = await authRequest('put', `/api/simulations/${simId}/answers`).send({
        questionId: qId1,
        selectedAlternativeId: altId1,
        timeSpentSeconds: 50,
      });

      expect(res.status).toBe(200);
      expect(res.body.attempt.id).toBe('att-1');
      expect(res.body.attempt.selectedLetter).toBe('A');

      // Verificação explícita de ausência de gabarito
      expect(res.body.attempt).not.toHaveProperty('isCorrect');
      expect(res.body.attempt.isCorrect).toBeUndefined();
      expect(res.body.attempt).not.toHaveProperty('correctAnswer');
      expect(res.body.attempt).not.toHaveProperty('answerKeySnapshot');
      expect(res.body.attempt).not.toHaveProperty('explanation');
    });

    it('deve suportar rota REST parametrizada POST /api/simulations/:id/questions/:questionId/answers com sanitização', async () => {
      vi.mocked(mockSimulationService.submitAnswer).mockResolvedValue(sampleAttempt);

      const res = await authRequest(
        'post',
        `/api/simulations/${simId}/questions/${qId1}/answers`
      ).send({
        selectedAlternativeId: altId1,
        timeSpentSeconds: 30,
      });

      expect(res.status).toBe(200);
      expect(res.body.attempt.id).toBe('att-1');
      expect(res.body.attempt).not.toHaveProperty('isCorrect');
      expect(res.body.attempt.isCorrect).toBeUndefined();
      expect(mockSimulationService.submitAnswer).toHaveBeenCalledWith(
        userOwner.id,
        expect.objectContaining({
          simulationId: simId,
          questionId: qId1,
          selectedAlternativeId: altId1,
        })
      );
    });

    it('deve suportar rota REST parametrizada PUT /api/simulations/:id/questions/:questionId/answers com sanitização', async () => {
      vi.mocked(mockSimulationService.submitAnswer).mockResolvedValue(sampleAttempt);

      const res = await authRequest(
        'put',
        `/api/simulations/${simId}/questions/${qId1}/answers`
      ).send({
        selectedAlternativeId: altId1,
        timeSpentSeconds: 35,
      });

      expect(res.status).toBe(200);
      expect(res.body.attempt.id).toBe('att-1');
      expect(res.body.attempt).not.toHaveProperty('isCorrect');
      expect(res.body.attempt.isCorrect).toBeUndefined();
      expect(mockSimulationService.submitAnswer).toHaveBeenCalledWith(
        userOwner.id,
        expect.objectContaining({
          simulationId: simId,
          questionId: qId1,
          selectedAlternativeId: altId1,
        })
      );
    });

    it('deve rejeitar submissão que tente manipular campos autoritativos (isCorrect, userId) com HTTP 400', async () => {
      const res = await authRequest('post', `/api/simulations/${simId}/answers`).send({
        questionId: qId1,
        selectedAlternativeId: altId1,
        isCorrect: true, // Hacker tentando forçar acerto
        userId: 'hacker',
      });

      expect(res.status).toBe(400);
      expect(mockSimulationService.submitAnswer).not.toHaveBeenCalled();
    });

    it('deve permitir enviar selectedAlternativeId como null (questão em branco)', async () => {
      vi.mocked(mockSimulationService.submitAnswer).mockResolvedValue({
        ...sampleAttempt,
        selectedAlternativeId: null,
        selectedLetter: null,
        isCorrect: null,
      });

      const res = await authRequest('post', `/api/simulations/${simId}/answers`).send({
        questionId: qId1,
        selectedAlternativeId: null,
      });

      expect(res.status).toBe(200);
      expect(res.body.attempt.selectedAlternativeId).toBeNull();
      expect(res.body.attempt.selectedLetter).toBeNull();
      expect(res.body.attempt).not.toHaveProperty('isCorrect');
      expect(res.body.attempt.isCorrect).toBeUndefined();
      expect(mockSimulationService.submitAnswer).toHaveBeenCalledWith(
        userOwner.id,
        expect.objectContaining({
          selectedAlternativeId: null,
        })
      );
    });

    it('deve retornar HTTP 409 quando o simulado já estiver COMPLETED', async () => {
      vi.mocked(mockSimulationService.submitAnswer).mockRejectedValue(
        new SimulationDomainError(
          'SIMULATION_ALREADY_COMPLETED',
          'Este simulado já foi finalizado e não aceita novas respostas.',
          409
        )
      );

      const res = await authRequest('post', `/api/simulations/${simId}/answers`).send({
        questionId: qId1,
        selectedAlternativeId: altId1,
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('SIMULATION_ALREADY_COMPLETED');
    });

    it('deve retornar HTTP 410 quando o tempo limite do simulado estiver EXPIRED', async () => {
      vi.mocked(mockSimulationService.submitAnswer).mockRejectedValue(
        new SimulationDomainError('SIMULATION_EXPIRED', 'O tempo limite do simulado expirou.', 410)
      );

      const res = await authRequest('post', `/api/simulations/${simId}/answers`).send({
        questionId: qId1,
        selectedAlternativeId: altId1,
      });

      expect(res.status).toBe(410);
      expect(res.body.error).toBe('SIMULATION_EXPIRED');
    });

    it('deve retornar HTTP 400 quando a alternativa não pertencer à questão (ALTERNATIVE_MISMATCH)', async () => {
      vi.mocked(mockSimulationService.submitAnswer).mockRejectedValue(
        new SimulationDomainError(
          'ALTERNATIVE_MISMATCH',
          'A alternativa selecionada não pertence a esta questão ou não existe.',
          400
        )
      );

      const res = await authRequest('post', `/api/simulations/${simId}/answers`).send({
        questionId: qId1,
        selectedAlternativeId: 'alt-de-outra-questao',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ALTERNATIVE_MISMATCH');
    });
  });

  // ==========================================================================
  // 7. Finalização do Simulado (POST /api/simulations/:id/finish)
  // ==========================================================================
  describe('POST /api/simulations/:id/finish', () => {
    it('deve finalizar o simulado, retornar nota, contadores consolidados e gabarito completo com 200', async () => {
      vi.mocked(mockSimulationService.finishSimulation).mockResolvedValue(
        sampleCompletedResultDTO
      );

      const res = await authRequest('post', `/api/simulations/${simId}/finish`).send({});

      expect(res.status).toBe(200);
      expect(res.body.result.status).toBe('COMPLETED');
      expect(res.body.result.scorePercentage).toBe(100);
      expect(res.body.result.correctCount).toBe(2);
      expect(res.body.result.wrongCount).toBe(0);
      expect(res.body.result.unansweredCount).toBe(0);
      // Na finalização, o gabarito oficial e correção são exibidos com sucesso (revisão pós-prova)
      expect(res.body.result.questions[0].answerKeySnapshot).toBe('A');
      expect(res.body.result.questions[0].isCorrect).toBe(true);
      expect(res.body.result.questions[0].explanation).toBe('Comentário da questão 1.');
      expect(res.body.result.questions[0].snapshotSource).toBe('OFFICIAL_KEY');
      expect(res.body.result.questions[0].officialAnswerKeyVersion).toBe(1);
      expect(mockSimulationService.finishSimulation).toHaveBeenCalledWith(
        userOwner.id,
        simId
      );
    });

    it('deve rejeitar finalização de simulado abandonado com HTTP 400', async () => {
      vi.mocked(mockSimulationService.finishSimulation).mockRejectedValue(
        new SimulationDomainError(
          'SIMULATION_NOT_IN_PROGRESS',
          'Um simulado abandonado não pode ser finalizado.',
          400
        )
      );

      const res = await authRequest('post', `/api/simulations/${simId}/finish`).send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('SIMULATION_NOT_IN_PROGRESS');
    });
  });

  // ==========================================================================
  // 8. Abandono do Simulado (POST /api/simulations/:id/abandon)
  // ==========================================================================
  describe('POST /api/simulations/:id/abandon', () => {
    it('deve abandonar o simulado em andamento com sucesso e retornar HTTP 200', async () => {
      vi.mocked(mockSimulationService.abandonSimulation).mockResolvedValue(sampleSummaryDTO);

      const res = await authRequest('post', `/api/simulations/${simId}/abandon`).send({});

      expect(res.status).toBe(200);
      expect(res.body.simulation.status).toBe('ABANDONED');
      expect(mockSimulationService.abandonSimulation).toHaveBeenCalledWith(
        userOwner.id,
        simId
      );
    });

    it('deve rejeitar abandono de simulado já finalizado com HTTP 409', async () => {
      vi.mocked(mockSimulationService.abandonSimulation).mockRejectedValue(
        new SimulationDomainError(
          'SIMULATION_ALREADY_COMPLETED',
          'Este simulado já foi finalizado e não pode ser abandonado.',
          409
        )
      );

      const res = await authRequest('post', `/api/simulations/${simId}/abandon`).send({});

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('SIMULATION_ALREADY_COMPLETED');
    });
  });

  // ==========================================================================
  // 9. Exclusão Atômica do Simulado (DELETE /api/simulations/:id)
  // ==========================================================================
  describe('DELETE /api/simulations/:id', () => {
    it('deve excluir o simulado com sucesso e retornar HTTP 200', async () => {
      vi.mocked(mockSimulationService.deleteSimulation).mockResolvedValue(true);

      const res = await authRequest('delete', `/api/simulations/${simId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Simulado excluído com sucesso.');
      expect(mockSimulationService.deleteSimulation).toHaveBeenCalledWith(
        userOwner.id,
        simId
      );
    });

    it('deve retornar HTTP 404 ao tentar excluir simulado de outro usuário', async () => {
      vi.mocked(mockSimulationService.deleteSimulation).mockRejectedValue(
        new SimulationDomainError('SIMULATION_NOT_FOUND', 'Simulado não encontrado.', 404)
      );

      const res = await authRequest(
        'delete',
        `/api/simulations/${simId}`,
        'valid-token-other'
      );

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('SIMULATION_NOT_FOUND');
    });

    it('deve retornar HTTP 503 quando ocorrer erro inesperado no banco', async () => {
      vi.mocked(mockSimulationService.deleteSimulation).mockRejectedValue(
        new Error('Disk failure on database')
      );

      const res = await authRequest('delete', `/api/simulations/${simId}`);

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('ServiceUnavailable');
    });
  });
});
