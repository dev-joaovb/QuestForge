import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { NextFunction, Request, Response } from 'express';
import type { PdfDocument, User, UserSession } from '@prisma/client';
import { createApp } from '../src/app.ts';
import { AuthService } from '../src/services/auth.service.ts';
import { PdfDocumentService } from '../src/services/pdf-document.service.ts';
import { PdfDocumentDomainError } from '../src/types/pdf-document.types.ts';
import { CSRF_HEADER_EXPECTED_VALUE } from '../src/middlewares/csrf.middleware.ts';
import { createMultipartPdfUploadMiddleware } from '../src/middlewares/multipart-pdf.middleware.ts';
import type { CreateUserData, IUserRepository } from '../src/repositories/user.repository.ts';
import type {
  CreateSessionData,
  ISessionRepository,
  SessionWithUser,
} from '../src/repositories/session.repository.ts';
import type {
  CompletePdfExtractionInput,
  CreatePdfDocumentRecordInput,
  FindPdfDocumentsParams,
  IPdfDocumentRepository,
} from '../src/repositories/pdf-document.repository.ts';
import type {
  IObjectStorageService,
  PutPrivateObjectInput,
  StoredPrivateObjectInfo,
} from '../src/services/storage.service.ts';
import type { IAiQuestionExtractionService } from '../src/services/ai-extraction.service.ts';
import { AiExtractionDomainError } from '../src/types/ai-extraction.types.ts';
import type {
  AiQuestionExtractionRequest,
  AiQuestionExtractionResult,
  ExtractedQuestionDraft,
} from '../src/types/ai-extraction.types.ts';
import { buildRealPdfBuffer } from './pdf-document.service.test.ts';

class MockAiQuestionExtractionService implements IAiQuestionExtractionService {
  public available = true;
  public simulateTimeout = false;
  public simulateFailure = false;
  public lastRequest: AiQuestionExtractionRequest | null = null;
  public mockQuestions: ExtractedQuestionDraft[] = [
    {
      originalNumber: 1,
      statement: 'Sobre os princípios constitucionais fundamentais, assinale a alternativa correta.',
      type: 'MULTIPLE_CHOICE',
      subject: 'Direito Constitucional',
      topic: null,
      subtopic: null,
      board: 'CESPE',
      examTitle: 'Concurso Público 2024',
      year: 2024,
      difficulty: null,
      correctAnswer: 'A',
      explanation: null,
      sourcePage: 1,
      sourceDocumentId: null,
      status: 'NEEDS_REVIEW',
      requiresHumanReview: true,
      reviewWarnings: [],
      alternatives: [
        { letter: 'A', text: 'A República Federativa do Brasil rege-se pelo princípio da prevalência dos direitos humanos.', position: 1 },
        { letter: 'B', text: 'A soberania não constitui fundamento da República.', position: 2 },
      ],
    },
  ];

  isAvailable(): boolean {
    return this.available;
  }

  getStatus() {
    return {
      available: this.available,
      providerName: 'mock-ai',
      modelName: this.available ? 'mock-model' : null,
      baseUrl: 'http://mock-ai:11434',
      message: this.available ? 'Mock AI available' : 'Mock AI unavailable',
    };
  }

  async extractQuestionsFromText(
    request: AiQuestionExtractionRequest
  ): Promise<AiQuestionExtractionResult> {
    this.lastRequest = request;

    if (!this.available) {
      throw new AiExtractionDomainError(
        'AI_EXTRACTION_UNAVAILABLE',
        'Extração inteligente indisponível no momento.',
        503
      );
    }

    if (this.simulateTimeout) {
      throw new AiExtractionDomainError(
        'AI_EXTRACTION_TIMEOUT',
        'A extração inteligente excedeu o tempo limite.',
        504
      );
    }

    if (this.simulateFailure) {
      throw new AiExtractionDomainError(
        'AI_EXTRACTION_FAILED',
        'Falha upstream ao comunicar com o provedor de IA.',
        502
      );
    }

    return {
      providerName: 'mock-ai',
      modelName: 'mock-model',
      sourceDocumentId: request.sourceDocumentId ?? null,
      sourceKind: request.sourceKind ?? 'DIGITAL_PDF_TEXT',
      examMetadata: {
        title: request.defaultExamTitle ?? null,
        institution: null,
        board: request.defaultBoard ?? null,
        year: request.defaultYear ?? null,
        position: null,
        description: null,
      },
      questions: this.mockQuestions.map((q) => ({
        ...q,
        subject: request.defaultSubject ?? q.subject,
        board: request.defaultBoard ?? q.board,
        examTitle: request.defaultExamTitle ?? q.examTitle,
        year: request.defaultYear ?? q.year,
        sourceDocumentId: request.sourceDocumentId ?? null,
      })),
      answerKey: [{ questionNumber: 1, correctAnswer: 'A', isAnnulled: false, sourcePage: 1 }],
      totalExtractedQuestions: this.mockQuestions.length,
      questionsNeedingSubject: 0,
      warnings: [],
      extractedAt: new Date('2026-10-13T12:00:00Z'),
    };
  }
}

class InMemoryUserRepository implements IUserRepository {
  public users = new Map<string, User>();

  async findByEmail(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.email === normalized) return user;
    }
    return null;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async create(data: CreateUserData): Promise<User> {
    const now = new Date();
    const user: User = {
      id: `user-${this.users.size + 1}`,
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      passwordHash: data.passwordHash,
      avatarUrl: data.avatarUrl ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    return user;
  }
}

class InMemorySessionRepository implements ISessionRepository {
  public sessions = new Map<string, UserSession>();

  constructor(private readonly userRepo: InMemoryUserRepository) {}

  async create(data: CreateSessionData): Promise<UserSession> {
    const now = new Date();
    const session: UserSession = {
      id: `session-${this.sessions.size + 1}`,
      userId: data.userId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      createdAt: now,
      lastUsedAt: now,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async findByTokenHashWithUser(tokenHash: string): Promise<SessionWithUser | null> {
    for (const session of this.sessions.values()) {
      if (session.tokenHash === tokenHash) {
        const user = await this.userRepo.findById(session.userId);
        if (!user) return null;
        return { ...session, user };
      }
    }
    return null;
  }

  async touchLastUsed(sessionId: string, usedAt: Date): Promise<void> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      this.sessions.set(sessionId, { ...existing, lastUsedAt: usedAt });
    }
  }

