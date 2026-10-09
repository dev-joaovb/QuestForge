import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { User, UserSession } from '@prisma/client';
import { createApp } from '../src/app.ts';
import { AuthService } from '../src/services/auth.service.ts';
import type { CreateUserData, IUserRepository } from '../src/repositories/user.repository.ts';
import type {
  CreateSessionData,
  ISessionRepository,
  SessionWithUser,
} from '../src/repositories/session.repository.ts';
import { CSRF_HEADER_EXPECTED_VALUE } from '../src/middlewares/csrf.middleware.ts';
import { SESSION_COOKIE_NAME } from '../src/utils/cookies.ts';

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
  public simulateDatabaseFailure = false;

  constructor(private readonly userRepo: InMemoryUserRepository) {}

  async create(data: CreateSessionData): Promise<UserSession> {
    if (this.simulateDatabaseFailure) {
      throw new Error('Connection terminated unexpectedly');
    }
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
    if (this.simulateDatabaseFailure) {
      throw new Error('Database connection lost during session lookup');
    }
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

describe('Rotas HTTP de Autenticação, Cookies HttpOnly, CSRF e Rate Limit (backend/tests/auth.routes.test.ts)', () => {
  const TEST_SECRET = 'test_session_secret_with_at_least_32_characters_long_999';
  const ALLOWED_ORIGIN = 'http://localhost:3000';

  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let currentTime: Date;
  let authService: AuthService;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository(userRepo);
    currentTime = new Date();

    authService = new AuthService({
      userRepository: userRepo,
      sessionRepository: sessionRepo,
      sessionSecret: TEST_SECRET,
      sessionTtlMs: 60 * 60 * 1000,
      now: () => currentTime,
    });
  });

  function buildTestApp(options?: { nodeEnv?: string; maxAttempts?: number }) {
    return createApp({
      csrf: { allowedOrigins: [ALLOWED_ORIGIN] },
      auth: {
        authService,
        nodeEnv: options?.nodeEnv ?? 'test',
        rateLimit: {
          windowMs: 60 * 1000,
          maxAttempts: options?.maxAttempts ?? 20,
        },
      },
    });
  }

  it('deve cadastrar usuário (POST /api/auth/register), emitir cookie HttpOnly (SameSite=Lax, Path=/) e permitir consulta em GET /api/auth/me', async () => {
    const app = buildTestApp({ nodeEnv: 'test' });
    const agent = request.agent(app);

    const registerRes = await agent
      .post('/api/auth/register')
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .send({
        name: 'Helena Martins',
        email: 'helena@questforge.dev',
        password: 'SenhaForteHelena2026!',
      });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.user.email).toBe('helena@questforge.dev');
    expect('passwordHash' in registerRes.body.user).toBe(false);
    expect('tokenHash' in registerRes.body.session).toBe(false);
    expect('rawSessionToken' in registerRes.body).toBe(false);

    const setCookieHeader = registerRes.headers['set-cookie'];
    expect(setCookieHeader).toBeDefined();
    const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader[0] : String(setCookieHeader);

    expect(cookieStr).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cookieStr).toContain('HttpOnly');
    expect(cookieStr).toContain('SameSite=Lax');
    expect(cookieStr).toContain('Path=/');
    expect(cookieStr).not.toContain('Domain=');

    // Consulta GET /api/auth/me usando o cookie armazenado pelo agent
    const meRes = await agent.get('/api/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe('helena@questforge.dev');

    // Verifica que em modo production o atributo Secure é adicionado obrigatoriamente ao cookie
    const prodApp = buildTestApp({ nodeEnv: 'production' });
    const prodRes = await request(prodApp)
      .post('/api/auth/login')
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .send({
        email: 'helena@questforge.dev',
        password: 'SenhaForteHelena2026!',
      });

    expect(prodRes.status).toBe(200);
    const prodCookie = Array.isArray(prodRes.headers['set-cookie'])
      ? prodRes.headers['set-cookie'][0]
      : String(prodRes.headers['set-cookie']);
    expect(prodCookie).toContain('Secure');
    expect(prodCookie).toContain('HttpOnly');
    expect(prodCookie).toContain('SameSite=Lax');
  });

  it('deve bloquear requisições mutáveis (POST) sem cabeçalho CSRF ou de origem não permitida com HTTP 403', async () => {
    const app = buildTestApp();

    // 1. Sem cabeçalho X-Requested-With
    const missingHeaderRes = await request(app)
      .post('/api/auth/login')
      .set('Origin', ALLOWED_ORIGIN)
      .send({ email: 'helena@questforge.dev', password: 'SenhaForteHelena2026!' });

    expect(missingHeaderRes.status).toBe(403);
    expect(missingHeaderRes.body.error).toBe('CsrfValidationFailed');

    // 2. Com cabeçalho X-Requested-With, mas Origin maliciosa
    const invalidOriginRes = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://attacker.evil.example')
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .send({ email: 'helena@questforge.dev', password: 'SenhaForteHelena2026!' });

    expect(invalidOriginRes.status).toBe(403);
    expect(invalidOriginRes.body.error).toBe('CsrfValidationFailed');
  });

  it('deve realizar login, revogar sessão no logout limpando o cookie com atributos compatíveis e rejeitar /api/auth/me após logout', async () => {
    const app = buildTestApp({ nodeEnv: 'production' });
    const agent = request.agent(app);

    await agent
      .post('/api/auth/register')
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .send({
        name: 'Lucas Prado',
        email: 'lucas@questforge.dev',
        password: 'SenhaLucasPrado123!',
      });

    const logoutRes = await agent
      .post('/api/auth/logout')
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE);

    expect(logoutRes.status).toBe(200);
    const clearCookieHeader = logoutRes.headers['set-cookie'];
    const clearCookieStr = Array.isArray(clearCookieHeader)
      ? clearCookieHeader[0]
      : String(clearCookieHeader);

    expect(clearCookieStr).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(clearCookieStr).toContain('HttpOnly');
    expect(clearCookieStr).toContain('SameSite=Lax');
    expect(clearCookieStr).toContain('Path=/');
    expect(clearCookieStr).toContain('Secure');

    // Após logout, GET /api/auth/me deve retornar 401
    const meAfterLogout = await agent.get('/api/auth/me');
    expect(meAfterLogout.status).toBe(401);
  });

  it('deve rejeitar acesso a GET /api/auth/me sem cookie, com sessão expirada ou quando o banco falha (fail-closed)', async () => {
    const app = buildTestApp();

    // 1. Sem cookie
    const unauthRes = await request(app).get('/api/auth/me');
    expect(unauthRes.status).toBe(401);

    // 2. Com sessão registrada
    const agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .send({
        name: 'Rafael Costa',
        email: 'rafael@questforge.dev',
        password: 'SenhaRafaelCosta123!',
      });

    // 3. Simula falha de infraestrutura no banco durante validação de sessão -> deve retornar 503 e NUNCA 200
    sessionRepo.simulateDatabaseFailure = true;
    const dbFailureRes = await agent.get('/api/auth/me');
    expect(dbFailureRes.status).toBe(503);
    expect(dbFailureRes.body.user).toBeUndefined();

    // 4. Restaura banco e avança o tempo para além da expiração -> deve retornar 401
    sessionRepo.simulateDatabaseFailure = false;
    currentTime = new Date(currentTime.getTime() + 2 * 60 * 60 * 1000);
    const expiredRes = await agent.get('/api/auth/me');
    expect(expiredRes.status).toBe(401);
  });

  it('deve aplicar rate limiting (HTTP 429) após exceder o limite configurado e ignorar X-Forwarded-For falsificado', async () => {
    const app = buildTestApp({ maxAttempts: 2 });

    for (let i = 1; i <= 2; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Origin', ALLOWED_ORIGIN)
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .set('X-Forwarded-For', `203.0.113.${i}`) // Tenta burlar rate limit falsificando IP
        .send({ email: 'naoexiste@questforge.dev', password: 'SenhaQualquer123!' });

      expect(res.status).toBe(401);
    }

    // A 3ª tentativa deve ser bloqueada com 429 mesmo enviando outro X-Forwarded-For
    const blockedRes = await request(app)
      .post('/api/auth/login')
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
      .set('X-Forwarded-For', '198.51.100.99')
      .send({ email: 'naoexiste@questforge.dev', password: 'SenhaQualquer123!' });

    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.error).toBe('TooManyRequests');
  });
});
