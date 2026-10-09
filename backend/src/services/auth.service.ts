import {
  AuthDomainError,
  type AuthenticatedSessionResult,
  type ValidatedSessionResult,
} from '../types/auth.types.ts';
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from '../utils/crypto.ts';
import {
  loginInputSchema,
  registerInputSchema,
  type LoginInput,
  type RegisterInput,
} from '../validators/auth.validator.ts';
import {
  PrismaUserRepository,
  toPublicUserDTO,
  type IUserRepository,
} from '../repositories/user.repository.ts';
import {
  PrismaSessionRepository,
  toSessionInfoDTO,
  type ISessionRepository,
} from '../repositories/session.repository.ts';
import { logger } from '../utils/logger.ts';

/** Duração padrão de uma sessão autenticada: 7 dias */
export const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Hash pré-computado usado quando um e-mail não é encontrado no login,
 * evitando enumeração de contas por diferença de tempo (timing attack).
 */
const DUMMY_PASSWORD_HASH =
  'scrypt-v1$N=16384,r=8,p=1$00112233445566778899aabbccddeeff$0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

export interface AuthServiceDependencies {
  userRepository?: IUserRepository;
  sessionRepository?: ISessionRepository;
  sessionSecret?: string;
  sessionTtlMs?: number;
  now?: () => Date;
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown };
  return candidate.code === 'P2002';
}

/**
 * Serviço de Domínio de Autenticação do QuestForge (Sprint 1 — Etapa 1.1).
 *
 * Concentra os fluxos essenciais de:
 * - Cadastro de usuário (`register`) com hash scrypt e criação de sessão
 * - Login (`login`) com verificação resistente a timing attacks
 * - Validação de sessão ativa (`validateSession`) com checagem de expiração e revogação automática
 * - Encerramento de sessão (`logout` e `revokeAllUserSessions`)
 *
 * Nota arquitetural: Recuperação de senha por token não é exposta como fluxo operacional
 * sem que um provedor real de envio de e-mail (SMTP/transacional) esteja configurado.
 */
export class AuthService {
  private readonly userRepository: IUserRepository;
  private readonly sessionRepository: ISessionRepository;
  private readonly sessionSecret?: string;
  private readonly sessionTtlMs: number;
  private readonly now: () => Date;

  constructor(deps: AuthServiceDependencies = {}) {
    this.userRepository = deps.userRepository ?? new PrismaUserRepository();
    this.sessionRepository = deps.sessionRepository ?? new PrismaSessionRepository();
    this.sessionSecret = deps.sessionSecret;
    this.sessionTtlMs = deps.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Registra um novo usuário, armazena apenas o `passwordHash` scrypt e inicia uma sessão persistente.
   */
  async register(rawInput: RegisterInput): Promise<AuthenticatedSessionResult> {
    const parsed = registerInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message ?? 'Dados de cadastro inválidos.';
      throw new AuthDomainError('VALIDATION_ERROR', firstIssue, 400);
    }

    const { name, email, password } = parsed.data;

    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) {
      throw new AuthDomainError(
        'EMAIL_ALREADY_IN_USE',
        'Não foi possível concluir o cadastro com o e-mail informado.',
        409
      );
    }

    const passwordHash = await hashPassword(password);

    let createdUser;
    try {
      createdUser = await this.userRepository.create({
        name,
        email,
        passwordHash,
      });
    } catch (error) {
      // Trata condição de corrida (race condition) na constraint UNIQUE de email no PostgreSQL
      if (isPrismaUniqueConstraintError(error)) {
        throw new AuthDomainError(
          'EMAIL_ALREADY_IN_USE',
          'Não foi possível concluir o cadastro com o e-mail informado.',
          409
        );
      }
      throw error;
    }

    const sessionResult = await this.issueSessionForUser(createdUser.id);

    logger.info('auth_user_registered', {
      userId: createdUser.id,
      sessionId: sessionResult.session.id,
    });