  async deleteByTokenHash(tokenHash: string): Promise<boolean> {
    for (const [id, session] of this.sessions.entries()) {
      if (session.tokenHash === tokenHash) {
        this.sessions.delete(id);
        return true;
      }
    }
    return false;
  }

  async deleteById(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async deleteAllForUser(userId: string): Promise<number> {
    let count = 0;
    for (const [id, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.sessions.delete(id);
        count += 1;
      }
    }
    return count;
  }
}

class InMemoryObjectStorage implements IObjectStorageService {
  public objects = new Map<string, Buffer>();
  public simulateMinioUnavailable = false;

  getDefaultBucket(): string {
    return 'questforge-documents';
  }

  async putPrivateObject(input: PutPrivateObjectInput): Promise<StoredPrivateObjectInfo> {
    if (this.simulateMinioUnavailable) {
      throw new PdfDocumentDomainError(
        'STORAGE_UNAVAILABLE',
        'Não foi possível armazenar o arquivo PDF no serviço de objetos privado (MinIO).',
        503
      );
    }
    const bucket = input.bucket ?? this.getDefaultBucket();
    this.objects.set(`${bucket}:${input.objectKey}`, Buffer.from(input.buffer));
    return {
      bucket,
      objectKey: input.objectKey,
      etag: 'etag-http-test',
    };
  }

  async getPrivateObjectBuffer(objectKey: string, bucket?: string): Promise<Buffer> {
    if (this.simulateMinioUnavailable) {
      throw new PdfDocumentDomainError(
        'STORAGE_UNAVAILABLE',
        'Não foi possível recuperar o arquivo PDF no armazenamento privado.',
        503
      );
    }
    const targetBucket = bucket ?? this.getDefaultBucket();
    const found = this.objects.get(`${targetBucket}:${objectKey}`);
    if (!found) {
      throw new PdfDocumentDomainError(
        'STORAGE_UNAVAILABLE',
        'Objeto não encontrado no armazenamento privado.',
        503
      );
    }
    return found;
  }

  async deletePrivateObject(objectKey: string, bucket?: string): Promise<void> {
    if (this.simulateMinioUnavailable) {
      throw new PdfDocumentDomainError(
        'STORAGE_UNAVAILABLE',
        'Não foi possível remover o objeto PDF do armazenamento privado.',
        503
      );
    }
    const targetBucket = bucket ?? this.getDefaultBucket();
    this.objects.delete(`${targetBucket}:${objectKey}`);
  }

  async checkStorageHealth() {
    return {
      status: (this.simulateMinioUnavailable ? 'down' : 'up') as 'up' | 'down',
      bucket: this.getDefaultBucket(),
      message: 'In-memory HTTP test storage',
    };
  }
}

class InMemoryPdfDocumentRepo implements IPdfDocumentRepository {
  public records = new Map<string, PdfDocument>();
  public simulateDbFailure = false;

