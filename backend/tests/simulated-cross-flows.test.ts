import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.ts';
import { AuthService } from '../src/services/auth.service.ts';
import { SimulationService } from '../src/services/simulation.service.ts';
import { PdfDocumentService } from '../src/services/pdf-document.service.ts';
import { EducationalAiService } from '../src/services/educational-ai.service.ts';
import { EducationalAnalyticsService } from '../src/services/educational-analytics.service.ts';
import {
  MockEducationalAnalyticsRepository,
} from '../src/repositories/educational-analytics.repository.ts';
import { StreakService } from '../src/services/streak.service.ts';
import { StudyActivityService } from '../src/services/study-activity.service.ts';
import {
  CSRF_HEADER_NAME,
  CSRF_HEADER_EXPECTED_VALUE,
} from '../src/middlewares/csrf.middleware.ts';
import { SESSION_COOKIE_NAME } from '../src/utils/cookies.ts';
import {
  type PublicUserDTO,
  type ValidatedSessionResult,
} from '../src/types/auth.types.ts';
import {
  SimulationDomainError,
  type SimulationDetailDTO,
  type QuestionAttempt,
  type SimulationResultDTO,
} from '../src/types/simulation.types.ts';
import {
  PdfDocumentDomainError,
  type PdfDocumentDetailDTO,
} from '../src/types/pdf-document.types.ts';
import { buildRealPdfBuffer } from './helpers/pdf-test.helper.ts';