    return {
      user: toPublicUserDTO(createdUser),
      session: sessionResult.session,
      rawSessionToken: sessionResult.rawSessionToken,
    };
  }

  /**
   * Autentica um usuário existente verificando o hash scrypt e cria uma nova sessão no banco.
   */
  async login(rawInput: LoginInput): Promise<AuthenticatedSessionResult> {
    const parsed = loginInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message ?? 'Credenciais inválidas.';
      throw new AuthDomainError('VALIDATION_ERROR', firstIssue, 400);
    }

    const { email, password } = parsed.data;
    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      // Executa scrypt contra hash dummy para igualar o tempo de resposta
      await verifyPassword(password, DUMMY_PASSWORD_HASH);
      throw new AuthDomainError('INVALID_CREDENTIALS', 'E-mail ou senha inválidos.', 401);
    }

    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      logger.warn('auth_login_failed_invalid_password', { userId: user.id });
      throw new AuthDomainError('INVALID_CREDENTIALS', 'E-mail ou senha inválidos.', 401);
    }

    const sessionResult = await this.issueSessionForUser(user.id);

    logger.info('auth_user_logged_in', {
      userId: user.id,
      sessionId: sessionResult.session.id,
    });

    return {
      user: toPublicUserDTO(user),
      session: sessionResult.session,
      rawSessionToken: sessionResult.rawSessionToken,
    };
  }

  /**
   * Valida um token bruto de sessão recebido via cookie HttpOnly.
   * Se a sessão não existir ou estiver expirada, lança AuthDomainError (e remove a sessão expirada).
   */
  async validateSession(rawToken: string): Promise<ValidatedSessionResult> {
    if (!rawToken || typeof rawToken !== 'string' || rawToken.trim() === '') {
      throw new AuthDomainError(
        'SESSION_INVALID_OR_EXPIRED',
        'Sessão inválida ou expirada.',
        401
      );
    }

    const tokenHash = this.computeTokenHash(rawToken);
    const sessionWithUser = await this.sessionRepository.findByTokenHashWithUser(tokenHash);

    if (!sessionWithUser) {
      throw new AuthDomainError(
        'SESSION_INVALID_OR_EXPIRED',
        'Sessão inválida ou expirada.',
        401
      );
    }

    const currentTime = this.now();
    if (sessionWithUser.expiresAt.getTime() <= currentTime.getTime()) {
      await this.sessionRepository.deleteById(sessionWithUser.id);
      logger.info('auth_session_expired_removed', {
        userId: sessionWithUser.userId,
        sessionId: sessionWithUser.id,
      });
      throw new AuthDomainError(
        'SESSION_INVALID_OR_EXPIRED',
        'Sessão inválida ou expirada.',
        401
      );
    }

    await this.sessionRepository.touchLastUsed(sessionWithUser.id, currentTime);

    return {
      user: toPublicUserDTO(sessionWithUser.user),
      session: toSessionInfoDTO({
        ...sessionWithUser,
        lastUsedAt: currentTime,
      }),
    };
  }

  /**
   * Encerra (revoga) uma sessão a partir do seu token bruto.
   */
  async logout(rawToken: string): Promise<boolean> {
    if (!rawToken || typeof rawToken !== 'string' || rawToken.trim() === '') {
      return false;
    }

    const tokenHash = this.computeTokenHash(rawToken);
    const deleted = await this.sessionRepository.deleteByTokenHash(tokenHash);

    if (deleted) {
      logger.info('auth_session_logged_out');
    }

    return deleted;
  }

  /**
   * Revoga todas as sessões ativas de um usuário (útil em logout global ou eventos de segurança).
   */
  async revokeAllUserSessions(userId: string): Promise<number> {
    const count = await this.sessionRepository.deleteAllForUser(userId);
    logger.info('auth_all_user_sessions_revoked', { userId, revokedCount: count });
    return count;
  }

  private async issueSessionForUser(userId: string) {
    const rawSessionToken = generateSessionToken();
    const tokenHash = this.computeTokenHash(rawSessionToken);
    const currentTime = this.now();
    const expiresAt = new Date(currentTime.getTime() + this.sessionTtlMs);

    const createdSession = await this.sessionRepository.create({
      userId,
      tokenHash,
      expiresAt,
    });

    return {
      rawSessionToken,
      session: toSessionInfoDTO(createdSession),
    };
  }

  private computeTokenHash(rawToken: string): string {
    try {
      return hashSessionToken(rawToken, this.sessionSecret);
    } catch (error) {
      throw new AuthDomainError(
        'CONFIGURATION_ERROR',
        error instanceof Error ? error.message : 'Erro de configuração de sessão.',
        500
      );
    }
  }
}
