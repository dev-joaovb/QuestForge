import { describe, it, expect, beforeEach } from 'vitest';
import type { User, UserSession } from '@prisma/client';
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from '../src/utils/crypto.ts';
import type { CreateUserData, IUserRepository } from '../src/repositories/user.repository.ts';
import type {
  CreateSessionData,
  ISessionRepository,
  SessionWithUser,
} from '../src/repositories/session.repository.ts';
import { AuthService } from '../src/services/auth.service.ts';
import { AuthDomainError } from '../src/types/auth.types.ts';

/**
 * Repositórios falsos (in-memory) usados EXCLUSIVAMENTE nesta suíte de testes unitários
 * para testar a lógica determinística do AuthService sem substituir o PostgreSQL na aplicação real.
 */
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
    const normalizedEmail = data.email.trim().toLowerCase();
    for (const u of this.users.values()) {
      if (u.email === normalizedEmail) {
        const err = new Error('Unique constraint failed on email') as Error & { code: string };
        err.code = 'P2002';
        throw err;
      }
    }

    const now = new Date();
    const user: User = {
      id: `user-${this.users.size + 1}`,
      name: data.name.trim(),
      email: normalizedEmail,
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
    let deletedCount = 0;
    for (const [id, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.sessions.delete(id);
        deletedCount++;
      }
    }
    return deletedCount;
  }
}

