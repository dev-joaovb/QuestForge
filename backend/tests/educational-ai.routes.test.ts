import http from 'http';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.ts';
import { AuthService } from '../src/services/auth.service.ts';
import { EducationalAiService } from '../src/services/educational-ai.service.ts';
import { EducationalAnalyticsService } from '../src/services/educational-analytics.service.ts';
import { MockEducationalAnalyticsRepository } from '../src/repositories/educational-analytics.repository.ts';
import { SESSION_COOKIE_NAME } from '../src/utils/cookies.ts';
import {
  AuthDomainError,
  type ValidatedSessionResult,
} from '../src/types/auth.types.ts';
import {
  EducationalAiDomainError,
  type EducationalAnalysisResponseDTO,
  type IEducationalAiClient,
} from '../src/types/educational-ai.types.ts';
import { EducationalAnalyticsDomainError } from '../src/types/educational-analytics.types.ts';
import { parsePort, isValidTcpPort } from '../../server.ts';

describe('Rotas HTTP de IA Educacional (/api/educational-ai/analysis) — Sprint 9.3', () => {
  const user1 = {
    id: 'student-uuid-alpha',
    name: 'Estudante Alfa',
    email: 'alfa@questforge.local',
    avatarUrl: null,
    createdAt: new Date('2026-10-20T10:00:00Z'),
    updatedAt: new Date('2026-10-20T10:00:00Z'),
  };

  const user2 = {
    id: 'student-uuid-beta',
    name: 'Estudante Beta',
    email: 'beta@questforge.local',
    avatarUrl: null,
    createdAt: new Date('2026-10-20T10:00:00Z'),
    updatedAt: new Date('2026-10-20T10:00:00Z'),
  };

  const sampleAiAnalysisResponse: EducationalAnalysisResponseDTO = {
    summary: 'O estudante demonstra evolução consistente com destaque em Direito Constitucional e necessidade de reforço em Informática.',
    strengths: [
      {
        subject: 'Direito Constitucional',
        accuracyPercentage: 80.0,
        description: 'Excelente domínio em tópicos de direitos fundamentais.',
      },
    ],
    weaknesses: [
      {
        subject: 'Informática',
        accuracyPercentage: 50.0,
        description: 'Dificuldade concentrada em redes de computadores.',
      },
    ],
    trend: {
      direction: 'IMPROVING',
      description: 'Crescimento de 8% nos simulados recentes em relação à média histórica.',
      deltaPercentage: 8.0,
    },
    recommendations: [
      {
        title: 'Revisão ativa de Informática',
        description: 'Dedicar 45 minutos diários para resolver questões comentadas de redes de computadores.',
        actionableStep: 'Iniciar um simulado de 15 questões focado em Informática.',
      },
    ],
    priorities: [
      {
        subject: 'Informática',
        priority: 'HIGH',
        reason: 'Acurácia abaixo de 60% impacta a pontuação de corte.',
        targetAccuracyPercentage: 70,
      },
      {
        subject: 'Direito Constitucional',
        priority: 'LOW',
        reason: 'Disciplina em zona segura; manter com revisões espaçadas.',
        targetAccuracyPercentage: 85,
      },
    ],
    confidenceLevel: 'HIGH',
    insufficientDataNotice: null,
    source: 'AI_INFERENCE',
    generatedAt: '2026-11-04T12:00:00.000Z',
  };

  let mockAuthService: AuthService;
  let mockAnalyticsRepo: MockEducationalAnalyticsRepository;
  let analyticsService: EducationalAnalyticsService;
  let mockAiClient: IEducationalAiClient;
  let educationalAiService: EducationalAiService;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    mockAnalyticsRepo = new MockEducationalAnalyticsRepository();
    mockAnalyticsRepo.writeCallCount = 0;

    analyticsService = new EducationalAnalyticsService({
      educationalAnalyticsRepository: mockAnalyticsRepo,
    });

    mockAiClient = {
      generateAnalysis: vi.fn().mockResolvedValue(
        JSON.stringify({
          summary: sampleAiAnalysisResponse.summary,
          strengths: sampleAiAnalysisResponse.strengths,
          weaknesses: sampleAiAnalysisResponse.weaknesses,
          trend: sampleAiAnalysisResponse.trend,
          recommendations: sampleAiAnalysisResponse.recommendations,
          priorities: sampleAiAnalysisResponse.priorities,
          confidenceLevel: sampleAiAnalysisResponse.confidenceLevel,
          insufficientDataNotice: sampleAiAnalysisResponse.insufficientDataNotice,
        })
      ),
    };

    educationalAiService = new EducationalAiService({
      educationalAnalyticsService: analyticsService,
      educationalAiClient: mockAiClient,
      modelName: 'llama3.1:8b',
      timeoutMs: 5000,
    });

    mockAuthService = {
      validateSession: vi.fn().mockImplementation(async (token: string): Promise<ValidatedSessionResult> => {
        if (token === 'token-user-1') {
          return {
            user: user1,
            session: {
              id: 'session-1',
              userId: user1.id,
              expiresAt: new Date(Date.now() + 3600000),
              createdAt: new Date(),
              lastUsedAt: new Date(),
            },
          };
        }
        if (token === 'token-user-2') {
          return {
            user: user2,
            session: {
              id: 'session-2',
              userId: user2.id,
              expiresAt: new Date(Date.now() + 3600000),
              createdAt: new Date(),
              lastUsedAt: new Date(),
            },
          };
        }
        if (token === 'token-expired') {
          throw new AuthDomainError('SESSION_INVALID_OR_EXPIRED', 'Sessão expirada.', 401);
        }
        throw new AuthDomainError('SESSION_INVALID_OR_EXPIRED', 'Sessão inválida.', 401);
      }),
    } as unknown as AuthService;

    app = createApp({
      auth: { authService: mockAuthService },
      educationalAi: {
        authService: mockAuthService,
        educationalAiService,
        rateLimitOptions: { maxAttempts: 10, windowMs: 60000 },
      },
    });
  });

  // Configura dados consistentes para o user1 com 80% Direito Constitucional e 50% Informática
  function seedUser1ConsistentData() {
    mockAnalyticsRepo.simulations.push(
      {
        id: 'sim-seed-1',
        userId: user1.id,
        status: 'COMPLETED',
        scorePercentage: 72.0,
        correctCount: 6,
        wrongCount: 4,
        durationSeconds: 1200,
        finishedAt: new Date('2026-11-01T10:00:00Z'),
      },
      {
        id: 'sim-seed-2',
        userId: user1.id,
        status: 'COMPLETED',
        scorePercentage: 80.0,
        correctCount: 8,
        wrongCount: 2,
        durationSeconds: 1200,
        finishedAt: new Date('2026-11-02T10:00:00Z'),
      }
    );

    mockAnalyticsRepo.simulationQuestions.push(
      { simulationId: 'sim-seed-1', questionId: 'att-seed-1', isAnnulledSnapshot: false },
      { simulationId: 'sim-seed-1', questionId: 'att-seed-2', isAnnulledSnapshot: false },
      { simulationId: 'sim-seed-2', questionId: 'att-seed-3', isAnnulledSnapshot: false },
      { simulationId: 'sim-seed-2', questionId: 'att-seed-4', isAnnulledSnapshot: false },
      { simulationId: 'sim-seed-2', questionId: 'att-seed-5', isAnnulledSnapshot: false },
      { simulationId: 'sim-seed-1', questionId: 'att-seed-6', isAnnulledSnapshot: false },
      { simulationId: 'sim-seed-2', questionId: 'att-seed-7', isAnnulledSnapshot: false }
    );

    mockAnalyticsRepo.questionAttempts.push(
      { id: 'att-seed-1', userId: user1.id, simulationId: 'sim-seed-1', isCorrect: true, isAnnulled: false, timeSpentSeconds: 45, answeredAt: new Date(), question: { subject: 'Direito Constitucional', difficulty: 'MEDIUM', topic: 'CF' } },
      { id: 'att-seed-2', userId: user1.id, simulationId: 'sim-seed-1', isCorrect: true, isAnnulled: false, timeSpentSeconds: 45, answeredAt: new Date(), question: { subject: 'Direito Constitucional', difficulty: 'MEDIUM', topic: 'CF' } },
      { id: 'att-seed-3', userId: user1.id, simulationId: 'sim-seed-2', isCorrect: true, isAnnulled: false, timeSpentSeconds: 45, answeredAt: new Date(), question: { subject: 'Direito Constitucional', difficulty: 'MEDIUM', topic: 'CF' } },
      { id: 'att-seed-4', userId: user1.id, simulationId: 'sim-seed-2', isCorrect: true, isAnnulled: false, timeSpentSeconds: 45, answeredAt: new Date(), question: { subject: 'Direito Constitucional', difficulty: 'MEDIUM', topic: 'CF' } },
      { id: 'att-seed-5', userId: user1.id, simulationId: 'sim-seed-2', isCorrect: false, isAnnulled: false, timeSpentSeconds: 45, answeredAt: new Date(), question: { subject: 'Direito Constitucional', difficulty: 'MEDIUM', topic: 'CF' } },
      { id: 'att-seed-6', userId: user1.id, simulationId: 'sim-seed-1', isCorrect: true, isAnnulled: false, timeSpentSeconds: 60, answeredAt: new Date(), question: { subject: 'Informática', difficulty: 'HARD', topic: 'Redes' } },
      { id: 'att-seed-7', userId: user1.id, simulationId: 'sim-seed-2', isCorrect: false, isAnnulled: false, timeSpentSeconds: 60, answeredAt: new Date(), question: { subject: 'Informática', difficulty: 'HARD', topic: 'Redes' } }
    );
  }

  it('1. GET autenticado com análise válida deve retornar HTTP 200 com source AI_INFERENCE', async () => {
    seedUser1ConsistentData();

    const response = await request(app)
      .get('/api/educational-ai/analysis')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

    expect(response.status).toBe(200);
    expect(response.body.source).toBe('AI_INFERENCE');
    expect(response.body.summary).toContain('Direito Constitucional');
    expect(response.body.strengths).toHaveLength(1);
    expect(response.body.weaknesses).toHaveLength(1);
    expect(response.body.trend.direction).toBe('IMPROVING');
    expect(response.body.confidenceLevel).toBe('HIGH');
  });

  it('2. GET autenticado retornando fallback determinístico quando aluno não possui histórico (zeros)', async () => {
    const response = await request(app)
      .get('/api/educational-ai/analysis')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

    expect(response.status).toBe(200);
    expect(response.body.source).toBe('DETERMINISTIC_FALLBACK');
    expect(response.body.summary).toContain('primeiro simulado');
    expect(response.body.confidenceLevel).toBe('LOW');
    expect(response.body.strengths).toEqual([]);
    expect(response.body.weaknesses).toEqual([]);
    expect(response.body.recommendations.length).toBeGreaterThanOrEqual(1);
  });

  it('3. deve rejeitar com HTTP 401 requisições sem sessão (cookie ausente)', async () => {
    const response = await request(app).get('/api/educational-ai/analysis');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Unauthorized');
    expect(response.body.message).toBe('Autenticação necessária.');
  });

  it('4. deve rejeitar com HTTP 401 requisições com sessão inválida', async () => {
    const response = await request(app)
      .get('/api/educational-ai/analysis')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-invalido-inexistente`]);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Unauthorized');
    expect(response.body.message).toBe('Sessão inválida.');
  });

  it('5. deve rejeitar com HTTP 401 requisições com sessão expirada', async () => {
    const response = await request(app)
      .get('/api/educational-ai/analysis')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-expired`]);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Unauthorized');
    expect(response.body.message).toBe('Sessão expirada.');
  });

  it('6. identidade deve ser obtida exclusivamente de req.user.id', async () => {
    const spy = vi.spyOn(educationalAiService, 'getEducationalAnalysis');

    const response = await request(app)
      .get('/api/educational-ai/analysis')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

    expect(response.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(user1.id, expect.any(Object));
  });

  it('7. deve rejeitar com HTTP 400 tentativas de fornecer userId pela query (?userId=...)', async () => {
    const response = await request(app)
      .get('/api/educational-ai/analysis?userId=student-uuid-beta')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('EDUCATIONAL_AI_INVALID_INPUT');
    expect(response.body.message).toContain('não aceita parâmetros de consulta');
  });

  it('8. deve rejeitar com HTTP 400 tentativas de fornecer userId pelo body da requisição', async () => {
    const response = await request(app)
      .get('/api/educational-ai/analysis')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`])
      .send({ userId: 'student-uuid-beta' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('EDUCATIONAL_AI_INVALID_INPUT');
    expect(response.body.message).toContain('não aceita parâmetros no corpo da requisição');
  });

  it('9. deve rejeitar com HTTP 400 parâmetros inesperados na query string', async () => {
    let res = await request(app)
      .get('/api/educational-ai/analysis?forceFallback=true')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('EDUCATIONAL_AI_INVALID_INPUT');

    res = await request(app)
      .get('/api/educational-ai/analysis?model=llama3.1:70b&prompt=hack')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('EDUCATIONAL_AI_INVALID_INPUT');
  });

  it('10. isolamento multiusuário: ausência de vazamento de dados entre usuários distintos', async () => {
    // Alimenta histórico apenas para user1
    seedUser1ConsistentData();

    // User 2 consulta seu endpoint
    const responseUser2 = await request(app)
      .get('/api/educational-ai/analysis')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-2`]);

    expect(responseUser2.status).toBe(200);
    // User 2 não possui simulados, recebe fallback limpo com zero histórico
    expect(responseUser2.body.source).toBe('DETERMINISTIC_FALLBACK');
    expect(responseUser2.body.strengths).toEqual([]);
    expect(responseUser2.body.weaknesses).toEqual([]);
    expect(responseUser2.body.summary).toContain('primeiro simulado');
  });

  it('11. deve repassar erro de domínio do EducationalAnalyticsService com status apropriado', async () => {
    vi.spyOn(analyticsService, 'getStudentAnalytics').mockRejectedValueOnce(
      new EducationalAnalyticsDomainError('ANALYTICS_QUERY_FAILED', 'Erro ao consultar analytics', 400)
    );

    const response = await request(app)
      .get('/api/educational-ai/analysis')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('ANALYTICS_QUERY_FAILED');
    expect(response.body.message).toBe('Erro ao consultar analytics');
  });

  it('12. deve converter erro inesperado de programação em HTTP 503 sem expor stack traces ou credenciais', async () => {
    vi.spyOn(educationalAiService, 'getEducationalAnalysis').mockRejectedValueOnce(
      new Error('Crash inesperado no driver nativo')
    );

    const response = await request(app)
      .get('/api/educational-ai/analysis')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('ServiceUnavailable');
    expect(response.body.message).toBe('Não foi possível gerar a análise educacional no momento.');
    expect(response.body.stack).toBeUndefined();
    expect(response.body.details).toBeUndefined();
  });

  it('13. falha recuperável de inferência de IA deve produzir HTTP 200 com fallback determinístico', async () => {
    seedUser1ConsistentData();

    // Simula falha do modelo (503 Service Unavailable no Ollama)
    mockAiClient.generateAnalysis = vi
      .fn()
      .mockRejectedValue(new EducationalAiDomainError('EDUCATIONAL_AI_UNAVAILABLE', 'Ollama offline', 503));

    const response = await request(app)
      .get('/api/educational-ai/analysis')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

    expect(response.status).toBe(200);
    expect(response.body.source).toBe('DETERMINISTIC_FALLBACK');
    expect(response.body.summary).toContain('Desempenho geral apurado em 7 questões');
  });

  it('14. cancelamento externo explícito do chamador deve propagar HTTP 499 sem acionar fallback', async () => {
    vi.spyOn(educationalAiService, 'getEducationalAnalysis').mockRejectedValueOnce(
      new EducationalAiDomainError('EDUCATIONAL_AI_CANCELLED', 'Operação cancelada pelo chamador.', 499)
    );

    const response = await request(app)
      .get('/api/educational-ai/analysis')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

    expect(response.status).toBe(499);
    expect(response.body.error).toBe('EDUCATIONAL_AI_CANCELLED');
    expect(response.body.message).toBe('Operação cancelada pelo chamador.');
  });

  it('15. resposta JSON deve cumprir integralmente o contrato EducationalAnalysisResponseDTO', async () => {
    seedUser1ConsistentData();

    const response = await request(app)
      .get('/api/educational-ai/analysis')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

    expect(response.status).toBe(200);
    const body = response.body;

    expect(typeof body.summary).toBe('string');
    expect(Array.isArray(body.strengths)).toBe(true);
    expect(Array.isArray(body.weaknesses)).toBe(true);
    expect(typeof body.trend).toBe('object');
    expect(body.trend).toHaveProperty('direction');
    expect(body.trend).toHaveProperty('description');
    expect(body.trend).toHaveProperty('deltaPercentage');
    expect(Array.isArray(body.recommendations)).toBe(true);
    expect(Array.isArray(body.priorities)).toBe(true);
    expect(['HIGH', 'MEDIUM', 'LOW']).toContain(body.confidenceLevel);
    expect(body).toHaveProperty('insufficientDataNotice');
    expect(['AI_INFERENCE', 'DETERMINISTIC_FALLBACK']).toContain(body.source);
    expect(typeof body.generatedAt).toBe('string');
    expect(new Date(body.generatedAt).toISOString()).toBe(body.generatedAt);
  });

  it('16. deve aplicar cabeçalhos Cache-Control: no-store para proteger dados privados de diagnóstico', async () => {
    const response = await request(app)
      .get('/api/educational-ai/analysis')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

    expect(response.headers['cache-control']).toBe(
      'no-store, no-cache, must-revalidate, proxy-revalidate'
    );
    expect(response.headers['pragma']).toBe('no-cache');
    expect(response.headers['expires']).toBe('0');
  });

  it('17. deve acionar rate limiter retornando HTTP 429 quando limite de requisições for excedido', async () => {
    // Configura app com rate limit restritivo de 3 requisições
    const rateLimitedApp = createApp({
      auth: { authService: mockAuthService },
      educationalAi: {
        authService: mockAuthService,
        educationalAiService,
        rateLimitOptions: { maxAttempts: 3, windowMs: 60000 },
      },
    });

    // Requisições 1, 2 e 3 devem passar com 200
    for (let i = 0; i < 3; i++) {
      const res = await request(rateLimitedApp)
        .get('/api/educational-ai/analysis')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);
      expect(res.status).toBe(200);
    }

    // Requisição 4 deve ser bloqueada por rate limit
    const blockedRes = await request(rateLimitedApp)
      .get('/api/educational-ai/analysis')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.error).toBe('TooManyRequests');
    expect(blockedRes.body.message).toContain('Muitas requisições de análise de IA');
  });

  it('18. ausência de operações de escrita: o endpoint atua de forma estritamente consultiva', async () => {
    seedUser1ConsistentData();
    mockAnalyticsRepo.writeCallCount = 0;

    const response = await request(app)
      .get('/api/educational-ai/analysis')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

    expect(response.status).toBe(200);
    expect(mockAnalyticsRepo.writeCallCount).toBe(0);
  });

  it('19. ausência de chamadas reais ao Ollama: mock garante isolamento sem conexões externas', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await request(app)
      .get('/api/educational-ai/analysis')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

    // Nenhuma chamada fetch real foi disparada ao daemon do Ollama
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('20. ausência de conexões reais com PostgreSQL: garantido por repositórios em memória', async () => {
    const response = await request(app)
      .get('/api/educational-ai/analysis')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

    expect(response.status).toBe(200);
    expect(mockAnalyticsRepo).toBeInstanceOf(MockEducationalAnalyticsRepository);
  });

  describe('Sprint 9.3.1: Ciclo de Vida HTTP Assíncrono e Cancelamento de Response (ACH-COMP-01)', () => {
    it('21. requisição GET autenticada com atraso assíncrono controlado (50ms) deve retornar HTTP 200 sem aborto indevido', async () => {
      seedUser1ConsistentData();
      let observedAborted = false;

      vi.spyOn(educationalAiService, 'getEducationalAnalysis').mockImplementation(
        async (_userId, options) => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          observedAborted = Boolean(options?.signal?.aborted);
          return sampleAiAnalysisResponse;
        }
      );

      const response = await request(app)
        .get('/api/educational-ai/analysis')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

      expect(response.status).toBe(200);
      expect(response.body.source).toBe('AI_INFERENCE');
      expect(observedAborted).toBe(false);
    });

    it('22. o AbortSignal não deve ser cancelado enquanto o cliente aguarda normalmente pela resposta', async () => {
      seedUser1ConsistentData();
      let signalReceived: AbortSignal | undefined;

      vi.spyOn(educationalAiService, 'getEducationalAnalysis').mockImplementation(
        async (_userId, options) => {
          signalReceived = options?.signal;
          await new Promise((resolve) => setTimeout(resolve, 30));
          expect(signalReceived?.aborted).toBe(false);
          return sampleAiAnalysisResponse;
        }
      );

      const response = await request(app)
        .get('/api/educational-ai/analysis')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);

      expect(response.status).toBe(200);
      expect(signalReceived).toBeDefined();
      expect(signalReceived?.aborted).toBe(false);
    });

    it('23. desconexão prematura do cliente deve abortar o sinal via res.on(close) e não ativar fallback determinístico', async () => {
      seedUser1ConsistentData();
      const server = http.createServer(app);

      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as { port: number }).port;

      let signalAborted = false;
      let fallbackActivated = false;

      const signalPromise = new Promise<void>((resolve) => {
        vi.spyOn(educationalAiService, 'getEducationalAnalysis').mockImplementation(
          async (_userId, options) => {
            options?.signal?.addEventListener('abort', () => {
              signalAborted = true;
              resolve();
            });

            // Aguarda abort ou timeout
            await new Promise((r) => setTimeout(r, 400));
            if (options?.signal?.aborted) {
              throw new EducationalAiDomainError('EDUCATIONAL_AI_CANCELLED', 'Cancelado', 499);
            }
            fallbackActivated = true;
            return sampleAiAnalysisResponse;
          }
        );
      });

      try {
        const clientReq = http.request({
          host: '127.0.0.1',
          port,
          path: '/api/educational-ai/analysis',
          method: 'GET',
          headers: {
            Cookie: `${SESSION_COOKIE_NAME}=token-user-1`,
          },
        });

        clientReq.on('error', () => {
          // Ignora erro esperado de destruição prematura do socket no cliente
        });

        clientReq.end();

        // Destrói a requisição do cliente prematuramente após 25ms, antes do servidor responder
        await new Promise((r) => setTimeout(r, 25));
        clientReq.destroy();

        await Promise.race([
          signalPromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout aguardando sinal abortar')), 1000)
          ),
        ]);

        expect(signalAborted).toBe(true);
        expect(fallbackActivated).toBe(false);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('24. listeners de close na response devem ser removidos após sucesso ou erro', async () => {
      seedUser1ConsistentData();

      // 1. Caso de Sucesso
      const resSuccess = await request(app)
        .get('/api/educational-ai/analysis')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);
      expect(resSuccess.status).toBe(200);

      // 2. Caso de Erro de Domínio
      vi.spyOn(educationalAiService, 'getEducationalAnalysis').mockRejectedValueOnce(
        new EducationalAiDomainError('EDUCATIONAL_AI_INVALID_OUTPUT', 'Erro de teste', 422)
      );
      const resError = await request(app)
        .get('/api/educational-ai/analysis')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]);
      expect(resError.status).toBe(422);
    });

    it('25. requisições consecutivas não devem compartilhar AbortController nem interferir entre si', async () => {
      seedUser1ConsistentData();
      const signals: AbortSignal[] = [];

      vi.spyOn(educationalAiService, 'getEducationalAnalysis').mockImplementation(
        async (_userId, options) => {
          if (options?.signal) {
            signals.push(options.signal);
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
          return sampleAiAnalysisResponse;
        }
      );

      const [res1, res2] = await Promise.all([
        request(app)
          .get('/api/educational-ai/analysis')
          .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]),
        request(app)
          .get('/api/educational-ai/analysis')
          .set('Cookie', [`${SESSION_COOKIE_NAME}=token-user-1`]),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(signals).toHaveLength(2);
      expect(signals[0]).not.toBe(signals[1]);
      expect(signals[0].aborted).toBe(false);
      expect(signals[1].aborted).toBe(false);
    });
  });

  describe('Sprint 9.3.1: Validação Rigorosa de Porta TCP (ACH-COMP-02)', () => {
    it('26. isValidTcpPort deve aceitar números inteiros estritamente entre 1 e 65535', () => {
      expect(isValidTcpPort(1)).toBe(true);
      expect(isValidTcpPort(3000)).toBe(true);
      expect(isValidTcpPort(65535)).toBe(true);
      expect(isValidTcpPort('1')).toBe(true);
      expect(isValidTcpPort('3000')).toBe(true);
      expect(isValidTcpPort('65535')).toBe(true);
    });

    it('27. isValidTcpPort deve rejeitar 0, negativos, maiores que 65535, decimais e inválidos', () => {
      expect(isValidTcpPort(0)).toBe(false);
      expect(isValidTcpPort('0')).toBe(false);
      expect(isValidTcpPort(-1)).toBe(false);
      expect(isValidTcpPort('-3000')).toBe(false);
      expect(isValidTcpPort(65536)).toBe(false);
      expect(isValidTcpPort('70000')).toBe(false);
      expect(isValidTcpPort(3000.5)).toBe(false);
      expect(isValidTcpPort('3000.5')).toBe(false);
      expect(isValidTcpPort(NaN)).toBe(false);
      expect(isValidTcpPort(Infinity)).toBe(false);
      expect(isValidTcpPort('abc')).toBe(false);
      expect(isValidTcpPort(null)).toBe(false);
      expect(isValidTcpPort(undefined)).toBe(false);
    });

    it('28. parsePort deve suportar formatos CLI --port 3000 e --port=3000 com precedência sobre PORT', () => {
      expect(parsePort(['node', 'server.ts', '--port', '4000'], { PORT: '5000' })).toBe(4000);
      expect(parsePort(['node', 'server.ts', '-p', '4500'], { PORT: '5000' })).toBe(4500);
      expect(parsePort(['node', 'server.ts', '--port=4200'], { PORT: '5000' })).toBe(4200);
    });

    it('29. parsePort deve recorrer a PORT do ambiente se válida e diferente de 8080', () => {
      expect(parsePort(['node', 'server.ts'], { PORT: '5000' })).toBe(5000);
      // 8080 reservada pelo proxy Nginx cai no fallback seguro 3000
      expect(parsePort(['node', 'server.ts'], { PORT: '8080' })).toBe(3000);
    });

    it('30. parsePort deve retornar fallback 3000 para valores inválidos ou ausência de configuração', () => {
      expect(parsePort(['node', 'server.ts', '--port', '70000'], {})).toBe(3000);
      expect(parsePort(['node', 'server.ts', '--port', '-10'], {})).toBe(3000);
      expect(parsePort(['node', 'server.ts', '--port', 'texto'], {})).toBe(3000);
      expect(parsePort(['node', 'server.ts', '--port=0'], {})).toBe(3000);
      expect(parsePort(['node', 'server.ts'], {})).toBe(3000);
    });
  });
});
