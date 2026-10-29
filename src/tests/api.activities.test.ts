import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getUserStreak,
  listStudyActivities,
  ApiHttpError,
} from '../services/api.ts';
import type {
  UserStreakDTO,
  PaginatedStudyActivitiesResponse,
  StudyActivityDTO,
} from '../types/index.ts';

describe('Cliente HTTP de Atividades e Streak (src/services/api.ts) — Sprint 7.2', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const mockStreak: UserStreakDTO = {
    id: 'streak-user-1',
    userId: 'user-1',
    currentStreak: 7,
    longestStreak: 14,
    lastActivityDate: '2026-10-29',
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-29T10:00:00.000Z',
  };

  const mockActivity: StudyActivityDTO = {
    id: 'act-1',
    userId: 'user-1',
    type: 'SIMULATION',
    simulationId: 'sim-1',
    questionId: null,
    examId: null,
    durationSeconds: 1800,
    scorePercentage: 85,
    correctCount: 17,
    wrongCount: 3,
    unansweredCount: 0,
    completedAt: '2026-10-29T14:00:00.000Z',
    createdAt: '2026-10-29T14:00:00.000Z',
  };

  describe('getUserStreak()', () => {
    it('1. deve consultar streak com GET /api/activities/streak e credentials include', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ streak: mockStreak }),
      } as Response);

      const result = await getUserStreak();

      expect(result).toEqual(mockStreak);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(url).toBe('/api/activities/streak');
      expect(init?.method).toBe('GET');
      expect(init?.credentials).toBe('include');
      expect((init?.headers as Record<string, string>)?.['Accept']).toBe('application/json');
    });

    it('2. deve tratar resposta de erro HTTP (ex: 401) lançando ApiHttpError', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Unauthorized', message: 'Autenticação necessária.' }),
      } as Response);

      await expect(getUserStreak()).rejects.toThrow(ApiHttpError);
    });

    it('3. deve rejeitar com INVALID_STREAK_PAYLOAD se a resposta for estruturalmente inválida', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ streak: 'invalid-string-payload' }),
      } as Response);

      try {
        await getUserStreak();
        expect.unreachable('Deveria ter lançado ApiHttpError');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiHttpError);
        expect((err as ApiHttpError).code).toBe('INVALID_STREAK_PAYLOAD');
      }
    });
  });

  describe('listStudyActivities()', () => {
    it('4. deve listar atividades com parâmetros padrões quando nenhum argumento for informado', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          activities: [mockActivity],
          total: 1,
          limit: 20,
          offset: 0,
        }),
      } as Response);

      const result = await listStudyActivities();

      expect(result.activities).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);

      const [url] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(url).toBe('/api/activities');
    });

    it('5. deve serializar corretamente os parâmetros de consulta na URL', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          activities: [mockActivity],
          total: 1,
          limit: 10,
          offset: 5,
        }),
      } as Response);

      await listStudyActivities({
        limit: 10,
        offset: 5,
        type: 'SIMULATION',
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-10-31T23:59:59.000Z',
      });

      const [url] = vi.mocked(globalThis.fetch).mock.calls[0];
      const parsedUrl = new URL(url as string, 'http://localhost');

      expect(parsedUrl.pathname).toBe('/api/activities');
      expect(parsedUrl.searchParams.get('limit')).toBe('10');
      expect(parsedUrl.searchParams.get('offset')).toBe('5');
      expect(parsedUrl.searchParams.get('type')).toBe('SIMULATION');
      expect(parsedUrl.searchParams.get('startDate')).toBe('2026-10-01T00:00:00.000Z');
      expect(parsedUrl.searchParams.get('endDate')).toBe('2026-10-31T23:59:59.000Z');
    });

    it('6. deve tratar erro 400 para parâmetros inválidos lançando ApiHttpError', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          error: 'ACTIVITY_INVALID_INPUT',
          message: 'A data inicial (startDate) não pode ser posterior à data final (endDate).',
        }),
      } as Response);

      await expect(
        listStudyActivities({
          startDate: '2026-10-31T00:00:00Z',
          endDate: '2026-10-01T00:00:00Z',
        })
      ).rejects.toThrow(ApiHttpError);
    });

    it('7. deve rejeitar com INVALID_ACTIVITIES_LIST_PAYLOAD se a resposta for estruturalmente inválida', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ activities: 'not-an-array' }),
      } as Response);

      try {
        await listStudyActivities();
        expect.unreachable('Deveria ter lançado ApiHttpError');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiHttpError);
        expect((err as ApiHttpError).code).toBe('INVALID_ACTIVITIES_LIST_PAYLOAD');
      }
    });
  });
});