describe('Criptografia e Tokens de Sessão (backend/src/utils/crypto.ts)', () => {
  const TEST_SECRET = 'test_session_secret_with_at_least_32_characters_long_999';

  it('deve gerar hash scrypt versionado com salt aleatório e validar a senha corretamente', async () => {
    const hash1 = await hashPassword('SenhaForte#2026');
    const hash2 = await hashPassword('SenhaForte#2026');

    expect(hash1).toMatch(/^scrypt-v1\$N=16384,r=8,p=1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(hash1).not.toBe(hash2); // Salts diferentes produzem hashes diferentes
    expect(hash1).not.toContain('SenhaForte#2026');

    await expect(verifyPassword('SenhaForte#2026', hash1)).resolves.toBe(true);
    await expect(verifyPassword('SenhaErrada#2026', hash1)).resolves.toBe(false);
    await expect(verifyPassword('SenhaForte#2026', 'formato$invalido')).resolves.toBe(false);

    // Deve rejeitar parâmetros de custo adulterados ou não permitidos
    const tamperedParamsHash = hash1.replace('N=16384,r=8,p=1', 'N=1024,r=8,p=1');
    await expect(verifyPassword('SenhaForte#2026', tamperedParamsHash)).resolves.toBe(false);

    // Deve rejeitar salt ou hash com caracteres fora de hexadecimal
    const nonHexSaltHash = `scrypt-v1$N=16384,r=8,p=1$${'z'.repeat(32)}${'a'.repeat(128)}`;
    await expect(verifyPassword('SenhaForte#2026', nonHexSaltHash)).resolves.toBe(false);
  });

  it('deve gerar tokens opacos únicos e calcular hashes HMAC-SHA256 determinísticos com SESSION_SECRET', () => {
    const tokenA = generateSessionToken();
    const tokenB = generateSessionToken();

    expect(tokenA.length).toBeGreaterThanOrEqual(42);
    expect(tokenA).not.toBe(tokenB);

    const hashA1 = hashSessionToken(tokenA, TEST_SECRET);
    const hashA2 = hashSessionToken(tokenA, TEST_SECRET);
    const hashB = hashSessionToken(tokenB, TEST_SECRET);

    expect(hashA1).toBe(hashA2);
    expect(hashA1).not.toBe(tokenA);
    expect(hashA1).not.toBe(hashB);
    expect(hashA1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('deve rejeitar geração de hash de sessão quando SESSION_SECRET é curta ou ausente', () => {
    const token = generateSessionToken();
    expect(() => hashSessionToken(token, 'curta')).toThrow(/SESSION_SECRET/);
  });
});

describe('AuthService — Regras de Domínio de Autenticação (backend/tests/auth.service.test.ts)', () => {
  const TEST_SECRET = 'test_session_secret_with_at_least_32_characters_long_999';
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let currentTime: Date;
  let authService: AuthService;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository(userRepo);
    currentTime = new Date('2026-10-09T12:00:00.000Z');

    authService = new AuthService({
      userRepository: userRepo,
      sessionRepository: sessionRepo,
      sessionSecret: TEST_SECRET,
      sessionTtlMs: 60 * 60 * 1000, // 1 hora
      now: () => currentTime,
    });
  });

  it('deve cadastrar um novo usuário, armazenar apenas passwordHash e tokenHash e nunca expor hashes no retorno público', async () => {
    const result = await authService.register({
      name: '  Maria Silva  ',
      email: '  MARIA.SILVA@EMAIL.COM ',
      password: 'PasswordSeguro123!',
    });

    expect(result.user.name).toBe('Maria Silva');
    expect(result.user.email).toBe('maria.silva@email.com');
    expect('passwordHash' in result.user).toBe(false);
    expect('tokenHash' in result.session).toBe(false);
    expect(typeof result.rawSessionToken).toBe('string');

    // Verifica no repositório que a senha foi persistida como hash scrypt e o token como HMAC
    const storedUser = await userRepo.findByEmail('maria.silva@email.com');
    expect(storedUser).not.toBeNull();
    expect(storedUser?.passwordHash).not.toBe('PasswordSeguro123!');
    expect(storedUser?.passwordHash.startsWith('scrypt-v1$')).toBe(true);

    const storedSession = sessionRepo.sessions.get(result.session.id);
    expect(storedSession).toBeDefined();
    expect(storedSession?.tokenHash).not.toBe(result.rawSessionToken);
    expect(storedSession?.tokenHash).toBe(hashSessionToken(result.rawSessionToken, TEST_SECRET));
  });

  it('deve rejeitar cadastro com e-mail duplicado (case-insensitive) retornando erro de domínio apropriado', async () => {
    await authService.register({
      name: 'Maria Silva',
      email: 'maria@email.com',
      password: 'PasswordSeguro123!',
    });

    await expect(
      authService.register({
        name: 'Outra Maria',
        email: 'MARIA@EMAIL.COM',
        password: 'OutraSenhaForte456!',
      })
    ).rejects.toMatchObject({
      name: 'AuthDomainError',
      code: 'EMAIL_ALREADY_IN_USE',
      statusCode: 409,
    });
  });

  it('deve realizar login com credenciais válidas e rejeitar senha incorreta ou usuário inexistente com a mesma mensagem genérica', async () => {
    await authService.register({
      name: 'João Souza',
      email: 'joao@email.com',
      password: 'MinhaSenhaCorreta99!',
    });

    const loginResult = await authService.login({
      email: 'JOAO@email.com',
      password: 'MinhaSenhaCorreta99!',
    });

    expect(loginResult.user.email).toBe('joao@email.com');
    expect(loginResult.rawSessionToken).toBeTruthy();

    // Senha incorreta
    await expect(
      authService.login({
        email: 'joao@email.com',
        password: 'SenhaIncorreta99!',
      })
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      statusCode: 401,
      message: 'E-mail ou senha inválidos.',
    });

    // E-mail não cadastrado
    await expect(
      authService.login({
        email: 'inexistente@email.com',
        password: 'MinhaSenhaCorreta99!',
      })
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      statusCode: 401,
      message: 'E-mail ou senha inválidos.',
    });
  });

  it('deve validar sessão ativa, atualizar lastUsedAt e rejeitar/remover sessão expirada', async () => {
    const registered = await authService.register({
      name: 'Ana Costa',
      email: 'ana@email.com',
      password: 'SenhaValida12345!',
    });

    // Avança o relógio em 15 minutos (dentro do TTL de 1h)
    currentTime = new Date('2026-10-09T12:15:00.000Z');
    const validated = await authService.validateSession(registered.rawSessionToken);

    expect(validated.user.id).toBe(registered.user.id);
    expect(validated.session.lastUsedAt.toISOString()).toBe('2026-10-09T12:15:00.000Z');

    // Avança o relógio para além de 1 hora (expirada)
    currentTime = new Date('2026-10-09T13:05:00.000Z');
    await expect(authService.validateSession(registered.rawSessionToken)).rejects.toThrowError(
      AuthDomainError
    );

    // Garante que a sessão expirada foi removida do armazenamento
    expect(sessionRepo.sessions.has(registered.session.id)).toBe(false);
  });

  it('deve revogar a sessão no logout e impedir seu uso subsequente', async () => {
    const registered = await authService.register({
      name: 'Carlos Mendes',
      email: 'carlos@email.com',
      password: 'SenhaCarlos12345!',
    });

    const loggedOut = await authService.logout(registered.rawSessionToken);
    expect(loggedOut).toBe(true);

    // Segunda tentativa de logout com o mesmo token deve retornar false
    await expect(authService.logout(registered.rawSessionToken)).resolves.toBe(false);

    // Tentativa de validar sessão revogada deve falhar com 401
    await expect(authService.validateSession(registered.rawSessionToken)).rejects.toMatchObject({
      code: 'SESSION_INVALID_OR_EXPIRED',
      statusCode: 401,
    });
  });
});