describe('Suíte de Regressão Funcional e Fluxos Simulados Multimodulares (Sprint 10.4)', () => {
  const CSRF_HEADERS = {
    [CSRF_HEADER_NAME]: CSRF_HEADER_EXPECTED_VALUE,
  };

  const validTestEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    PORT: '3000',
    FRONTEND_URL: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://user:super_secret_password_1234@localhost:5432/questforge',
    SESSION_SECRET: 'chave_secreta_de_teste_com_mais_de_32_caracteres_12345',
    OLLAMA_BASE_URL: 'http://localhost:11434',
    OLLAMA_MODEL: 'llama3.1:8b',
    MINIO_ENDPOINT: 'localhost',
    MINIO_PORT: '9000',
    MINIO_BUCKET: 'questforge-documents',
    MINIO_USE_SSL: 'false',
    MINIO_ACCESS_KEY: 'minio_access_secret_user',
    MINIO_SECRET_KEY: 'minio_super_secret_password_9876',
  };

  // Usuários de teste para isolamento multimodular
  const userAlice: PublicUserDTO = {
    id: 'user-alice-001',
    name: 'Alice Estudante',
    email: 'alice@questforge.local',
    avatarUrl: null,
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-01T10:00:00Z'),
  };

  const userBob: PublicUserDTO = {
    id: 'user-bob-002',
    name: 'Bob Estudante',
    email: 'bob@questforge.local',
    avatarUrl: null,
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-01T10:00:00Z'),
  };

  const aliceSession: ValidatedSessionResult = {
    user: userAlice,
    session: {
      id: 'session-alice',
      userId: userAlice.id,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      lastUsedAt: new Date(),
    },
  };

  const bobSession: ValidatedSessionResult = {
    user: userBob,
    session: {
      id: 'session-bob',
      userId: userBob.id,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      lastUsedAt: new Date(),
    },
  };

  let mockAuthService: AuthService;
  let mockSimulationService: SimulationService;
  let mockPdfDocumentService: PdfDocumentService;
  let mockEducationalAiService: EducationalAiService;
  let mockStreakService: StreakService;
  let mockStudyActivityService: StudyActivityService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthService = {
      validateSession: vi.fn().mockImplementation(async (token: string) => {
        if (token === 'alice-token') return aliceSession;
        if (token === 'bob-token') return bobSession;
        throw new Error('Invalid token');
      }),
    } as unknown as AuthService;

    mockSimulationService = {
      createSimulation: vi.fn(),
      getSimulation: vi.fn(),
      startSimulation: vi.fn(),
      submitAnswer: vi.fn(),
      finishSimulation: vi.fn(),
      listUserSimulations: vi.fn(),
    } as unknown as SimulationService;

    mockPdfDocumentService = {
      uploadAndProcessPdf: vi.fn(),
      getUserDocumentById: vi.fn(),
      deleteUserDocument: vi.fn(),
      processDocumentOcr: vi.fn(),
      getOcrServiceStatus: vi.fn().mockReturnValue({ isAvailable: false, providerName: 'unconfigured' }),
    } as unknown as PdfDocumentService;

    mockEducationalAiService = {
      getEducationalAnalysis: vi.fn(),
    } as unknown as EducationalAiService;

    mockStreakService = new StreakService({
      findByUserId: vi.fn(),
      upsert: vi.fn(),
      acquireUserLock: vi.fn(),
    });

    mockStudyActivityService = {
      recordStudyActivity: vi.fn(),
      listUserActivities: vi.fn(),
    } as unknown as StudyActivityService;
  });

  function createTestApp(extraDeps = {}) {
    return createApp({
      auth: { authService: mockAuthService },
      simulations: {
        authService: mockAuthService,
        simulationService: mockSimulationService,
      },
      documents: {
        authService: mockAuthService,
        pdfDocumentService: mockPdfDocumentService,
      },
      educationalAi: {
        authService: mockAuthService,
        educationalAiService: mockEducationalAiService,
      },
      activities: {
        authService: mockAuthService,
        studyActivityService: mockStudyActivityService,
        streakService: mockStreakService,
      },
      ...extraDeps,
    });
  }

  // =========================================================================
  // 1. FLUXO A — Ciclo de Vida Completo do Simulado (Usuário e Simulado)
  // =========================================================================
  describe('Fluxo A — Ciclo de Vida Completo do Simulado', () => {
    it('deve percorrer o ciclo completo: criar, iniciar, submeter com anti-cheating, finalizar, apurar nota e bloquear alterações pós-fim', async () => {
      const app = createTestApp();
      const simId = 'sim-flow-001';

      // 1. Criação do Simulado
      const createdSim: SimulationDetailDTO = {
        id: simId,
        userId: userAlice.id,
        title: 'Simulado Direito Administrativo',
        status: 'CREATED',
        totalQuestions: 2,
        timeLimitSeconds: 1800,
        timeRemainingSeconds: 1800,
        isExpired: false,
        scorePercentage: null,
        correctCount: null,
        wrongCount: null,
        unansweredCount: null,
        startedAt: null,
        finishedAt: null,
        durationSeconds: null,
        createdAt: new Date(),
        questions: [
          {
            id: 'sim-q-1',
            simulationId: simId,
            questionId: 'q-1',
            position: 0,
            statement: 'Sobre atos administrativos...',
            type: 'MULTIPLE_CHOICE',
            subject: 'Direito Administrativo',
            topic: null,
            subtopic: null,
            board: null,
            examTitle: null,
            year: null,
            difficulty: 'MEDIUM',
            alternatives: [
              { id: 'alt-1a', letter: 'A', text: 'Opção A', position: 0 },
              { id: 'alt-1b', letter: 'B', text: 'Opção B', position: 1 },
            ],
            currentAttempt: null,
          },
          {
            id: 'sim-q-2',
            simulationId: simId,
            questionId: 'q-2',
            position: 1,
            statement: 'Sobre poderes administrativos...',
            type: 'MULTIPLE_CHOICE',
            subject: 'Direito Administrativo',
            topic: null,
            subtopic: null,
            board: null,
            examTitle: null,
            year: null,
            difficulty: 'HARD',
            alternatives: [
              { id: 'alt-2a', letter: 'A', text: 'Opção A', position: 0 },
              { id: 'alt-2b', letter: 'B', text: 'Opção B', position: 1 },
            ],
            currentAttempt: null,
          },
        ],
      };

      vi.mocked(mockSimulationService.createSimulation).mockResolvedValueOnce(createdSim);

      const createRes = await request(app)
        .post('/api/simulations')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=alice-token`])
        .set(CSRF_HEADERS)
        .send({
          title: 'Simulado Direito Administrativo',
          totalQuestions: 2,
          questionIds: ['q-1', 'q-2'],
          timeLimitSeconds: 1800,
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.simulation.id).toBe(simId);
      expect(createRes.body.simulation.status).toBe('CREATED');

      // 2. Iniciar Simulado (Status IN_PROGRESS)
      const inProgressSim: SimulationDetailDTO = {
        ...createdSim,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      };
      vi.mocked(mockSimulationService.startSimulation).mockResolvedValueOnce(inProgressSim);

      const startRes = await request(app)
        .post(`/api/simulations/${simId}/start`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=alice-token`])
        .set(CSRF_HEADERS);

      expect(startRes.status).toBe(200);
      expect(startRes.body.simulation.status).toBe('IN_PROGRESS');
      expect(startRes.body.simulation.startedAt).toBeDefined();

      // 3. Submeter Resposta 1 com Anti-Cheating (Gabarito NÃO é revelado)
      const attempt1: QuestionAttempt = {
        id: 'att-1',
        simulationId: simId,
        questionId: 'q-1',
        userId: userAlice.id,
        selectedAlternativeId: 'alt-1a',
        selectedLetter: 'A',
        isCorrect: true, // Persistido internamente no banco, mas NÃO pode vazar no DTO HTTP!
        timeSpentSeconds: 45,
        answeredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(mockSimulationService.submitAnswer).mockResolvedValueOnce(attempt1);

      const answerRes1 = await request(app)
        .post(`/api/simulations/${simId}/answers`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=alice-token`])
        .set(CSRF_HEADERS)
        .send({
          questionId: 'q-1',
          selectedAlternativeId: 'alt-1a',
          timeSpentSeconds: 45,
        });

      expect(answerRes1.status).toBe(200);
      expect(answerRes1.body.attempt.id).toBe('att-1');
      expect(answerRes1.body.attempt.selectedAlternativeId).toBe('alt-1a');
      // Anti-cheating inegociável: isCorrect e gabaritos não devem existir no DTO público
      expect(answerRes1.body.attempt.isCorrect).toBeUndefined();
      expect(answerRes1.body.attempt.correctOptionId).toBeUndefined();
      expect(answerRes1.body.attempt.correctAlternativeId).toBeUndefined();

      // 4. Submeter Resposta com Questão em Branco (selectedAlternativeId: null)
      const attemptBlank: QuestionAttempt = {
        id: 'att-blank',
        simulationId: simId,
        questionId: 'q-2',
        userId: userAlice.id,
        selectedAlternativeId: null,
        selectedLetter: null,
        isCorrect: false,
        timeSpentSeconds: 20,
        answeredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(mockSimulationService.submitAnswer).mockResolvedValueOnce(attemptBlank);

      const answerBlankRes = await request(app)
        .post(`/api/simulations/${simId}/answers`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=alice-token`])
        .set(CSRF_HEADERS)
        .send({
          questionId: 'q-2',
          selectedAlternativeId: null,
          timeSpentSeconds: 20,
        });

      expect(answerBlankRes.status).toBe(200);
      expect(answerBlankRes.body.attempt.selectedAlternativeId).toBeNull();
      expect(answerBlankRes.body.attempt.isCorrect).toBeUndefined();

      // 5. Rejeição com HTTP 400 ao submeter alternativa pertencente a outra questão
      vi.mocked(mockSimulationService.submitAnswer).mockRejectedValueOnce(
        new SimulationDomainError(
          'SIMULATION_INVALID_INPUT',
          'A alternativa selecionada não pertence a esta questão.',
          400
        )
      );

      const answerInvalidRes = await request(app)
        .post(`/api/simulations/${simId}/answers`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=alice-token`])
        .set(CSRF_HEADERS)
        .send({
          questionId: 'q-1',
          selectedAlternativeId: 'alt-invalid-from-another-q',
          timeSpentSeconds: 15,
        });

      expect(answerInvalidRes.status).toBe(400);
      expect(answerInvalidRes.body.error).toBe('SIMULATION_INVALID_INPUT');

      // 6. Finalização do Simulado (Status COMPLETED e apuração de nota oficial)
      const finishedResult: SimulationResultDTO = {
        ...inProgressSim,
        status: 'COMPLETED',
        scorePercentage: 50.0,
        correctCount: 1,
        wrongCount: 0,
        unansweredCount: 1,
        finishedAt: new Date(),
        durationSeconds: 65,
        questions: [
          {
            id: 'sim-q-1',
            simulationId: simId,
            questionId: 'q-1',
            position: 0,
            statement: 'Sobre atos administrativos...',
            type: 'MULTIPLE_CHOICE',
            subject: 'Direito Administrativo',
            topic: null,
            subtopic: null,
            board: null,
            examTitle: null,
            year: null,
            difficulty: 'MEDIUM',
            alternatives: [
              { id: 'alt-1a', letter: 'A', text: 'Opção A', position: 0 },
              { id: 'alt-1b', letter: 'B', text: 'Opção B', position: 1 },
            ],
            answerKeySnapshot: 'A',
            isAnnulledSnapshot: false,
            snapshotSource: 'OFFICIAL_KEY',
            officialAnswerKeyVersion: 1,
            explanation: null,
            isCorrect: true,
          },
          {
            id: 'sim-q-2',
            simulationId: simId,
            questionId: 'q-2',
            position: 1,
            statement: 'Sobre poderes administrativos...',
            type: 'MULTIPLE_CHOICE',
            subject: 'Direito Administrativo',
            topic: null,
            subtopic: null,
            board: null,
            examTitle: null,
            year: null,
            difficulty: 'HARD',
            alternatives: [
              { id: 'alt-2a', letter: 'A', text: 'Opção A', position: 0 },
              { id: 'alt-2b', letter: 'B', text: 'Opção B', position: 1 },
            ],
            answerKeySnapshot: 'B',
            isAnnulledSnapshot: false,
            snapshotSource: 'OFFICIAL_KEY',
            officialAnswerKeyVersion: 1,
            explanation: null,
            isCorrect: false,
          },
        ],
      };
      vi.mocked(mockSimulationService.finishSimulation).mockResolvedValueOnce(finishedResult);

      const finishRes = await request(app)
        .post(`/api/simulations/${simId}/finish`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=alice-token`])
        .set(CSRF_HEADERS);

      expect(finishRes.status).toBe(200);
      expect(finishRes.body.result.status).toBe('COMPLETED');
      expect(finishRes.body.result.scorePercentage).toBe(50.0);
      expect(finishRes.body.result.questions[0].isCorrect).toBe(true);

      // 7. Bloqueio pós-finalização: tentativa de alterar resposta retorna HTTP 409 Conflict
      vi.mocked(mockSimulationService.submitAnswer).mockRejectedValueOnce(
        new SimulationDomainError(
          'SIMULATION_ALREADY_COMPLETED',
          'Não é permitido alterar respostas de um simulado já finalizado.',
          409
        )
      );

      const postFinishAnswerRes = await request(app)
        .post(`/api/simulations/${simId}/answers`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=alice-token`])
        .set(CSRF_HEADERS)
        .send({
          questionId: 'q-1',
          selectedAlternativeId: 'alt-1b',
        });

      expect(postFinishAnswerRes.status).toBe(409);
      expect(postFinishAnswerRes.body.error).toBe('SIMULATION_ALREADY_COMPLETED');

      // 8. Bloqueio pós-finalização: tentativa de re-finalizar retorna HTTP 409 Conflict
      vi.mocked(mockSimulationService.finishSimulation).mockRejectedValueOnce(
        new SimulationDomainError(
          'SIMULATION_ALREADY_COMPLETED',
          'O simulado já foi finalizado anteriormente.',
          409
        )
      );

      const reFinishRes = await request(app)
        .post(`/api/simulations/${simId}/finish`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=alice-token`])
        .set(CSRF_HEADERS);

      expect(reFinishRes.status).toBe(409);
      expect(reFinishRes.body.error).toBe('SIMULATION_ALREADY_COMPLETED');
    });
  });

  // =========================================================================
  // 2. FLUXO B — Documento e Questões (PDF binário, extração e OCR honesto)
  // =========================================================================
  describe('Fluxo B — Documento PDF e Pipeline de Extração / OCR', () => {
    it('deve aceitar PDF binário real com magic bytes %PDF- e extrair texto digital', async () => {
      const app = createTestApp();
      const realPdfBuffer = buildRealPdfBuffer({
        pageTexts: ['Questão 1: Em relação aos atos administrativos, julgue o item a seguir...'],
      });

      const processedDoc: PdfDocumentDetailDTO = {
        id: 'doc-pdf-valid-01',
        userId: userAlice.id,
        examId: null,
        originalName: 'prova-concurso.pdf',
        mimeType: 'application/pdf',
        sizeBytes: realPdfBuffer.length,
        checksumSha256: 'fake-checksum-sha256-abc',
        status: 'COMPLETED',
        pageCount: 1,
        extractedCharCount: 81,
        requiresOcr: false,
        errorMessage: null,
        processedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockPdfDocumentService.uploadAndProcessPdf).mockResolvedValueOnce(processedDoc);

      const uploadRes = await request(app)
        .post('/api/documents')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=alice-token`])
        .set(CSRF_HEADERS)
        .attach('file', realPdfBuffer, 'prova-concurso.pdf');

      expect(uploadRes.status).toBe(201);
      expect(uploadRes.body.document.status).toBe('COMPLETED');
      expect(uploadRes.body.document.id).toBe('doc-pdf-valid-01');
      // Garantia de segurança: objectKey interna do MinIO nunca vaza na API HTTP
      expect(uploadRes.body.document.objectKey).toBeUndefined();
    });

    it('deve classificar documento escaneado/imagem como NEEDS_OCR e informar OCR_UNAVAILABLE honestamente', async () => {
      const app = createTestApp();
      const docId = 'doc-scanned-02';

      // Simula documento que após upload e extração digital identificou ausência de camada de texto
      const scannedDoc: PdfDocumentDetailDTO = {
        id: docId,
        userId: userAlice.id,
        examId: null,
        originalName: 'prova-escaneada.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 102400,
        checksumSha256: 'fake-checksum-scanned-123',
        status: 'NEEDS_OCR',
        pageCount: 2,
        extractedCharCount: 0,
        requiresOcr: true,
        errorMessage: null,
        processedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockPdfDocumentService.uploadAndProcessPdf).mockResolvedValueOnce(scannedDoc);

      const realPdfBuffer = buildRealPdfBuffer({ pageTexts: ['', ''] }); // Sem texto digital
      const uploadRes = await request(app)
        .post('/api/documents')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=alice-token`])
        .set(CSRF_HEADERS)
        .attach('file', realPdfBuffer, 'prova-escaneada.pdf');

      expect(uploadRes.status).toBe(201);
      expect(uploadRes.body.document.status).toBe('NEEDS_OCR');

      // Tenta acionar OCR sem motor configurado: deve responder honestamente com HTTP 503 e OCR_UNAVAILABLE
      vi.mocked(mockPdfDocumentService.processDocumentOcr).mockRejectedValueOnce(
        new PdfDocumentDomainError(
          'OCR_UNAVAILABLE',
          'O serviço de OCR não está disponível no ambiente atual (planejado para a Sprint 11).',
          503
        )
      );

      const ocrRes = await request(app)
        .post(`/api/documents/${docId}/ocr`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=alice-token`])
        .set(CSRF_HEADERS);

      expect(ocrRes.status).toBe(503);
      expect(ocrRes.body.error).toBe('OCR_UNAVAILABLE');
      expect(ocrRes.body.message).toContain('Sprint 11');
    });

    it('deve rejeitar arquivo sem magic bytes de PDF com HTTP 400', async () => {
      const app = createTestApp();
      const fakePdfBuffer = Buffer.from('NOT_A_REAL_PDF_HEADER_JUST_TEXT');

      vi.mocked(mockPdfDocumentService.uploadAndProcessPdf).mockRejectedValueOnce(
        new PdfDocumentDomainError(
          'PDF_VALIDATION_ERROR',
          'O arquivo enviado não possui o cabeçalho binário padrão de formato PDF (%PDF-).',
          400
        )
      );

      const uploadRes = await request(app)
        .post('/api/documents')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=alice-token`])
        .set(CSRF_HEADERS)
        .attach('file', fakePdfBuffer, 'fake.pdf');

      expect(uploadRes.status).toBe(400);
      expect(uploadRes.body.error).toBe('PDF_VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // 3. FLUXO C — Falhas de Infraestrutura e Resiliência Operacional
  // =========================================================================
  describe('Fluxo C — Falhas de Infraestrutura e Resiliência Operacional', () => {
    it('deve retornar HTTP 503 com status not_ready quando o PostgreSQL estiver inacessível', async () => {
      const app = createTestApp({
        health: {
          rawEnv: validTestEnv,
          checkDb: async () => ({
            status: 'down' as const,
            latencyMs: 1500,
            message: 'Connection timeout: unable to reach PostgreSQL on port 5432',
          }),
          checkStorage: async () => ({
            status: 'up' as const,
            bucket: 'questforge-documents',
            message: 'MinIO OK',
          }),
        },
      });

      const readyRes = await request(app).get('/api/ready');

      expect(readyRes.status).toBe(503);
      expect(readyRes.body.status).toBe('not_ready');
      expect(readyRes.body.essential.database.status).toBe('down');
      expect(readyRes.body.optional.storage.status).toBe('up');
    });

    it('deve retornar HTTP 200 com status ready_degraded quando apenas o MinIO falhar', async () => {
      const app = createTestApp({
        health: {
          rawEnv: validTestEnv,
          checkDb: async () => ({
            status: 'up' as const,
            latencyMs: 8,
            message: 'PostgreSQL OK',
          }),
          checkStorage: async () => ({
            status: 'down' as const,
            bucket: 'questforge-documents',
            message: 'ECONNREFUSED: MinIO connection failed',
          }),
        },
      });

      const readyRes = await request(app).get('/api/ready');

      expect(readyRes.status).toBe(200);
      expect(readyRes.body.status).toBe('ready_degraded');
      expect(readyRes.body.essential.database.status).toBe('up');
      expect(readyRes.body.optional.storage.status).toBe('down');
    });

    it('deve ativar o fallback determinístico sem erro 500 quando o Ollama/IA estiver indisponível', async () => {
      const app = createTestApp();

      // Quando o cliente de IA falha (ex: Ollama offline), o EducationalAiService
      // cai graciosamente no fallback determinístico e retorna source: DETERMINISTIC_FALLBACK
      vi.mocked(mockEducationalAiService.getEducationalAnalysis).mockResolvedValueOnce({
        summary: 'Desempenho geral apurado em 15 questões respondidas com taxa de acertos de 80%.',
        strengths: [
          {
            subject: 'Direito Administrativo',
            description: 'Forte domínio da disciplina demonstrado.',
            accuracyPercentage: 85.0,
          },
        ],
        weaknesses: [],
        trend: {
          direction: 'STABLE',
          description: 'O desempenho em simulados permaneceu estável.',
          deltaPercentage: 0,
        },
        recommendations: [
          {
            title: 'Manter consistência diária',
            description: 'Praticar diariamente reforça a retenção de longo prazo.',
            actionableStep: 'Resolva pelo menos 10 questões por dia.',
          },
        ],
        priorities: [
          {
            subject: 'Direito Administrativo',
            priority: 'MEDIUM',
            reason: 'Consolidar conteúdo para manter taxa de acerto.',
            targetAccuracyPercentage: 90,
          },
        ],
        confidenceLevel: 'HIGH',
        insufficientDataNotice: null,
        source: 'DETERMINISTIC_FALLBACK',
        generatedAt: new Date().toISOString(),
      });

      const aiRes = await request(app)
        .get('/api/educational-ai/analysis')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=alice-token`]);

      expect(aiRes.status).toBe(200);
      expect(aiRes.body.source).toBe('DETERMINISTIC_FALLBACK');
      expect(aiRes.body.summary).toContain('80%');
      expect(aiRes.body.recommendations).toHaveLength(1);
    });
  });

  // =========================================================================
  // 4. FLUXO D — Isolamento Estrito entre Contas (Anti-IDOR Multimodular)
  // =========================================================================
  describe('Fluxo D — Isolamento Estrito entre Contas (Anti-IDOR)', () => {
    it('deve impedir que Usuário Bob consulte, inicie, responda ou finalize simulado de Alice', async () => {
      const app = createTestApp();
      const aliceSimId = 'alice-sim-private-99';

      // Consulta de simulado alheio
      vi.mocked(mockSimulationService.getSimulation).mockRejectedValueOnce(
        new SimulationDomainError('SIMULATION_NOT_FOUND', 'Simulado não encontrado.', 404)
      );

      const getRes = await request(app)
        .get(`/api/simulations/${aliceSimId}`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=bob-token`]);

      expect(getRes.status).toBe(404);
      expect(getRes.body.error).toBe('SIMULATION_NOT_FOUND');

      // Tentativa de início de simulado alheio
      vi.mocked(mockSimulationService.startSimulation).mockRejectedValueOnce(
        new SimulationDomainError('SIMULATION_NOT_FOUND', 'Simulado não encontrado.', 404)
      );

      const startRes = await request(app)
        .post(`/api/simulations/${aliceSimId}/start`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=bob-token`])
        .set(CSRF_HEADERS);

      expect(startRes.status).toBe(404);

      // Tentativa de submissão de resposta em simulado alheio
      vi.mocked(mockSimulationService.submitAnswer).mockRejectedValueOnce(
        new SimulationDomainError('SIMULATION_NOT_FOUND', 'Simulado não encontrado.', 404)
      );

      const answerRes = await request(app)
        .post(`/api/simulations/${aliceSimId}/answers`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=bob-token`])
        .set(CSRF_HEADERS)
        .send({
          questionId: 'q-alice-1',
          selectedAlternativeId: 'alt-a',
        });

      expect(answerRes.status).toBe(404);

      // Tentativa de finalização de simulado alheio
      vi.mocked(mockSimulationService.finishSimulation).mockRejectedValueOnce(
        new SimulationDomainError('SIMULATION_NOT_FOUND', 'Simulado não encontrado.', 404)
      );

      const finishRes = await request(app)
        .post(`/api/simulations/${aliceSimId}/finish`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=bob-token`])
        .set(CSRF_HEADERS);

      expect(finishRes.status).toBe(404);
    });

    it('deve impedir que Usuário Bob consulte ou exclua documento PDF pertencente a Alice', async () => {
      const app = createTestApp();
      const aliceDocId = 'doc-alice-secret-01';

      vi.mocked(mockPdfDocumentService.getUserDocumentById).mockRejectedValueOnce(
        new PdfDocumentDomainError('DOCUMENT_NOT_FOUND', 'Documento não encontrado.', 404)
      );

      const getDocRes = await request(app)
        .get(`/api/documents/${aliceDocId}`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=bob-token`]);

      expect(getDocRes.status).toBe(404);

      vi.mocked(mockPdfDocumentService.deleteUserDocument).mockRejectedValueOnce(
        new PdfDocumentDomainError('DOCUMENT_NOT_FOUND', 'Documento não encontrado.', 404)
      );

      const deleteDocRes = await request(app)
        .delete(`/api/documents/${aliceDocId}`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=bob-token`])
        .set(CSRF_HEADERS);

      expect(deleteDocRes.status).toBe(404);
    });
  });

  // =========================================================================
  // 5. Módulo Streak e Atividades de Estudo (Consistência Temporal e Idempotência)
  // =========================================================================
  describe('Streak e Atividades de Estudo', () => {
    it('deve iniciar streak em 1 no Dia 1 (STARTED)', () => {
      const d1 = new Date('2026-03-01T14:00:00Z');
      const transition = mockStreakService.calculateStreakTransition(null, d1);

      expect(transition.action).toBe('STARTED');
      expect(transition.currentStreak).toBe(1);
      expect(transition.longestStreak).toBe(1);
      expect(transition.lastActivityDate).toBe('2026-03-01');
    });

    it('deve manter o streak em caso de múltiplas atividades no mesmo dia UTC (MAINTAINED_SAME_DAY)', () => {
      const d1Morning = new Date('2026-03-01T08:00:00Z');
      const d1Evening = new Date('2026-03-01T21:30:00Z');

      const existingRecord = {
        id: 'streak-1',
        userId: userAlice.id,
        currentStreak: 1,
        longestStreak: 1,
        lastActivityDate: '2026-03-01',
        createdAt: d1Morning,
        updatedAt: d1Morning,
      };

      const transition = mockStreakService.calculateStreakTransition(existingRecord, d1Evening);

      expect(transition.action).toBe('MAINTAINED_SAME_DAY');
      expect(transition.currentStreak).toBe(1);
      expect(transition.longestStreak).toBe(1);
      expect(transition.deltaDays).toBe(0);
    });

    it('deve incrementar o streak para 2 em dia civil consecutivo D+1 UTC (INCREMENTED)', () => {
      const existingRecord = {
        id: 'streak-1',
        userId: userAlice.id,
        currentStreak: 1,
        longestStreak: 1,
        lastActivityDate: '2026-03-01',
        createdAt: new Date('2026-03-01T10:00:00Z'),
        updatedAt: new Date('2026-03-01T10:00:00Z'),
      };

      const d2 = new Date('2026-03-02T09:00:00Z');
      const transition = mockStreakService.calculateStreakTransition(existingRecord, d2);

      expect(transition.action).toBe('INCREMENTED');
      expect(transition.currentStreak).toBe(2);
      expect(transition.longestStreak).toBe(2);
      expect(transition.isNewRecord).toBe(true);
      expect(transition.lastActivityDate).toBe('2026-03-02');
    });

    it('deve resetar o streak para 1 após 3 dias sem atividade (RESET)', () => {
      const existingRecord = {
        id: 'streak-1',
        userId: userAlice.id,
        currentStreak: 5,
        longestStreak: 10,
        lastActivityDate: '2026-03-01',
        createdAt: new Date('2026-02-20T10:00:00Z'),
        updatedAt: new Date('2026-03-01T10:00:00Z'),
      };

      const d4 = new Date('2026-03-05T11:00:00Z'); // 4 dias de intervalo (deltaDays = 4)
      const transition = mockStreakService.calculateStreakTransition(existingRecord, d4);

      expect(transition.action).toBe('RESET');
      expect(transition.currentStreak).toBe(1);
      expect(transition.longestStreak).toBe(10); // Recorde histórico é preservado
      expect(transition.deltaDays).toBe(4);
    });
  });

  // =========================================================================
  // 6. Regra Crítica de Questões Anuladas (Separação Oficial vs Pedagógica)
  // =========================================================================
  describe('Regra Crítica de Questões Anuladas (Sprint 9.5.1 / 10.1)', () => {
    it('deve bonificar nota oficial da banca mas excluir anulações e snapshots nulos da acurácia pedagógica', async () => {
      const mockRepo = new MockEducationalAnalyticsRepository();
      const simId = 'sim-annulled-test';

      mockRepo.simulations.push({
        id: simId,
        userId: userAlice.id,
        status: 'COMPLETED',
        scorePercentage: 66.7, // Nota oficial da banca (2 de 3 pontuadas com bonificação)
        correctCount: 2,
        wrongCount: 1,
        finishedAt: new Date('2026-03-01T12:00:00Z'),
        durationSeconds: 300,
      });

      // Questão 1: Regular, o aluno acertou (isAnnulled === false)
      mockRepo.simulationQuestions.push({
        simulationId: simId,
        questionId: 'att-1',
        isAnnulledSnapshot: false,
      });
      mockRepo.questionAttempts.push({
        id: 'att-1',
        userId: userAlice.id,
        simulationId: simId,
        isCorrect: true,
        isAnnulled: false,
        timeSpentSeconds: 60,
        answeredAt: new Date(),
        question: {
          subject: 'Direito Constitucional',
          difficulty: 'MEDIUM',
          topic: 'Direitos Fundamentais',
        },
      });

      // Questão 2: Regular, o aluno errou (isAnnulled === false)
      mockRepo.simulationQuestions.push({
        simulationId: simId,
        questionId: 'att-2',
        isAnnulledSnapshot: false,
      });
      mockRepo.questionAttempts.push({
        id: 'att-2',
        userId: userAlice.id,
        simulationId: simId,
        isCorrect: false,
        isAnnulled: false,
        timeSpentSeconds: 90,
        answeredAt: new Date(),
        question: {
          subject: 'Direito Constitucional',
          difficulty: 'HARD',
          topic: 'Organização do Estado',
        },
      });

      // Questão 3: Anulada pela banca oficial com bonificação geral (isAnnulled === true)
      mockRepo.simulationQuestions.push({
        simulationId: simId,
        questionId: 'att-3',
        isAnnulledSnapshot: true,
      });
      mockRepo.questionAttempts.push({
        id: 'att-3',
        userId: userAlice.id,
        simulationId: simId,
        isCorrect: true, // No domínio oficial, a banca atribui acerto a todos
        isAnnulled: true, // Anulada oficialmente!
        timeSpentSeconds: 40,
        answeredAt: new Date(),
        question: {
          subject: 'Direito Constitucional',
          difficulty: 'HARD',
          topic: 'Processo Legislativo',
        },
      });

      // Questão 4: Sem snapshot de anulação (ausência em simulationQuestions mapeia para isAnnulled: null)
      mockRepo.questionAttempts.push({
        id: 'att-4',
        userId: userAlice.id,
        simulationId: simId,
        isCorrect: true,
        isAnnulled: null, // Ausência de snapshot confiável
        timeSpentSeconds: 50,
        answeredAt: new Date(),
        question: {
          subject: 'Direito Constitucional',
          difficulty: 'MEDIUM',
          topic: 'Poder Judiciário',
        },
      });

      const analyticsService = new EducationalAnalyticsService({
        educationalAnalyticsRepository: mockRepo,
      });

      const stats = await analyticsService.getStudentAnalytics(userAlice.id);

      // Verificação da separação inegociável de contratos:
      // 1. Domínio Oficial do Concurso (somatório das pontuações dos simulados concluídos):
      expect(stats.globalStats.officialTotalPoints).toBe(2.0);

      // 2. Domínio Pedagógico Demonstrado pelo Estudante:
      // Apenas questões regulares comprovadas (isAnnulled === false) são contabilizadas.
      // att-1 (acerto) + att-2 (erro) = 2 questões respondidas pedagogicamente válidas.
      // att-3 (isAnnulled === true) e att-4 (isAnnulled === null) são neutralizadas.
      expect(stats.globalStats.pedagogicalAnsweredQuestions).toBe(2);
      expect(stats.globalStats.pedagogicalCorrectAnswers).toBe(1);
      // 1 acerto em 2 questões regulares = 50.0% de acurácia pedagógica
      expect(stats.globalStats.pedagogicalAccuracyPercentage).toBe(50.0);

      // Na disciplina Direito Constitucional:
      const constSubj = stats.subjectPerformance.find(
        (s) => s.subject === 'Direito Constitucional'
      );
      expect(constSubj).toBeDefined();
      expect(constSubj?.totalAnswered).toBe(2);
      expect(constSubj?.correctCount).toBe(1);
      expect(constSubj?.accuracyPercentage).toBe(50.0);
    });
  });
});
