import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Alternative, User, UserSession } from '@prisma/client';
import { createApp } from '../src/app.ts';
import { AuthService } from '../src/services/auth.service.ts';
import { QuestionService } from '../src/services/question.service.ts';
import type { CreateUserData, IUserRepository } from '../src/repositories/user.repository.ts';
import type {
  CreateSessionData,
  ISessionRepository,
  SessionWithUser,
} from '../src/repositories/session.repository.ts';
import type {
  IQuestionRepository,
  PaginatedQuestionEntities,
  QuestionWithAlternatives,
} from '../src/repositories/question.repository.ts';
import type {
  ParsedCreateQuestionInput,
  ParsedListQuestionsQuery,
  ParsedUpdateQuestionInput,
} from '../src/validators/question.validator.ts';
import { CSRF_HEADER_EXPECTED_VALUE } from '../src/middlewares/csrf.middleware.ts';

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
        count++;
      }
    }
    return count;
  }
}

class InMemoryQuestionRepository implements IQuestionRepository {
  public questions = new Map<string, QuestionWithAlternatives>();
  public simulateDatabaseFailure = false;
  private idCounter = 1;

  private ensureDatabaseHealthy(): void {
    if (this.simulateDatabaseFailure) {
      throw new Error('PostgreSQL connection refused: ECONNREFUSED 127.0.0.1:5432');
    }
  }

  async create(
    userId: string,
    data: ParsedCreateQuestionInput
  ): Promise<QuestionWithAlternatives> {
    this.ensureDatabaseHealthy();
    const now = new Date();
    const qId = `question-${this.idCounter++}`;

    const alternatives: Alternative[] = data.alternatives.map((alt, idx) => ({
      id: `alt-${qId}-${idx + 1}`,
      questionId: qId,
      letter: alt.letter,
      text: alt.text,
      position: idx + 1,
    }));

    const entity: QuestionWithAlternatives = {
      id: qId,
      userId,
      examId: null,
      originalNumber: data.originalNumber ?? null,
      statement: data.statement,
      type: data.type,
      subject: data.subject,
      topic: data.topic ?? null,
      subtopic: data.subtopic ?? null,
      board: data.board ?? null,
      examTitle: data.examTitle ?? null,
      year: data.year ?? null,
      difficulty: data.difficulty ?? null,
      correctAnswer: data.correctAnswer ?? null,
      explanation: data.explanation ?? null,
      sourcePage: data.sourcePage ?? null,
      status: data.status,
      createdAt: now,
      updatedAt: now,
      alternatives,
    };

    this.questions.set(qId, entity);
    return entity;
  }

  async findById(id: string): Promise<QuestionWithAlternatives | null> {
    this.ensureDatabaseHealthy();
    return this.questions.get(id) ?? null;
  }

  async findManyByUser(
    userId: string,
    query: ParsedListQuestionsQuery
  ): Promise<PaginatedQuestionEntities> {
    this.ensureDatabaseHealthy();

    const allForUser = Array.from(this.questions.values()).filter((q) => {
      if (q.userId !== userId) return false;
      if (
        query.subject &&
        !q.subject.toLowerCase().includes(query.subject.toLowerCase())
      ) {
        return false;
      }
      if (
        query.topic &&
        (!q.topic || !q.topic.toLowerCase().includes(query.topic.toLowerCase()))
      ) {
        return false;
      }
      if (
        query.board &&
        (!q.board || !q.board.toLowerCase().includes(query.board.toLowerCase()))
      ) {
        return false;
      }
      if (
        query.examTitle &&
        (!q.examTitle ||
          !q.examTitle.toLowerCase().includes(query.examTitle.toLowerCase()))
      ) {
        return false;
      }
      if (query.type && q.type !== query.type) {
        return false;
      }
      if (query.difficulty && q.difficulty !== query.difficulty) {
        return false;
      }
      if (query.search) {
        const s = query.search.toLowerCase();
        const matches =
          q.statement.toLowerCase().includes(s) ||
          q.subject.toLowerCase().includes(s) ||
          (q.topic?.toLowerCase().includes(s) ?? false) ||
          (q.board?.toLowerCase().includes(s) ?? false) ||
          (q.examTitle?.toLowerCase().includes(s) ?? false);
        if (!matches) return false;
      }
      return true;
    });

    const total = allForUser.length;
    const start = (query.page - 1) * query.limit;
    const items = allForUser.slice(start, start + query.limit);

    return { items, total };
  }