  async create(data: CreatePdfDocumentRecordInput): Promise<PdfDocument> {
    if (this.simulateDbFailure) {
      throw new Error('Database connection error');
    }
    const now = new Date();
    const id = data.id ?? `doc-${this.records.size + 1}`;
    const doc: PdfDocument = {
      id,
      userId: data.userId,
      examId: data.examId ?? null,
      documentType: data.documentType ?? 'EXAM',
      originalName: data.originalName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      storageBucket: data.storageBucket,
      objectKey: data.objectKey,
      checksumSha256: data.checksumSha256,
      status: data.status ?? 'UPLOADED',
      pageCount: null,
      extractedText: null,
      extractedCharCount: null,
      requiresOcr: false,
      errorMessage: null,
      processedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(id, doc);
    return doc;
  }

  async findById(id: string): Promise<PdfDocument | null> {
    if (this.simulateDbFailure) {
      throw new Error('Database connection error');
    }
    return this.records.get(id) ?? null;
  }

  async findManyByUser(userId: string): Promise<PdfDocument[]> {
    if (this.simulateDbFailure) {
      throw new Error('Database connection error');
    }
    return Array.from(this.records.values()).filter((r) => r.userId === userId);
  }

  async findManyPaginated(
    params: FindPdfDocumentsParams
  ): Promise<{ items: PdfDocument[]; total: number }> {
    if (this.simulateDbFailure) {
      throw new Error('Database connection error');
    }
    const filtered = Array.from(this.records.values())
      .filter((r) => {
        if (r.userId !== params.userId) return false;
        if (params.status && r.status !== params.status) return false;
        return true;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = filtered.length;
    const start = (params.page - 1) * params.limit;
    const items = filtered.slice(start, start + params.limit);
    return { items, total };
  }

  async markProcessing(id: string): Promise<PdfDocument> {
    const existing = this.records.get(id)!;
    const updated: PdfDocument = {
      ...existing,
      status: 'PROCESSING',
      errorMessage: null,
      updatedAt: new Date(),
    };
    this.records.set(id, updated);
    return updated;
  }

  async tryAcquireOcrProcessing(
    id: string,
    allowedStatuses: readonly PdfDocument['status'][] = ['NEEDS_OCR', 'FAILED']
  ): Promise<boolean> {
    if (this.simulateDbFailure) {
      throw new Error('Database connection error');
    }
    const existing = this.records.get(id);
    if (!existing || !allowedStatuses.includes(existing.status)) {
      return false;
    }
    this.records.set(id, {
      ...existing,
      status: 'PROCESSING',
      errorMessage: null,
      updatedAt: new Date(),
    });
    return true;
  }

  async markExtractionCompleted(
    id: string,
    data: CompletePdfExtractionInput
  ): Promise<PdfDocument> {
    const existing = this.records.get(id)!;
    const updated: PdfDocument = {
      ...existing,
      status: data.status,
      pageCount: data.pageCount,
      extractedText: data.extractedText,
      extractedCharCount: data.extractedCharCount,
      requiresOcr: data.requiresOcr,
      errorMessage: null,
      processedAt: data.processedAt,
      updatedAt: new Date(),
    };
    this.records.set(id, updated);
    return updated;
  }

  async markFailed(
    id: string,
    sanitizedErrorMessage: string,
    processedAt: Date
  ): Promise<PdfDocument> {
    const existing = this.records.get(id)!;
    const updated: PdfDocument = {
      ...existing,
      status: 'FAILED',
      errorMessage: sanitizedErrorMessage,
      processedAt,
      updatedAt: new Date(),
    };
    this.records.set(id, updated);
    return updated;
  }

  async deleteById(id: string): Promise<void> {
    if (this.simulateDbFailure) {
      throw new Error('Database connection error');
    }
    this.records.delete(id);
  }
}

describe('Rotas HTTP de Documentos PDF — /api/documents (backend/tests/pdf-document.routes.test.ts)', () => {
  const TEST_SECRET = 'test_session_secret_with_at_least_32_characters_long_999';
  const ALLOWED_ORIGIN = 'http://localhost:3000';
  const MAX_TEST_FILE_BYTES = 4096; // 4 KB para testar rejeição de tamanho excedido com rapidez

  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let storage: InMemoryObjectStorage;
  let pdfRepo: InMemoryPdfDocumentRepo;
  let authService: AuthService;
  let pdfDocumentService: PdfDocumentService;
  let app: ReturnType<typeof createApp>;

  let cookieUserA: string;
  let cookieUserB: string;
  let userAId: string;

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository(userRepo);
    storage = new InMemoryObjectStorage();
    pdfRepo = new InMemoryPdfDocumentRepo();

    authService = new AuthService({
      userRepository: userRepo,
      sessionRepository: sessionRepo,
      sessionSecret: TEST_SECRET,
      sessionTtlMs: 60 * 60 * 1000,
    });

    pdfDocumentService = new PdfDocumentService({
      pdfDocumentRepository: pdfRepo,
      storageService: storage,
      maxFileSizeBytes: MAX_TEST_FILE_BYTES,
      maxPages: 5,
      extractionTimeoutMs: 10000,
    });

    app = createApp({
      csrf: { allowedOrigins: [ALLOWED_ORIGIN] },
      auth: {
        authService,
        nodeEnv: 'test',
        rateLimit: { windowMs: 60 * 1000, maxAttempts: 50 },
      },
      documents: {
        authService,
        pdfDocumentService,
        multipartOptions: {
          maxFileSizeBytes: MAX_TEST_FILE_BYTES,
          maxFiles: 1,
          maxFields: 10,
        },
      },
    });

    const regA = await request(app)
      .post('/api/auth/register')
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .send({
        name: 'Candidata A',
        email: 'candidata.a@questforge.dev',
        password: 'StrongPassword123',
      });
    cookieUserA = regA.headers['set-cookie'][0];
    userAId = regA.body.user.id;

    const regB = await request(app)
      .post('/api/auth/register')
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .send({
        name: 'Candidato B',
        email: 'candidato.b@questforge.dev',
        password: 'StrongPassword123',
      });
    cookieUserB = regB.headers['set-cookie'][0];
  });

  it('deve rejeitar requisições sem autenticação (401) e operações mutáveis sem cabeçalho CSRF (403)', async () => {
    const validPdf = buildRealPdfBuffer({
      pageTexts: ['Questao 1 sobre Seguranca da Informacao e Criptografia.'],
    });

    // 1. Sem cookie de sessão -> 401 em todas as rotas
    const unauthGet = await request(app).get('/api/documents');
    expect(unauthGet.status).toBe(401);

    const unauthGetById = await request(app).get('/api/documents/doc-1');
    expect(unauthGetById.status).toBe(401);

    const unauthPost = await request(app)
      .post('/api/documents')
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .attach('file', validPdf, {
        filename: 'prova.pdf',
        contentType: 'application/pdf',
      });
    expect(unauthPost.status).toBe(401);

    const unauthDelete = await request(app)
      .delete('/api/documents/doc-1')
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE);
    expect(unauthDelete.status).toBe(401);

    // 2. Com cookie de sessão mas sem cabeçalho CSRF em POST e DELETE -> 403
    const noCsrfPost = await request(app)
      .post('/api/documents')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieUserA)
      .attach('file', validPdf, {
        filename: 'prova.pdf',
        contentType: 'application/pdf',
      });
    expect(noCsrfPost.status).toBe(403);
    expect(noCsrfPost.body.error).toBe('CsrfValidationFailed');

    const noCsrfDelete = await request(app)
      .delete('/api/documents/doc-1')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieUserA);
    expect(noCsrfDelete.status).toBe(403);
    expect(noCsrfDelete.body.error).toBe('CsrfValidationFailed');
  });

  it('deve realizar upload válido (201), ignorar userId forjado, persistir texto no banco e omitir extractedText, objectKey e storageBucket nas respostas HTTP', async () => {
    const validPdf = buildRealPdfBuffer({
      pageTexts: [
        'Questao 10 - No protocolo HTTP, o status 201 indica criacao de recurso.',
      ],
    });

    const uploadRes = await request(app)
      .post('/api/documents')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieUserA)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .field('userId', 'hacker-forged-user-id')
      .attach('file', validPdf, {
        filename: '../../caderno_prova_redes.pdf',
        contentType: 'application/pdf',
      });

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.document.userId).toBe(userAId);
    expect(uploadRes.body.document.originalName).toBe('caderno_prova_redes.pdf');
    expect(uploadRes.body.document.status).toBe('COMPLETED');
    expect(uploadRes.body.document.requiresOcr).toBe(false);
    expect(uploadRes.body.document.pageCount).toBe(1);
    expect(uploadRes.body.document.extractedCharCount).toBeGreaterThan(30);

    // Garante que extractedText, objectKey, storageBucket e URLs nunca são expostos nas respostas HTTP padrão
    expect(uploadRes.body.document.extractedText).toBeUndefined();
    expect(uploadRes.body.document.objectKey).toBeUndefined();
    expect(uploadRes.body.document.storageBucket).toBeUndefined();
    expect(uploadRes.body.document.url).toBeUndefined();

