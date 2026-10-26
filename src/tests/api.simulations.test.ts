import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createSimulation,
  listSimulations,
  getSimulation,
  startSimulation,
  submitSimulationAnswer,
  finishSimulation,
  abandonSimulation,
  deleteSimulation,
  ApiHttpError,
  CSRF_HEADER_NAME,
  CSRF_HEADER_VALUE,
} from '../services/api.ts';
import type {
  CreateSimulationPayload,
  SimulationDetailDTO,
  SimulationResultDTO,
  SimulationSummaryDTO,
  PublicQuestionAttemptDTO,
} from '../types/index.ts';

describe('Cliente HTTP de Simulados (src/services/api.ts) — Sprint 6.6', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const mockSummary: SimulationSummaryDTO = {
    id: 'sim-test-1',
    userId: 'user-auth-1',
    title: 'Simulado PF 2026',
    status: 'CREATED',
    totalQuestions: 2,
    timeLimitSeconds: 3600,
    startedAt: null,
    finishedAt: null,
    durationSeconds: null,
    scorePercentage: null,
    correctCount: null,
    wrongCount: null,
    unansweredCount: null,
    createdAt: '2026-10-23T12:00:00.000Z',
  };

  const mockDetail: SimulationDetailDTO = {
    ...mockSummary,
    timeRemainingSeconds: 3600,
    isExpired: false,
    questions: [
      {
        id: 'sq-1',
        simulationId: 'sim-test-1',
        questionId: 'q-101',
        position: 1,
        statement: 'Questão 1 sobre Redes',
        type: 'MULTIPLE_CHOICE',
        subject: 'Redes de Computadores',
        topic: 'Camada de Transporte',
        subtopic: null,
        board: 'CESPE',
        examTitle: 'PF 2026',
        year: 2026,
        difficulty: 'MEDIUM',
        alternatives: [
          { id: 'alt-1a', letter: 'A', text: 'TCP', position: 1 },
          { id: 'alt-1b', letter: 'B', text: 'UDP', position: 2 },
        ],
        currentAttempt: null,
      },
    ],
  };

  const mockPublicAttempt: PublicQuestionAttemptDTO = {
    id: 'att-1',
    simulationId: 'sim-test-1',
    questionId: 'q-101',
    userId: 'user-auth-1',
    selectedAlternativeId: 'alt-1a',
    selectedLetter: 'A',
    timeSpentSeconds: 45,
    answeredAt: '2026-10-23T12:05:00.000Z',
  };

  const mockResult: SimulationResultDTO = {
    ...mockDetail,
    status: 'COMPLETED',
    scorePercentage: 100,
    correctCount: 1,
    wrongCount: 0,
    unansweredCount: 0,
    durationSeconds: 300,
    questions: [
      {
        ...mockDetail.questions[0],
        answerKeySnapshot: 'A',
        isAnnulledSnapshot: false,
        snapshotSource: 'OFFICIAL_KEY',
        officialAnswerKeyVersion: 1,
        explanation: 'O protocolo TCP é orientado à conexão.',
        isCorrect: true,
      },
    ],
  };

  // Helper para simular respostas do fetch
  function mockFetchJson(status: number, body: unknown, ok = status >= 200 && status < 300) {
    return vi.fn().mockResolvedValue({
      ok,
      status,
      headers: {
        get: (header: string) => (header.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => body,
    } as unknown as Response);
  }

  // ==========================================================================
  // 1. createSimulation
  // ==========================================================================
  describe('createSimulation', () => {
    it('deve enviar POST /api/simulations com payload, CSRF, credentials e retornar SimulationDetailDTO', async () => {
      const fetchMock = mockFetchJson(201, { simulation: mockDetail });
      globalThis.fetch = fetchMock;

      const payload: CreateSimulationPayload = {
        title: 'Simulado PF 2026',
        totalQuestions: 2,
        timeLimitSeconds: 3600,
        criteria: {
          subject: 'Redes de Computadores',
          difficulty: 'MEDIUM',
        },
      };

      const result = await createSimulation(payload);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/simulations');
      expect(options.method).toBe('POST');
      expect(options.credentials).toBe('include');
      expect(options.headers).toEqual({
        'Content-Type': 'application/json',
        Accept: 'application/json',
        [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
      });
      expect(JSON.parse(options.body as string)).toEqual(payload);
      expect(result.id).toBe('sim-test-1');
      expect(result.totalQuestions).toBe(2);
      expect(result.questions).toHaveLength(1);
    });

    it('deve lançar ApiHttpError com código e status quando o backend rejeitar com 422', async () => {
      globalThis.fetch = mockFetchJson(422, {
        error: 'SIMULATION_INSUFFICIENT_QUESTIONS',
        message: 'Quantidade insuficiente de questões elegíveis.',
      });

      await expect(
        createSimulation({ totalQuestions: 50 })
      ).rejects.toThrow(ApiHttpError);

      try {
        await createSimulation({ totalQuestions: 50 });
      } catch (err) {
        expect(err).toBeInstanceOf(ApiHttpError);
        const apiErr = err as ApiHttpError;
        expect(apiErr.status).toBe(422);
        expect(apiErr.code).toBe('SIMULATION_INSUFFICIENT_QUESTIONS');
        expect(apiErr.message).toBe('Quantidade insuficiente de questões elegíveis.');
      }
    });

    it('deve lançar ApiHttpError com INVALID_SIMULATION_CREATE_PAYLOAD se o backend retornar contrato inválido', async () => {
      globalThis.fetch = mockFetchJson(201, { simulation: { invalid: true } });

      await expect(
        createSimulation({ totalQuestions: 10 })
      ).rejects.toThrow('Resposta inesperada do servidor ao criar simulado.');
    });
  });

  // ==========================================================================
  // 2. listSimulations
  // ==========================================================================
  describe('listSimulations', () => {
    it('deve enviar GET /api/simulations sem query params quando nenhum filtro for informado', async () => {
      const fetchMock = mockFetchJson(200, {
        simulations: [mockSummary],
        total: 1,
        limit: 20,
        offset: 0,
      });
      globalThis.fetch = fetchMock;

      const result = await listSimulations();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/simulations');
      expect(options.method).toBe('GET');
      expect(options.credentials).toBe('include');
      expect(options.headers).toEqual({
        Accept: 'application/json',
      });
      expect(result.simulations).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('deve serializar corretamente status, limit, offset e page na query string', async () => {
      const fetchMock = mockFetchJson(200, {
        simulations: [],
        total: 0,
        limit: 10,
        offset: 20,
      });
      globalThis.fetch = fetchMock;

      await listSimulations({
        status: 'IN_PROGRESS',
        limit: 10,
        offset: 20,
        page: 3,
      });

      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('/api/simulations?');
      expect(url).toContain('status=IN_PROGRESS');
      expect(url).toContain('limit=10');
      expect(url).toContain('offset=20');
      expect(url).toContain('page=3');
    });

    it('deve repassar ApiHttpError em falha de autenticação (HTTP 401)', async () => {
      globalThis.fetch = mockFetchJson(401, {
        error: 'Unauthorized',
        message: 'Autenticação necessária.',
      });

      await expect(listSimulations()).rejects.toThrow(ApiHttpError);
    });
  });

  // ==========================================================================
  // 3. getSimulation
  // ==========================================================================
  describe('getSimulation', () => {
    it('deve enviar GET /api/simulations/:id e retornar SimulationDetailDTO', async () => {
      const fetchMock = mockFetchJson(200, { simulation: mockDetail });
      globalThis.fetch = fetchMock;

      const result = await getSimulation('sim-test-1');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/simulations/sim-test-1');
      expect(options.method).toBe('GET');
      expect(options.credentials).toBe('include');
      expect(result.id).toBe('sim-test-1');
      expect(result.status).toBe('CREATED');
    });

    it('deve codificar caracteres especiais no ID com encodeURIComponent', async () => {
      const fetchMock = mockFetchJson(200, { simulation: mockDetail });
      globalThis.fetch = fetchMock;

      await getSimulation('sim/test#1?special');

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/simulations/sim%2Ftest%231%3Fspecial');
    });

    it('deve lançar ApiHttpError com status 404 quando o simulado não for encontrado', async () => {
      globalThis.fetch = mockFetchJson(404, {
        error: 'SIMULATION_NOT_FOUND',
        message: 'Simulado não encontrado.',
      });

      await expect(getSimulation('sim-inexistente')).rejects.toThrow(ApiHttpError);
    });
  });

  // ==========================================================================
  // 4. startSimulation
  // ==========================================================================
  describe('startSimulation', () => {
    it('deve enviar POST /api/simulations/:id/start com CSRF e credentials', async () => {
      const runningDetail = { ...mockDetail, status: 'IN_PROGRESS' as const, startedAt: '2026-10-23T12:01:00.000Z' };
      const fetchMock = mockFetchJson(200, { simulation: runningDetail });
      globalThis.fetch = fetchMock;

      const result = await startSimulation('sim-test-1');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/simulations/sim-test-1/start');
      expect(options.method).toBe('POST');
      expect(options.credentials).toBe('include');
      expect(options.headers).toEqual({
        Accept: 'application/json',
        [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
      });
      expect(result.status).toBe('IN_PROGRESS');
      expect(result.startedAt).toBe('2026-10-23T12:01:00.000Z');
    });

    it('deve lançar ApiHttpError 409 quando o simulado já estiver COMPLETED', async () => {
      globalThis.fetch = mockFetchJson(409, {
        error: 'SIMULATION_ALREADY_COMPLETED',
        message: 'Este simulado já foi finalizado e não pode ser reiniciado.',
      });

      try {
        await startSimulation('sim-test-1');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiHttpError);
        const apiErr = err as ApiHttpError;
        expect(apiErr.status).toBe(409);
        expect(apiErr.code).toBe('SIMULATION_ALREADY_COMPLETED');
      }
    });
  });

  // ==========================================================================
  // 5. submitSimulationAnswer (Anti-Cheating & Blank Answer Support)
  // ==========================================================================
  describe('submitSimulationAnswer', () => {
    it('deve enviar POST /api/simulations/:id/answers com alternativa selecionada e tempo gasto', async () => {
      const fetchMock = mockFetchJson(200, { attempt: mockPublicAttempt });
      globalThis.fetch = fetchMock;

      const result = await submitSimulationAnswer(
        'sim-test-1',
        'q-101',
        'alt-1a',
        45
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/simulations/sim-test-1/answers');
      expect(options.method).toBe('POST');
      expect(options.credentials).toBe('include');
      expect(options.headers).toEqual({
        'Content-Type': 'application/json',
        Accept: 'application/json',
        [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
      });
      expect(JSON.parse(options.body as string)).toEqual({
        questionId: 'q-101',
        selectedAlternativeId: 'alt-1a',
        timeSpentSeconds: 45,
      });

      // Validação do retorno público
      expect(result.id).toBe('att-1');
      expect(result.selectedLetter).toBe('A');
      expect(result.timeSpentSeconds).toBe(45);

      // Garantia Anti-Cheating: campos de gabarito e correção NUNCA devem estar presentes
      expect(result).not.toHaveProperty('isCorrect');
      expect(result).not.toHaveProperty('correctAnswer');
      expect(result).not.toHaveProperty('answerKeySnapshot');
      expect(result).not.toHaveProperty('isAnnulledSnapshot');
      expect(result).not.toHaveProperty('snapshotSource');
      expect(result).not.toHaveProperty('officialAnswerKeyVersion');
      expect(result).not.toHaveProperty('explanation');
    });

    it('deve suportar questão em branco enviando selectedAlternativeId como null explicitamente', async () => {
      const blankAttempt: PublicQuestionAttemptDTO = {
        ...mockPublicAttempt,
        selectedAlternativeId: null,
        selectedLetter: null,
      };
      const fetchMock = mockFetchJson(200, { attempt: blankAttempt });
      globalThis.fetch = fetchMock;

      const result = await submitSimulationAnswer('sim-test-1', 'q-101', null);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, options] = fetchMock.mock.calls[0];
      const parsedBody = JSON.parse(options.body as string);
      expect(parsedBody.selectedAlternativeId).toBeNull();
      expect(parsedBody.questionId).toBe('q-101');

      expect(result.selectedAlternativeId).toBeNull();
      expect(result.selectedLetter).toBeNull();
      expect(result).not.toHaveProperty('isCorrect');
    });

    it('deve lançar ApiHttpError 410 quando o tempo limite do simulado tiver expirado', async () => {
      globalThis.fetch = mockFetchJson(410, {
        error: 'SIMULATION_EXPIRED',
        message: 'O tempo limite do simulado expirou.',
      });

      try {
        await submitSimulationAnswer('sim-test-1', 'q-101', 'alt-1a');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiHttpError);
        const apiErr = err as ApiHttpError;
        expect(apiErr.status).toBe(410);
        expect(apiErr.code).toBe('SIMULATION_EXPIRED');
      }
    });

    it('deve lançar ApiHttpError 400 em caso de alternativa incompatível (ALTERNATIVE_MISMATCH)', async () => {
      globalThis.fetch = mockFetchJson(400, {
        error: 'ALTERNATIVE_MISMATCH',
        message: 'A alternativa selecionada não pertence a esta questão.',
      });

      try {
        await submitSimulationAnswer('sim-test-1', 'q-101', 'alt-invalida');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiHttpError);
        const apiErr = err as ApiHttpError;
        expect(apiErr.status).toBe(400);
        expect(apiErr.code).toBe('ALTERNATIVE_MISMATCH');
      }
    });
  });

  // ==========================================================================
  // 6. finishSimulation
  // ==========================================================================
  describe('finishSimulation', () => {
    it('deve enviar POST /api/simulations/:id/finish com CSRF e retornar SimulationResultDTO com revisão', async () => {
      const fetchMock = mockFetchJson(200, { result: mockResult });
      globalThis.fetch = fetchMock;

      const result = await finishSimulation('sim-test-1');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/simulations/sim-test-1/finish');
      expect(options.method).toBe('POST');
      expect(options.credentials).toBe('include');
      expect(options.headers).toEqual({
        Accept: 'application/json',
        [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.scorePercentage).toBe(100);
      expect(result.correctCount).toBe(1);
      expect(result.wrongCount).toBe(0);
      expect(result.unansweredCount).toBe(0);
      expect(result.durationSeconds).toBe(300);

      // Na finalização legítima, os dados de revisão estão autorizados e presentes
      const q1 = result.questions[0];
      expect(q1.answerKeySnapshot).toBe('A');
      expect(q1.isCorrect).toBe(true);
      expect(q1.explanation).toBe('O protocolo TCP é orientado à conexão.');
    });

    it('deve lançar ApiHttpError 400 se o simulado não estiver em andamento', async () => {
      globalThis.fetch = mockFetchJson(400, {
        error: 'SIMULATION_NOT_IN_PROGRESS',
        message: 'Um simulado abandonado não pode ser finalizado.',
      });

      try {
        await finishSimulation('sim-test-1');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiHttpError);
        const apiErr = err as ApiHttpError;
        expect(apiErr.status).toBe(400);
        expect(apiErr.code).toBe('SIMULATION_NOT_IN_PROGRESS');
      }
    });
  });

  // ==========================================================================
  // 7. abandonSimulation
  // ==========================================================================
  describe('abandonSimulation', () => {
    it('deve enviar POST /api/simulations/:id/abandon com CSRF e retornar SimulationSummaryDTO', async () => {
      const abandonedSummary: SimulationSummaryDTO = {
        ...mockSummary,
        status: 'ABANDONED',
        finishedAt: '2026-10-23T12:10:00.000Z',
      };
      const fetchMock = mockFetchJson(200, { simulation: abandonedSummary });
      globalThis.fetch = fetchMock;

      const result = await abandonSimulation('sim-test-1');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/simulations/sim-test-1/abandon');
      expect(options.method).toBe('POST');
      expect(options.credentials).toBe('include');
      expect(options.headers).toEqual({
        Accept: 'application/json',
        [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
      });
      expect(result.status).toBe('ABANDONED');
    });

    it('deve lançar ApiHttpError 409 quando o simulado já tiver sido concluído', async () => {
      globalThis.fetch = mockFetchJson(409, {
        error: 'SIMULATION_ALREADY_COMPLETED',
        message: 'Este simulado já foi finalizado e não pode ser abandonado.',
      });

      await expect(abandonSimulation('sim-test-1')).rejects.toThrow(ApiHttpError);
    });
  });

  // ==========================================================================
  // 8. deleteSimulation
  // ==========================================================================
  describe('deleteSimulation', () => {
    it('deve enviar DELETE /api/simulations/:id com CSRF e retornar mensagem de confirmação', async () => {
      const fetchMock = mockFetchJson(200, {
        success: true,
        message: 'Simulado excluído com sucesso.',
      });
      globalThis.fetch = fetchMock;

      const result = await deleteSimulation('sim-test-1');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/simulations/sim-test-1');
      expect(options.method).toBe('DELETE');
      expect(options.credentials).toBe('include');
      expect(options.headers).toEqual({
        Accept: 'application/json',
        [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
      });
      expect(result.message).toBe('Simulado excluído com sucesso.');
    });

    it('deve lançar ApiHttpError 404 quando tentar excluir simulado inexistente', async () => {
      globalThis.fetch = mockFetchJson(404, {
        error: 'SIMULATION_NOT_FOUND',
        message: 'Simulado não encontrado.',
      });

      await expect(deleteSimulation('sim-inexistente')).rejects.toThrow(ApiHttpError);
    });
  });
});