  async updateAtomically(
    id: string,
    data: ParsedUpdateQuestionInput
  ): Promise<QuestionWithAlternatives> {
    this.ensureDatabaseHealthy();
    const existing = this.questions.get(id);
    if (!existing) {
      throw new Error('Record to update not found');
    }

    const updatedAlternatives: Alternative[] =
      data.alternatives !== undefined
        ? data.alternatives.map((alt, idx) => ({
            id: `alt-${id}-u-${idx + 1}`,
            questionId: id,
            letter: alt.letter,
            text: alt.text,
            position: idx + 1,
          }))
        : existing.alternatives;

    const updated: QuestionWithAlternatives = {
      ...existing,
      statement: data.statement !== undefined ? data.statement : existing.statement,
      type: data.type !== undefined ? data.type : existing.type,
      subject: data.subject !== undefined ? data.subject : existing.subject,
      topic: data.topic !== undefined ? data.topic : existing.topic,
      subtopic: data.subtopic !== undefined ? data.subtopic : existing.subtopic,
      board: data.board !== undefined ? data.board : existing.board,
      examTitle: data.examTitle !== undefined ? data.examTitle : existing.examTitle,
      year: data.year !== undefined ? data.year : existing.year,
      originalNumber:
        data.originalNumber !== undefined ? data.originalNumber : existing.originalNumber,
      difficulty: data.difficulty !== undefined ? data.difficulty : existing.difficulty,
      correctAnswer:
        data.correctAnswer !== undefined ? data.correctAnswer : existing.correctAnswer,
      explanation:
        data.explanation !== undefined ? data.explanation : existing.explanation,
      sourcePage: data.sourcePage !== undefined ? data.sourcePage : existing.sourcePage,
      status: data.status !== undefined ? data.status : existing.status,
      updatedAt: new Date(),
      alternatives: updatedAlternatives,
    };

    this.questions.set(id, updated);
    return updated;
  }

  async deleteById(id: string): Promise<void> {
    this.ensureDatabaseHealthy();
    this.questions.delete(id);
  }
}