    // Confirma que o texto extraído foi efetivamente persistido no banco de dados para as próximas etapas
    const persistedInDb = await pdfRepo.findById(uploadRes.body.document.id);
    expect(persistedInDb?.extractedText).toContain('Questao 10');
  });

  it('deve rejeitar arquivo inválido (HTML disfarçado, PDF truncado, falta de arquivo ou múltiplos arquivos) com 400 e tamanho excedido com 413', async () => {
    // 1. HTML disfarçado de PDF -> 400
    const fakePdf = Buffer.from('<html><body>Arquivo falso</body></html>', 'utf8');
    const fakeRes = await request(app)
      .post('/api/documents')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieUserA)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .attach('file', fakePdf, {
        filename: 'falso.pdf',
        contentType: 'application/pdf',
      });
    expect(fakeRes.status).toBe(400);
    expect(fakeRes.body.error).toBe('PDF_VALIDATION_ERROR');

    // 2. PDF truncado sem %%EOF -> 400
    const truncatedPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n', 'latin1');
    const truncRes = await request(app)
      .post('/api/documents')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieUserA)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .attach('file', truncatedPdf, {
        filename: 'truncado.pdf',
        contentType: 'application/pdf',
      });
    expect(truncRes.status).toBe(400);
    expect(truncRes.body.error).toBe('PDF_VALIDATION_ERROR');

    // 3. Múltiplos arquivos na mesma requisição multipart -> 400
    const validPdf = buildRealPdfBuffer({
      pageTexts: ['Questao valida sobre sistemas operacionais.'],
    });
    const multiRes = await request(app)
      .post('/api/documents')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieUserA)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .attach('file', validPdf, {
        filename: 'um.pdf',
        contentType: 'application/pdf',
      })
      .attach('file', validPdf, {
        filename: 'dois.pdf',
        contentType: 'application/pdf',
      });
    expect(multiRes.status).toBe(400);
    expect(multiRes.body.error).toBe('PDF_VALIDATION_ERROR');
    expect(multiRes.body.message).toMatch(/Apenas 1 arquivo PDF/i);

    // 4. Arquivo excedendo maxFileSizeBytes (4096 bytes nos testes) -> 413 PDF_TOO_LARGE
    const oversizedPdf = Buffer.concat([
      validPdf,
      Buffer.alloc(MAX_TEST_FILE_BYTES + 512, 0x20),
    ]);
    const largeRes = await request(app)
      .post('/api/documents')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieUserA)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .attach('file', oversizedPdf, {
        filename: 'muito_grande.pdf',
        contentType: 'application/pdf',
      });
    expect(largeRes.status).toBe(413);
    expect(largeRes.body.error).toBe('PDF_TOO_LARGE');
  });

  it('deve paginar listagem de documentos do usuário autenticado, garantir isolamento contra acesso de terceiros (403) e excluir com autorização', async () => {
    const pdf1 = buildRealPdfBuffer({
      pageTexts: ['Documento 1 com texto suficiente para extração digital completa.'],
    });
    const pdf2 = buildRealPdfBuffer({
      pageTexts: [''], // sem texto -> NEEDS_OCR
    });
    const pdf3 = buildRealPdfBuffer({
      pageTexts: ['Documento 3 com texto suficiente para extração digital completa.'],
    });

    const up1 = await request(app)
      .post('/api/documents')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieUserA)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .attach('file', pdf1, { filename: 'doc1.pdf', contentType: 'application/pdf' });
    const doc1Id = up1.body.document.id;

    await request(app)
      .post('/api/documents')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieUserA)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .attach('file', pdf2, { filename: 'doc2_ocr.pdf', contentType: 'application/pdf' });

    await request(app)
      .post('/api/documents')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieUserA)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .attach('file', pdf3, { filename: 'doc3.pdf', contentType: 'application/pdf' });

    // 1. Paginação (page=1, limit=2) para Usuário A -> 3 documentos no total, 2 páginas
    const page1Res = await request(app)
      .get('/api/documents?page=1&limit=2')
      .set('Cookie', cookieUserA);
    expect(page1Res.status).toBe(200);
    expect(page1Res.body.items).toHaveLength(2);
    expect(page1Res.body.total).toBe(3);
    expect(page1Res.body.currentPage).toBe(1);
    expect(page1Res.body.totalPages).toBe(2);
    expect(page1Res.body.limit).toBe(2);
    // Listagem não inclui extractedText nem objectKey
    expect(page1Res.body.items[0].extractedText).toBeUndefined();
    expect(page1Res.body.items[0].objectKey).toBeUndefined();

    // 2. Filtro por status=NEEDS_OCR
    const ocrFilterRes = await request(app)
      .get('/api/documents?status=NEEDS_OCR')
      .set('Cookie', cookieUserA);
    expect(ocrFilterRes.status).toBe(200);
    expect(ocrFilterRes.body.total).toBe(1);
    expect(ocrFilterRes.body.items[0].originalName).toBe('doc2_ocr.pdf');

    // 3. Isolamento: Usuário B vê 0 documentos na listagem e recebe 403 ao consultar/excluir doc1Id
    const listBRes = await request(app)
      .get('/api/documents')
      .set('Cookie', cookieUserB);
    expect(listBRes.status).toBe(200);
    expect(listBRes.body.total).toBe(0);
    expect(listBRes.body.items).toHaveLength(0);

    const getForbiddenRes = await request(app)
      .get(`/api/documents/${doc1Id}`)
      .set('Cookie', cookieUserB);
    expect(getForbiddenRes.status).toBe(403);
    expect(getForbiddenRes.body.error).toBe('DOCUMENT_FORBIDDEN');

    const deleteForbiddenRes = await request(app)
      .delete(`/api/documents/${doc1Id}`)
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieUserB)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE);
    expect(deleteForbiddenRes.status).toBe(403);
    expect(deleteForbiddenRes.body.error).toBe('DOCUMENT_FORBIDDEN');

    // 4. Consulta de detalhes autorizada ao proprietário (Usuário A) -> 200 (sem extractedText nem objectKey)
    const getOwnerRes = await request(app)
      .get(`/api/documents/${doc1Id}`)
      .set('Cookie', cookieUserA);
    expect(getOwnerRes.status).toBe(200);
    expect(getOwnerRes.body.document.id).toBe(doc1Id);
    expect(getOwnerRes.body.document.status).toBe('COMPLETED');
    expect(getOwnerRes.body.document.extractedCharCount).toBeGreaterThan(20);
    expect(getOwnerRes.body.document.extractedText).toBeUndefined();
    expect(getOwnerRes.body.document.objectKey).toBeUndefined();

    // 5. Exclusão autorizada pelo proprietário (Usuário A) -> 200
    const deleteOwnerRes = await request(app)
      .delete(`/api/documents/${doc1Id}`)
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieUserA)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE);
    expect(deleteOwnerRes.status).toBe(200);

    const getAfterDeleteRes = await request(app)
      .get(`/api/documents/${doc1Id}`)
      .set('Cookie', cookieUserA);
    expect(getAfterDeleteRes.status).toBe(404);
  });

  it('deve retornar 503 sem declarar falso sucesso quando MinIO ou PostgreSQL estiverem indisponíveis', async () => {
    const validPdf = buildRealPdfBuffer({
      pageTexts: ['Questao sobre alta disponibilidade e tolerancia a falhas.'],
    });

    // 1. MinIO indisponível no upload -> 503 STORAGE_UNAVAILABLE
    storage.simulateMinioUnavailable = true;
    const minioDownUpload = await request(app)
      .post('/api/documents')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieUserA)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .attach('file', validPdf, { filename: 'prova.pdf', contentType: 'application/pdf' });
    expect(minioDownUpload.status).toBe(503);
    expect(minioDownUpload.body.error).toBe('STORAGE_UNAVAILABLE');
    expect(pdfRepo.records.size).toBe(0);

    // 2. PostgreSQL indisponível no upload -> 503 ServiceUnavailable e limpa objeto órfão no MinIO
    storage.simulateMinioUnavailable = false;
    pdfRepo.simulateDbFailure = true;
    const dbDownUpload = await request(app)
      .post('/api/documents')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieUserA)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .attach('file', validPdf, { filename: 'prova.pdf', contentType: 'application/pdf' });
    expect(dbDownUpload.status).toBe(503);
    expect(dbDownUpload.body.error).toBe('ServiceUnavailable');
    expect(storage.objects.size).toBe(0);

    // 3. PostgreSQL indisponível na listagem -> 503 ServiceUnavailable
    const dbDownList = await request(app)
      .get('/api/documents')
      .set('Cookie', cookieUserA);
    expect(dbDownList.status).toBe(503);
    expect(dbDownList.body.error).toBe('ServiceUnavailable');
  });

  it('deve responder 413 imediatamente durante a leitura da stream sem aguardar end e liberar buffers em desconexões prematuras (aborted/close)', () => {
    const middleware = createMultipartPdfUploadMiddleware({
      maxFileSizeBytes: 1024, // 1 KB (+ 64 KB de envelope = 66560 bytes de maxStreamBytes)
      maxFiles: 1,
    });

    // Cenário 1: Stream excede maxStreamBytes durante o evento 'data' -> responde 413 imediatamente ANTES de 'end'
    const fakeReqOverflow = Object.assign(new EventEmitter(), {
      headers: {
        'content-type': 'multipart/form-data; boundary=---TestBoundary123',
      },
      complete: false,
      pauseCalled: false,
      resumeCalled: false,
      pause() {
        this.pauseCalled = true;
      },
      resume() {
        this.resumeCalled = true;
      },
    }) as unknown as Request & EventEmitter & { pauseCalled: boolean; resumeCalled: boolean };

    let statusSet = 0;
    let jsonPayload: unknown = null;
    let jsonCallCount = 0;

    const fakeResOverflow: {
      headersSent: boolean;
      writableEnded: boolean;
      status: (code: number) => unknown;
      json: (payload: unknown) => unknown;
    } = {
      headersSent: false,
      writableEnded: false,
      status(code: number) {
        statusSet = code;
        return fakeResOverflow;
      },
      json(payload: unknown) {
        jsonCallCount += 1;
        jsonPayload = payload;
        fakeResOverflow.headersSent = true;
        fakeResOverflow.writableEnded = true;
        return fakeResOverflow;
      },
    };

    let nextCalledOverflow = false;
    middleware(
      fakeReqOverflow,
      fakeResOverflow as unknown as Response,
      (() => {
        nextCalledOverflow = true;
      }) as NextFunction
    );

    // Envia chunk de 70 KB (> 1 KB + 64 KB) sem disparar 'end'
    fakeReqOverflow.emit('data', Buffer.alloc(70 * 1024, 0x41));

    // A resposta 413 já deve ter sido enviada imediatamente durante o evento 'data'
    expect(statusSet).toBe(413);
    expect(jsonPayload).toMatchObject({ error: 'PDF_TOO_LARGE' });
    expect(jsonCallCount).toBe(1);
    expect(fakeReqOverflow.pauseCalled).toBe(true);

    // Mesmo que 'end' ou 'close' ocorram depois, nenhuma resposta duplicada é enviada
    fakeReqOverflow.emit('end');
    fakeReqOverflow.emit('close');
    expect(jsonCallCount).toBe(1);
    expect(nextCalledOverflow).toBe(false);

    // Cenário 2: Cliente desconecta prematuramente ('aborted' + 'close') antes de 'end'
    const fakeReqAborted = Object.assign(new EventEmitter(), {
      headers: {
        'content-type': 'multipart/form-data; boundary=---TestBoundary123',
      },
      complete: false,
    }) as unknown as Request & EventEmitter;

    let abortedResCount = 0;
    const fakeResAborted = {
      headersSent: false,
      writableEnded: false,
      status() {
        return this;
      },
      json() {
        abortedResCount += 1;
        return this;
      },
    } as unknown as Response;

    let nextCalledAborted = false;
    middleware(fakeReqAborted, fakeResAborted, (() => {
      nextCalledAborted = true;
    }) as NextFunction);

    fakeReqAborted.emit('data', Buffer.from('chunk-parcial'));
    fakeReqAborted.emit('aborted');
    fakeReqAborted.emit('close');
    // Mesmo que um evento tardio ocorra, listeners foram removidos e nenhuma resposta é enviada na conexão morta
    fakeReqAborted.emit('end');
    expect(abortedResCount).toBe(0);
    expect(nextCalledAborted).toBe(false);
    expect(fakeReqAborted.listenerCount('data')).toBe(0);
    expect(fakeReqAborted.listenerCount('end')).toBe(0);
  });

  it('deve proteger POST /api/documents/:id/ocr com autenticação, CSRF, isolamento por usuário (403) e retornar 503 OCR_UNAVAILABLE preservando NEEDS_OCR quando OCR não estiver configurado', async () => {
    const scannedPdf = buildRealPdfBuffer({
      pageTexts: [''], // sem camada de texto digital -> NEEDS_OCR
    });

    const uploadRes = await request(app)
      .post('/api/documents')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieUserA)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .attach('file', scannedPdf, {
        filename: 'escaneado_http_ocr.pdf',
        contentType: 'application/pdf',
      });

    expect(uploadRes.status).toBe(201);
    const scannedDocId = uploadRes.body.document.id;
    expect(uploadRes.body.document.status).toBe('NEEDS_OCR');
    expect(uploadRes.body.document.requiresOcr).toBe(true);

    // 1. Sem autenticação -> 401
    const unauthOcr = await request(app)
      .post(`/api/documents/${scannedDocId}/ocr`)
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE);
    expect(unauthOcr.status).toBe(401);

    // 2. Sem cabeçalho CSRF -> 403 CsrfValidationFailed
    const noCsrfOcr = await request(app)
      .post(`/api/documents/${scannedDocId}/ocr`)
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieUserA);
    expect(noCsrfOcr.status).toBe(403);
    expect(noCsrfOcr.body.error).toBe('CsrfValidationFailed');

    // 3. Outro usuário tentando acionar OCR no documento de User A -> 403 DOCUMENT_FORBIDDEN
    const forbiddenOcr = await request(app)
      .post(`/api/documents/${scannedDocId}/ocr`)
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieUserB)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE);
    expect(forbiddenOcr.status).toBe(403);
    expect(forbiddenOcr.body.error).toBe('DOCUMENT_FORBIDDEN');

    // 4. Proprietário (User A) aciona OCR sem provedor configurado -> 503 OCR_UNAVAILABLE
    const unavailableOcr = await request(app)
      .post(`/api/documents/${scannedDocId}/ocr`)
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieUserA)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE);
    expect(unavailableOcr.status).toBe(503);
    expect(unavailableOcr.body.error).toBe('OCR_UNAVAILABLE');

    // 5. Confirma que o documento permanece intacto em NEEDS_OCR e sem vazar extractedText/objectKey
    const detailAfterOcr = await request(app)
      .get(`/api/documents/${scannedDocId}`)
      .set('Cookie', cookieUserA);
    expect(detailAfterOcr.status).toBe(200);
    expect(detailAfterOcr.body.document.status).toBe('NEEDS_OCR');
    expect(detailAfterOcr.body.document.requiresOcr).toBe(true);
    expect(detailAfterOcr.body.document.extractedText).toBeUndefined();
    expect(detailAfterOcr.body.document.objectKey).toBeUndefined();
  });

  it('deve classificar conflitos em POST /api/documents/:id/ocr: 409 DOCUMENT_ALREADY_PROCESSING em PROCESSING, 409 DOCUMENT_INVALID_OCR_STATE em estado incompatível (COMPLETED) e 503 em falha de infraestrutura', async () => {
    const { ConfigurableOcrService } = await import('../src/services/ocr.service.ts');
    const configuredOcrService = new PdfDocumentService({
      pdfDocumentRepository: pdfRepo,
      storageService: storage,
      ocrService: new ConfigurableOcrService({
        providerName: 'http-test-ocr',
        recognizer: async (page) => ({
          pageNumber: page.pageNumber,
          text: 'Texto reconhecido com sucesso.',
        }),
      }),
    });

    const configuredOcrApp = createApp({
      csrf: { allowedOrigins: [ALLOWED_ORIGIN] },
      auth: {
        authService,
        nodeEnv: 'test',
        rateLimit: { windowMs: 60 * 1000, maxAttempts: 50 },
      },
      documents: {
        authService,
        pdfDocumentService: configuredOcrService,
        multipartOptions: {
          maxFileSizeBytes: MAX_TEST_FILE_BYTES,
          maxFiles: 1,
          maxFields: 10,
        },
      },
    });

    // 1. Documento em PROCESSING -> 409 DOCUMENT_ALREADY_PROCESSING
    const scannedPdf = buildRealPdfBuffer({
      pageTexts: [''],
    });

    const uploadRes = await request(configuredOcrApp)
      .post('/api/documents')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieUserA)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .attach('file', scannedPdf, {
        filename: 'conflito_409_ocr.pdf',
        contentType: 'application/pdf',
      });

    expect(uploadRes.status).toBe(201);
    const docId = uploadRes.body.document.id;

    await pdfRepo.markProcessing(docId);

    const conflictRes = await request(configuredOcrApp)
      .post(`/api/documents/${docId}/ocr`)
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieUserA)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE);

    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.error).toBe('DOCUMENT_ALREADY_PROCESSING');

    // 2. Documento em estado incompatível (COMPLETED) -> 409 DOCUMENT_INVALID_OCR_STATE
    const digitalPdf = buildRealPdfBuffer({
      pageTexts: ['Questao digital completa que nao necessita de processamento OCR.'],
    });

    const completedUploadRes = await request(configuredOcrApp)
      .post('/api/documents')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieUserA)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .attach('file', digitalPdf, {
        filename: 'digital_completo.pdf',
        contentType: 'application/pdf',
      });

    expect(completedUploadRes.status).toBe(201);
    expect(completedUploadRes.body.document.status).toBe('COMPLETED');
    const completedDocId = completedUploadRes.body.document.id;

    const invalidStateRes = await request(configuredOcrApp)
      .post(`/api/documents/${completedDocId}/ocr`)
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieUserA)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE);

    expect(invalidStateRes.status).toBe(409);
    expect(invalidStateRes.body.error).toBe('DOCUMENT_INVALID_OCR_STATE');

    // 3. Falha de infraestrutura no banco não é mascarada como 409 -> retorna 503 ServiceUnavailable
    pdfRepo.simulateDbFailure = true;
    const dbFailureRes = await request(configuredOcrApp)
      .post(`/api/documents/${docId}/ocr`)
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieUserA)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE);

    expect(dbFailureRes.status).toBe(503);
    expect(dbFailureRes.body.error).toBe('ServiceUnavailable');
  });

  describe('Sprint 4, Etapa 4.3 — Extração Inteligente via POST /api/documents/:id/extract', () => {
    let mockAiService: MockAiQuestionExtractionService;
    let appWithAi: ReturnType<typeof createApp>;

    beforeEach(() => {
      mockAiService = new MockAiQuestionExtractionService();
      appWithAi = createApp({
        csrf: { allowedOrigins: [ALLOWED_ORIGIN] },
        auth: {
          authService,
          nodeEnv: 'test',
          rateLimit: { windowMs: 60 * 1000, maxAttempts: 50 },
        },
        documents: {
          authService,
          pdfDocumentService,
          aiExtractionService: mockAiService,
          multipartOptions: {
            maxFileSizeBytes: MAX_TEST_FILE_BYTES,
            maxFiles: 1,
            maxFields: 10,
          },
        },
      });
    });

    it('deve exigir autenticação (401 Unauthorized) em POST /api/documents/:id/extract', async () => {
      const response = await request(appWithAi)
        .post('/api/documents/doc-1/extract')
        .set('Origin', ALLOWED_ORIGIN)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({});

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });

    it('deve exigir proteção CSRF (403 CsrfValidationFailed) em POST /api/documents/:id/extract', async () => {
      const response = await request(appWithAi)
        .post('/api/documents/doc-1/extract')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', cookieUserA)
        .send({});

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('CsrfValidationFailed');
    });

    it('deve rejeitar corpo com parâmetros proibidos como timeoutMs com 400 PDF_VALIDATION_ERROR', async () => {
      const response = await request(appWithAi)
        .post('/api/documents/doc-1/extract')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', cookieUserA)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({
          timeoutMs: 5000, // cliente não pode definir timeout
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('PDF_VALIDATION_ERROR');
      expect(response.body.message).toContain('timeoutMs');
    });

    it('deve rejeitar corpo com parâmetros inválidos (maxQuestions negativo, ano fora dos limites)', async () => {
      const invalidNumberRes = await request(appWithAi)
        .post('/api/documents/doc-1/extract')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', cookieUserA)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({
          maxQuestions: -1,
        });

      expect(invalidNumberRes.status).toBe(400);
      expect(invalidNumberRes.body.error).toBe('PDF_VALIDATION_ERROR');

      const invalidYearRes = await request(appWithAi)
        .post('/api/documents/doc-1/extract')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', cookieUserA)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({
          defaultYear: 1800,
        });

      expect(invalidYearRes.status).toBe(400);
      expect(invalidYearRes.body.error).toBe('PDF_VALIDATION_ERROR');
    });

    it('deve retornar 404 DOCUMENT_NOT_FOUND para documento inexistente', async () => {
      const response = await request(appWithAi)
        .post('/api/documents/doc-nao-existe-123/extract')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', cookieUserA)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({});

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('DOCUMENT_NOT_FOUND');
    });

    it('deve garantir isolamento multi-tenant (403 DOCUMENT_FORBIDDEN) se usuário tentar extrair PDF de outro usuário', async () => {
      const digitalPdf = buildRealPdfBuffer({
        pageTexts: ['Texto digital da candidata A'],
      });

      const uploadRes = await request(appWithAi)
        .post('/api/documents')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', cookieUserA)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .attach('file', digitalPdf, {
          filename: 'privado_a.pdf',
          contentType: 'application/pdf',
        });

      expect(uploadRes.status).toBe(201);
      const docAId = uploadRes.body.document.id;

      // Usuário B tenta acionar extração do PDF do Usuário A
      const forbiddenRes = await request(appWithAi)
        .post(`/api/documents/${docAId}/extract`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', cookieUserB)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({});

      expect(forbiddenRes.status).toBe(403);
      expect(forbiddenRes.body.error).toBe('DOCUMENT_FORBIDDEN');
    });

    it('deve rejeitar extração de documento em estado incompatível (PROCESSING: 409, NEEDS_OCR: 422, SEM TEXTO: 422, FAILED: 422)', async () => {
      const digitalPdf = buildRealPdfBuffer({
        pageTexts: ['Texto de prova inicial'],
      });

      const uploadRes = await request(appWithAi)
        .post('/api/documents')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', cookieUserA)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .attach('file', digitalPdf, {
          filename: 'estados_teste.pdf',
          contentType: 'application/pdf',
        });

      expect(uploadRes.status).toBe(201);
      const docId = uploadRes.body.document.id;

      // 1. Em PROCESSING -> 409 DOCUMENT_ALREADY_PROCESSING
      await pdfRepo.markProcessing(docId);
      const processingRes = await request(appWithAi)
        .post(`/api/documents/${docId}/extract`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', cookieUserA)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({});
      expect(processingRes.status).toBe(409);
      expect(processingRes.body.error).toBe('DOCUMENT_ALREADY_PROCESSING');

      // 2. Em NEEDS_OCR -> 422 DOCUMENT_NEEDS_OCR
      await pdfRepo.markExtractionCompleted(docId, {
        status: 'NEEDS_OCR',
        pageCount: 1,
        extractedText: null,
        extractedCharCount: 0,
        requiresOcr: true,
        processedAt: new Date(),
      });
      const ocrRes = await request(appWithAi)
        .post(`/api/documents/${docId}/extract`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', cookieUserA)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({});
      expect(ocrRes.status).toBe(422);
      expect(ocrRes.body.error).toBe('DOCUMENT_NEEDS_OCR');

      // 3. Em COMPLETED mas sem texto -> 422 DOCUMENT_NO_TEXT
      await pdfRepo.markExtractionCompleted(docId, {
        status: 'COMPLETED',
        pageCount: 1,
        extractedText: '   ',
        extractedCharCount: 0,
        requiresOcr: false,
        processedAt: new Date(),
      });
      const noTextRes = await request(appWithAi)
        .post(`/api/documents/${docId}/extract`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', cookieUserA)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({});
      expect(noTextRes.status).toBe(422);
      expect(noTextRes.body.error).toBe('DOCUMENT_NO_TEXT');

      // 4. Em FAILED -> 422 PDF_EXTRACTION_FAILED
      await pdfRepo.markFailed(docId, 'Falha fatal prévia no processamento', new Date());
      const failedRes = await request(appWithAi)
        .post(`/api/documents/${docId}/extract`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', cookieUserA)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({});
      expect(failedRes.status).toBe(422);
      expect(failedRes.body.error).toBe('PDF_EXTRACTION_FAILED');
    });

    it('deve extrair questões com sucesso (200 OK) sobre PDF elegível, repassando contexto e retornando rascunhos sem persistir', async () => {
      const digitalPdf = buildRealPdfBuffer({
        pageTexts: ['Texto de prova digital completo para extração por IA'],
      });

      const uploadRes = await request(appWithAi)
        .post('/api/documents')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', cookieUserA)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .attach('file', digitalPdf, {
          filename: 'prova_elegivel.pdf',
          contentType: 'application/pdf',
        });

      expect(uploadRes.status).toBe(201);
      const docId = uploadRes.body.document.id;

      const extractRes = await request(appWithAi)
        .post(`/api/documents/${docId}/extract`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', cookieUserA)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({
          defaultSubject: 'Direito Constitucional',
          defaultBoard: 'CESPE',
          defaultExamTitle: 'Tribunal Regional Federal',
          defaultYear: 2024,
          maxQuestions: 20,
        });

      expect(extractRes.status).toBe(200);
      expect(extractRes.body.extraction).toBeDefined();
      expect(extractRes.body.extraction.providerName).toBe('mock-ai');
      expect(extractRes.body.extraction.modelName).toBe('mock-model');
      expect(extractRes.body.extraction.sourceDocumentId).toBe(docId);
      expect(extractRes.body.extraction.totalExtractedQuestions).toBe(1);
      expect(Array.isArray(extractRes.body.extraction.questions)).toBe(true);
      expect(extractRes.body.extraction.questions[0].requiresHumanReview).toBe(true);
      expect(extractRes.body.extraction.questions[0].status).toBe('NEEDS_REVIEW');
      expect(extractRes.body.extraction.questions[0].subject).toBe('Direito Constitucional');
      expect(extractRes.body.extraction.questions[0].board).toBe('CESPE');
      expect(extractRes.body.extraction.questions[0].year).toBe(2024);

      // Garante que o adapter/service recebeu os parâmetros contextuais
      expect(mockAiService.lastRequest?.sourceDocumentId).toBe(docId);
      expect(mockAiService.lastRequest?.defaultSubject).toBe('Direito Constitucional');
      expect(mockAiService.lastRequest?.defaultBoard).toBe('CESPE');
      expect(mockAiService.lastRequest?.maxQuestions).toBe(20);
    });

    it('deve retornar 503 AI_EXTRACTION_UNAVAILABLE quando a IA estiver indisponível ou desconfigurada', async () => {
      // 1. Com app padrão sem provedor de IA (UnconfiguredAiQuestionExtractionService)
      const digitalPdf = buildRealPdfBuffer({
        pageTexts: ['Texto de prova digital completo'],
      });

      const uploadRes = await request(app)
        .post('/api/documents')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', cookieUserA)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .attach('file', digitalPdf, {
          filename: 'prova_unconfigured.pdf',
          contentType: 'application/pdf',
        });

      expect(uploadRes.status).toBe(201);
      const docId = uploadRes.body.document.id;

      const unconfiguredRes = await request(app)
        .post(`/api/documents/${docId}/extract`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', cookieUserA)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({});

      expect(unconfiguredRes.status).toBe(503);
      expect(unconfiguredRes.body.error).toBe('AI_EXTRACTION_UNAVAILABLE');

      // 2. Com mockAiService marcado como indisponível
      mockAiService.available = false;
      const unavailableRes = await request(appWithAi)
        .post(`/api/documents/${docId}/extract`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', cookieUserA)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({});

      expect(unavailableRes.status).toBe(503);
      expect(unavailableRes.body.error).toBe('AI_EXTRACTION_UNAVAILABLE');
    });

    it('deve propagar timeout da IA como 504 AI_EXTRACTION_TIMEOUT e falha upstream como 502 AI_EXTRACTION_FAILED', async () => {
      const digitalPdf = buildRealPdfBuffer({
        pageTexts: ['Texto de prova para testar timeout'],
      });

      const uploadRes = await request(appWithAi)
        .post('/api/documents')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', cookieUserA)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .attach('file', digitalPdf, {
          filename: 'prova_timeout.pdf',
          contentType: 'application/pdf',
        });

      expect(uploadRes.status).toBe(201);
      const docId = uploadRes.body.document.id;

      // Timeout -> 504
      mockAiService.simulateTimeout = true;
      const timeoutRes = await request(appWithAi)
        .post(`/api/documents/${docId}/extract`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', cookieUserA)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({});

      expect(timeoutRes.status).toBe(504);
      expect(timeoutRes.body.error).toBe('AI_EXTRACTION_TIMEOUT');

      // Falha upstream -> 502
      mockAiService.simulateTimeout = false;
      mockAiService.simulateFailure = true;
      const failureRes = await request(appWithAi)
        .post(`/api/documents/${docId}/extract`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', cookieUserA)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({});

      expect(failureRes.status).toBe(502);
      expect(failureRes.body.error).toBe('AI_EXTRACTION_FAILED');
    });

    it('deve retornar 503 ServiceUnavailable em erro inesperado de infraestrutura no banco ao recuperar documento', async () => {
      const digitalPdf = buildRealPdfBuffer({
        pageTexts: ['Texto de prova com falha de banco'],
      });

      const uploadRes = await request(appWithAi)
        .post('/api/documents')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', cookieUserA)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .attach('file', digitalPdf, {
          filename: 'prova_db_fail.pdf',
          contentType: 'application/pdf',
        });

      expect(uploadRes.status).toBe(201);
      const docId = uploadRes.body.document.id;

      pdfRepo.simulateDbFailure = true;
      const dbFailRes = await request(appWithAi)
        .post(`/api/documents/${docId}/extract`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', cookieUserA)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({});

      expect(dbFailRes.status).toBe(503);
      expect(dbFailRes.body.error).toBe('ServiceUnavailable');
    });

    it('deve preservar o fluxo normal sem abortar a inferência prematuramente e remover listeners de conexão', async () => {
      const digitalPdf = buildRealPdfBuffer({
        pageTexts: ['Texto de prova normal para verificar integridade do sinal'],
      });

      const uploadRes = await request(appWithAi)
        .post('/api/documents')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', cookieUserA)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .attach('file', digitalPdf, {
          filename: 'prova_signal_normal.pdf',
          contentType: 'application/pdf',
        });

      expect(uploadRes.status).toBe(201);
      const docId = uploadRes.body.document.id;

      let observedSignalAbortedDuringExecution: boolean | null = null;
      const originalExtract = mockAiService.extractQuestionsFromText.bind(mockAiService);
      mockAiService.extractQuestionsFromText = async (req) => {
        observedSignalAbortedDuringExecution = Boolean(req.signal?.aborted);
        return originalExtract(req);
      };

      const extractRes = await request(appWithAi)
        .post(`/api/documents/${docId}/extract`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', cookieUserA)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({});

      expect(extractRes.status).toBe(200);
      expect(extractRes.body.extraction).toBeDefined();
      expect(observedSignalAbortedDuringExecution).toBe(false);
    });
  });
});
