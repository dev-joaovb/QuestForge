import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDashboardSummary, ApiHttpError } from '../services/api.ts';
import type { DashboardSummaryDTO } from '../types/index.ts';

describe('Cliente HTTP do Dashboard (src/services/api.ts) — Sprint 8.2', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const validSummary: DashboardSummaryDTO = {
    completedSimulationsCount: 5,
    totalAnsweredQuestions: 50,
    totalCorrectAnswers: 40,
    totalWrongAnswers: 10,
    accuracyPercentage: 80.0,
    totalDurationSeconds: 7200,
    currentStreak: 4,
    longestStreak: 12,
    lastActivityDate: '2026-10-30',
    recentSimulationsEvolution: [
      {
        id: 'sim-1',
        title: 'Simulado Direito Administrativo',
        scorePercentage: 80.0,
        correctCount: 8,
        wrongCount: 2,
        totalQuestions: 10,
        durationSeconds: 1500,
        finishedAt: '2026-10-28T16:00:00.000Z',
      },
    ],
    recentActivities: [
      {
        id: 'act-1',
        userId: 'user-1',
        type: 'SIMULATION',
        simulationId: 'sim-1',
        questionId: null,
        examId: null,
        durationSeconds: 1500,
        scorePercentage: 80.0,
        correctCount: 8,
        wrongCount: 2,
        unansweredCount: 0,
        completedAt: '2026-10-28T16:00:00.000Z',
        createdAt: '2026-10-28T16:00:00.000Z',
      },
    ],
  };

  const zeroSummary: DashboardSummaryDTO = {
    completedSimulationsCount: 0,
    totalAnsweredQuestions: 0,
    totalCorrectAnswers: 0,
    totalWrongAnswers: 0,
    accuracyPercentage: 0,
    totalDurationSeconds: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastActivityDate: null,
    recentSimulationsEvolution: [],
    recentActivities: [],
  };

  it('1. deve consultar o resumo chamando a URL correta /api/dashboard/summary com método GET', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => validSummary,
    } as Response);

    await getDashboardSummary();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toBe('/api/dashboard/summary');
    expect(init?.method).toBe('GET');
  });

  it('2. deve enviar credentials: "include" e cabeçalho Accept: "application/json"', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => validSummary,
    } as Response);

    await getDashboardSummary();

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(init?.credentials).toBe('include');
    expect((init?.headers as Record<string, string>)?.['Accept']).toBe('application/json');
  });

  it('3. deve retornar com sucesso quando a resposta for válida com dados consolidados', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => validSummary,
    } as Response);

    const result = await getDashboardSummary();

    expect(result).toEqual(validSummary);
    expect(result.completedSimulationsCount).toBe(5);
    expect(result.accuracyPercentage).toBe(80.0);
    expect(result.recentSimulationsEvolution).toHaveLength(1);
  });

  it('4. deve retornar com sucesso quando a resposta for válida com valores zerados (conta sem histórico)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => zeroSummary,
    } as Response);

    const result = await getDashboardSummary();

    expect(result).toEqual(zeroSummary);
    expect(result.completedSimulationsCount).toBe(0);
    expect(result.lastActivityDate).toBeNull();
    expect(result.recentSimulationsEvolution).toEqual([]);
    expect(result.recentActivities).toEqual([]);
  });

  it('5. deve tratar erro HTTP 401 Unauthorized lançando ApiHttpError', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        error: 'Unauthorized',
        message: 'Autenticação necessária.',
      }),
    } as Response);

    try {
      await getDashboardSummary();
      expect.unreachable('Deveria ter lançado ApiHttpError');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiHttpError);
      expect((err as ApiHttpError).status).toBe(401);
      expect((err as ApiHttpError).code).toBe('Unauthorized');
    }
  });

  it('6. deve tratar falhas de rede propagando o erro da requisição', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Falha de conexão com a rede'));

    await expect(getDashboardSummary()).rejects.toThrow('Falha de conexão com a rede');
  });

  it('7. deve rejeitar com INVALID_DASHBOARD_PAYLOAD quando o payload for incompleto', async () => {
    const incompletePayload = {
      completedSimulationsCount: 1,
      // Faltam campos obrigatórios
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => incompletePayload,
    } as Response);

    try {
      await getDashboardSummary();
      expect.unreachable('Deveria ter lançado ApiHttpError');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiHttpError);
      expect((err as ApiHttpError).code).toBe('INVALID_DASHBOARD_PAYLOAD');
    }
  });

  it('8. deve rejeitar com INVALID_DASHBOARD_PAYLOAD quando contiver valores numéricos inválidos', async () => {
    const invalidNumbers = {
      ...validSummary,
      accuracyPercentage: 150, // Maior que 100%
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => invalidNumbers,
    } as Response);

    try {
      await getDashboardSummary();
      expect.unreachable('Deveria ter lançado ApiHttpError');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiHttpError);
      expect((err as ApiHttpError).code).toBe('INVALID_DASHBOARD_PAYLOAD');
    }
  });

  it('9. deve rejeitar com INVALID_DASHBOARD_PAYLOAD quando contiver datas inválidas', async () => {
    // Formato de lastActivityDate inválido (não YYYY-MM-DD)
    const invalidDate = {
      ...validSummary,
      lastActivityDate: '28/10/2026',
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => invalidDate,
    } as Response);

    try {
      await getDashboardSummary();
      expect.unreachable('Deveria ter lançado ApiHttpError');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiHttpError);
      expect((err as ApiHttpError).code).toBe('INVALID_DASHBOARD_PAYLOAD');
    }
  });

  it('10. deve rejeitar com INVALID_DASHBOARD_PAYLOAD quando arrays ou itens forem malformados', async () => {
    const malformedEvolution = {
      ...validSummary,
      recentSimulationsEvolution: 'not-an-array',
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => malformedEvolution,
    } as Response);

    try {
      await getDashboardSummary();
      expect.unreachable('Deveria ter lançado ApiHttpError');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiHttpError);
      expect((err as ApiHttpError).code).toBe('INVALID_DASHBOARD_PAYLOAD');
    }
  });
});