describe('Rotas HTTP do Banco de Questões (/api/questions) — Autenticação, CSRF, DTOs e Isolamento (backend/tests/question.routes.test.ts)', () => {
  const TEST_SECRET = 'test_session_secret_with_at_least_32_characters_long_999';
  const ALLOWED_ORIGIN = 'http://localhost:3000';

  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let questionRepo: InMemoryQuestionRepository;
  let authService: AuthService;
  let questionService: QuestionService;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository(userRepo);
    questionRepo = new InMemoryQuestionRepository();

    authService = new AuthService({
      userRepository: userRepo,
      sessionRepository: sessionRepo,
      sessionSecret: TEST_SECRET,
      sessionTtlMs: 60 * 60 * 1000,
    });

    questionService = new QuestionService({
      questionRepository: questionRepo,
    });
  });

  function buildTestApp() {
    return createApp({
      csrf: { allowedOrigins: [ALLOWED_ORIGIN] },
      auth: {
        authService,
        nodeEnv: 'test',
        rateLimit: { windowMs: 60 * 1000, maxAttempts: 50 },
      },
      questions: {
        authService,
        questionService,
      },
    });
  }

  async function createAuthenticatedAgent(
    app: ReturnType<typeof buildTestApp>,
    userData: { name: string; email: string; password: string }
  ) {
    const agent = request.agent(app);
    const res = await agent
      .post('/api/auth/register')
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .send(userData);

    expect(res.status).toBe(201);
    return { agent, user: res.body.user as { id: string; name: string; email: string } };
  }

  it('deve rejeitar acesso sem autenticação (HTTP 401) em todas as rotas de /api/questions', async () => {
    const app = buildTestApp();

    const listRes = await request(app).get('/api/questions');
    expect(listRes.status).toBe(401);

    const getRes = await request(app).get('/api/questions/question-1');
    expect(getRes.status).toBe(401);

    const postRes = await request(app)
      .post('/api/questions')
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .send({
        statement: 'Questão sem sessão.',
        subject: 'Direito Constitucional',
      });
    expect(postRes.status).toBe(401);

    const putRes = await request(app)
      .put('/api/questions/question-1')
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .send({ statement: 'Tentativa de edição sem sessão.' });
    expect(putRes.status).toBe(401);

    const delRes = await request(app)
      .delete('/api/questions/question-1')
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE);
    expect(delRes.status).toBe(401);
  });

  it('deve bloquear requisições mutáveis (POST, PUT, DELETE) em /api/questions sem cabeçalho CSRF ou de origem inválida (HTTP 403)', async () => {
    const app = buildTestApp();
    const { agent } = await createAuthenticatedAgent(app, {
      name: 'Clara Mendes',
      email: 'clara@questforge.dev',
      password: 'SenhaClaraMendes2026!',
    });

    // POST sem X-Requested-With
    const postNoCsrf = await agent
      .post('/api/questions')
      .set('Origin', ALLOWED_ORIGIN)
      .send({
        statement: 'Enunciado válido para teste CSRF.',
        subject: 'Português',
      });
    expect(postNoCsrf.status).toBe(403);
    expect(postNoCsrf.body.error).toBe('CsrfValidationFailed');

    // PUT com Origin não autorizada
    const putBadOrigin = await agent
      .put('/api/questions/question-1')
      .set('Origin', 'https://malicious.site.example')
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .send({ statement: 'Enunciado atualizado.' });
    expect(putBadOrigin.status).toBe(403);
    expect(putBadOrigin.body.error).toBe('CsrfValidationFailed');

    // DELETE sem X-Requested-With
    const delNoCsrf = await agent
      .delete('/api/questions/question-1')
      .set('Origin', ALLOWED_ORIGIN);
    expect(delNoCsrf.status).toBe(403);
    expect(delNoCsrf.body.error).toBe('CsrfValidationFailed');
  });

  it('deve cadastrar questão (POST /api/questions -> 201), validar payload (HTTP 400) e ignorar tentativas de falsificar userId no corpo', async () => {
    const app = buildTestApp();
    const { agent, user } = await createAuthenticatedAgent(app, {
      name: 'Bruno Silva',
      email: 'bruno@questforge.dev',
      password: 'SenhaBrunoSilva2026!',
    });

    // 1. Payload inválido (enunciado muito curto) -> 400
    const invalidRes = await agent
      .post('/api/questions')
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .send({
        statement: 'Oi',
        subject: 'Matemática',
      });
    expect(invalidRes.status).toBe(400);
    expect(invalidRes.body.error).toBe('QUESTION_VALIDATION_ERROR');

    // 2. Payload válido tentando falsificar userId no body -> deve usar req.user.id e manter difficulty null se não enviada
    const createRes = await agent
      .post('/api/questions')
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .send({
        userId: 'forged-admin-user-id',
        statement: 'Assinale a alternativa que apresenta um protocolo da camada de aplicação.',
        type: 'MULTIPLE_CHOICE',
        subject: 'Redes de Computadores',
        topic: 'Arquitetura TCP/IP',
        board: 'CEBRASPE',
        year: 2025,
        correctAnswer: 'b',
        explanation: 'HTTP opera na camada de aplicação.',
        alternatives: [
          { letter: 'a', text: 'IP' },
          { letter: 'b', text: 'HTTP' },
          { letter: 'c', text: 'TCP' },
        ],
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.question.userId).toBe(user.id);
    expect(createRes.body.question.userId).not.toBe('forged-admin-user-id');
    expect(createRes.body.question.difficulty).toBeNull();
    expect(createRes.body.question.correctAnswer).toBe('B');
    expect(createRes.body.question.alternatives).toHaveLength(3);
  });

  it('deve listar, filtrar, paginar e consultar por ID aplicando a política de proteção do gabarito (omitido por padrão, revelado ao proprietário quando solicitado)', async () => {
    const app = buildTestApp();
    const { agent } = await createAuthenticatedAgent(app, {
      name: 'Ana Beatriz',
      email: 'ana@questforge.dev',
      password: 'SenhaAnaBeatriz2026!',
    });

    const q1Res = await agent
      .post('/api/questions')
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .send({
        statement: 'Sobre árvores B e indexação em bancos de dados relacionais, assinale a opção correta.',
        type: 'MULTIPLE_CHOICE',
        subject: 'Banco de Dados',
        topic: 'Indexação',
        board: 'FGV',
        difficulty: 'HARD',
        correctAnswer: 'A',
        explanation: 'Árvores B mantêm o balanceamento automático em inserções e remoções.',
        alternatives: [
          { letter: 'A', text: 'Mantêm balanceamento automático.' },
          { letter: 'B', text: 'São estruturas lineares sem nós internos.' },
        ],
      });

    expect(q1Res.status).toBe(201);
    const questionId = q1Res.body.question.id as string;

    await agent
      .post('/api/questions')
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .send({
        statement: 'O princípio da legalidade estrita aplica-se à administração pública.',
        type: 'TRUE_FALSE',
        subject: 'Direito Administrativo',
        board: 'CEBRASPE',
        difficulty: 'EASY',
      });

    // 1. Listagem padrão (sem includeAnswer) -> omite correctAnswer e explanation
    const listRes = await agent.get('/api/questions?subject=Banco&board=FGV');
    expect(listRes.status).toBe(200);
    expect(listRes.body.total).toBe(1);
    expect(listRes.body.items).toHaveLength(1);
    expect(listRes.body.items[0].answerKeyRevealed).toBe(false);
    expect(listRes.body.items[0].hasAnswerKey).toBe(true);
    expect('correctAnswer' in listRes.body.items[0]).toBe(false);
    expect('explanation' in listRes.body.items[0]).toBe(false);

    // 2. Consulta por ID padrão -> omite correctAnswer e explanation
    const detailDefault = await agent.get(`/api/questions/${questionId}`);
    expect(detailDefault.status).toBe(200);
    expect(detailDefault.body.question.answerKeyRevealed).toBe(false);
    expect('correctAnswer' in detailDefault.body.question).toBe(false);
    expect('explanation' in detailDefault.body.question).toBe(false);

    // 3. Consulta por ID pelo proprietário com includeAnswer=true -> revela gabarito e explicação
    const detailRevealed = await agent.get(
      `/api/questions/${questionId}?includeAnswer=true`
    );
    expect(detailRevealed.status).toBe(200);
    expect(detailRevealed.body.question.answerKeyRevealed).toBe(true);
    expect(detailRevealed.body.question.correctAnswer).toBe('A');
    expect(detailRevealed.body.question.explanation).toContain('balanceamento automático');

    // 4. Consulta por ID inexistente -> 404
    const notFoundRes = await agent.get('/api/questions/question-inexistente');
    expect(notFoundRes.status).toBe(404);
    expect(notFoundRes.body.error).toBe('QUESTION_NOT_FOUND');
  });

  it('deve atualizar (PUT /api/questions/:id) atomicamente, rejeitar remoção de alternativa correta e excluir (DELETE /api/questions/:id)', async () => {
    const app = buildTestApp();
    const { agent, user } = await createAuthenticatedAgent(app, {
      name: 'Diego Rocha',
      email: 'diego@questforge.dev',
      password: 'SenhaDiegoRocha2026!',
    });

    const createRes = await agent
      .post('/api/questions')
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .send({
        statement: 'Questão inicial sobre estruturas de dados.',
        subject: 'Algoritmos',
        correctAnswer: 'C',
        alternatives: [
          { letter: 'A', text: 'Pilha' },
          { letter: 'B', text: 'Fila' },
          { letter: 'C', text: 'Grafo' },
        ],
      });

    const questionId = createRes.body.question.id as string;

    // 1. Tentativa de atualizar alternativas removendo 'C' sem atualizar correctAnswer -> 400
    const badUpdateRes = await agent
      .put(`/api/questions/${questionId}`)
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .send({
        alternatives: [
          { letter: 'A', text: 'Pilha LIFO' },
          { letter: 'B', text: 'Fila FIFO' },
        ],
      });
    expect(badUpdateRes.status).toBe(400);
    expect(badUpdateRes.body.error).toBe('QUESTION_VALIDATION_ERROR');

    // 2. Atualização válida alterando alternativas e correctAnswer simultaneamente (e tentando injetar outro userId)
    const validUpdateRes = await agent
      .put(`/api/questions/${questionId}`)
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .send({
        userId: 'hacker-id',
        statement: 'Qual estrutura segue a política FIFO (First-In, First-Out)?',
        correctAnswer: 'B',
        alternatives: [
          { letter: 'A', text: 'Pilha LIFO' },
          { letter: 'B', text: 'Fila FIFO' },
        ],
      });

    expect(validUpdateRes.status).toBe(200);
    expect(validUpdateRes.body.question.userId).toBe(user.id);
    expect(validUpdateRes.body.question.correctAnswer).toBe('B');
    expect(validUpdateRes.body.question.alternatives).toHaveLength(2);

    // 3. Exclusão -> 200 e subsequente 404 na consulta
    const delRes = await agent
      .delete(`/api/questions/${questionId}`)
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE);
    expect(delRes.status).toBe(200);

    const getAfterDel = await agent.get(`/api/questions/${questionId}`);
    expect(getAfterDel.status).toBe(404);
  });

  it('deve garantir isolamento estrito entre usuários nas rotas HTTP (Usuário B recebe 403 ao acessar, revelar gabarito, editar ou excluir questão do Usuário A)', async () => {
    const app = buildTestApp();
    const { agent: agentA } = await createAuthenticatedAgent(app, {
      name: 'Usuário Proprietário A',
      email: 'usera@questforge.dev',
      password: 'SenhaUsuarioA2026!',
    });

    const { agent: agentB } = await createAuthenticatedAgent(app, {
      name: 'Usuário Outro B',
      email: 'userb@questforge.dev',
      password: 'SenhaUsuarioB2026!',
    });

    const createdByA = await agentA
      .post('/api/questions')
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .send({
        statement: 'Questão exclusiva do Usuário A com gabarito protegido.',
        subject: 'Segurança da Informação',
        correctAnswer: 'A',
        explanation: 'Explicação confidencial de estudo.',
        alternatives: [
          { letter: 'A', text: 'Confidencialidade' },
          { letter: 'B', text: 'Disponibilidade' },
        ],
      });

    const questionIdA = createdByA.body.question.id as string;

    // Usuário B tenta consultar questão de A com includeAnswer=true -> 403 e sem vazar gabarito
    const getByB = await agentB.get(`/api/questions/${questionIdA}?includeAnswer=true`);
    expect(getByB.status).toBe(403);
    expect(getByB.body.error).toBe('QUESTION_FORBIDDEN');
    expect(getByB.body.question).toBeUndefined();

    // Usuário B tenta atualizar questão de A -> 403
    const updateByB = await agentB
      .put(`/api/questions/${questionIdA}`)
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .send({ statement: 'Adulterada por B' });
    expect(updateByB.status).toBe(403);
    expect(updateByB.body.error).toBe('QUESTION_FORBIDDEN');

    // Usuário B tenta excluir questão de A -> 403
    const deleteByB = await agentB
      .delete(`/api/questions/${questionIdA}`)
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE);
    expect(deleteByB.status).toBe(403);
    expect(deleteByB.body.error).toBe('QUESTION_FORBIDDEN');

    // Listagem do Usuário B não contém a questão de A
    const listByB = await agentB.get('/api/questions?includeAnswer=true');
    expect(listByB.status).toBe(200);
    expect(listByB.body.total).toBe(0);
    expect(listByB.body.items).toHaveLength(0);
  });

  it('deve retornar HTTP 503 ServiceUnavailable quando o banco de dados falhar na camada de questões, sem mascarar como lista vazia nem vazar detalhes internos', async () => {
    const app = buildTestApp();
    const { agent } = await createAuthenticatedAgent(app, {
      name: 'Marina Lopes',
      email: 'marina@questforge.dev',
      password: 'SenhaMarinaLopes2026!',
    });

    questionRepo.simulateDatabaseFailure = true;

    const listFailureRes = await agent.get('/api/questions');
    expect(listFailureRes.status).toBe(503);
    expect(listFailureRes.body.error).toBe('ServiceUnavailable');
    expect(listFailureRes.body.items).toBeUndefined();
    expect(JSON.stringify(listFailureRes.body)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(listFailureRes.body)).not.toContain('127.0.0.1:5432');

    const createFailureRes = await agent
      .post('/api/questions')
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .send({
        statement: 'Questão durante queda do banco.',
        subject: 'Engenharia de Software',
      });
    expect(createFailureRes.status).toBe(503);
    expect(createFailureRes.body.error).toBe('ServiceUnavailable');
  });
});
