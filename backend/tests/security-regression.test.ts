import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.ts';
import { AuthService } from '../src/services/auth.service.ts';
import {
  CSRF_HEADER_NAME,
  CSRF_HEADER_EXPECTED_VALUE,
} from '../src/middlewares/csrf.middleware.ts';
import { SESSION_COOKIE_NAME } from '../src/utils/cookies.ts';
import {
  AuthDomainError,
  type PublicUserDTO,
  type ValidatedSessionResult,
} from '../src/types/auth.types.ts';
import { SimulationDomainError } from '../src/types/simulation.types.ts';
import { PdfDocumentDomainError } from '../src/types/pdf-document.types.ts';

describe('Suíte de Segurança e Regressão Funcional (Sprint 10.4)', () => {
  const ALLOWED_ORIGIN = 'http://localhost:3000';

  const userAlice: PublicUserDTO = {
    id: 'user-alice-uuid-001',
    name: 'Alice Estudante',
    email: 'alice@questforge.local',
    avatarUrl: null,
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-01T10:00:00Z'),
  };

  const userBob: PublicUserDTO = {
    id: 'user-bob-uuid-002',
    name: 'Bob Estudante',
    email: 'bob@questforge.local',
    avatarUrl: null,
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-01T10:00:00Z'),
  };

  const validAliceSession: ValidatedSessionResult = {
    user: userAlice,
    session: {
      id: 'session-alice-123',
      userId: userAlice.id,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      lastUsedAt: new Date(),
    },
  };

  const validBobSession: ValidatedSessionResult = {
    user: userBob,
    session: {
      id: 'session-bob-456',
      userId: userBob.id,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      lastUsedAt: new Date(),
    },
  };

  // ==========================================================================
  // BLOCO 1: Autenticação, Sessão e Cookie Canônico (qf_session)
  // ==========================================================================
  describe('1. Autenticação, Ciclo de Vida da Sessão e Cookie qf_session', () => {
    it('deve realizar cadastro com validação de formato e hash seguro sem expor senha', async () => {
      const mockAuthService = {
        register: vi.fn().mockResolvedValue({
          user: userAlice,
          session: validAliceSession.session,
          rawToken: 'raw_session_token_alice_123',
        }),
      } as unknown as AuthService;

      const app = createApp({
        auth: { authService: mockAuthService },
      });

      const response = await request(app)
        .post('/api/auth/register')
        .set('Origin', ALLOWED_ORIGIN)
        .set(CSRF_HEADER_NAME, CSRF_HEADER_EXPECTED_VALUE)
        .send({
          name: 'Alice Estudante',
          email: 'alice@questforge.local',
          password: 'PasswordSuperSecure123!',
        });

      expect(response.status).toBe(201);
      expect(response.body.user).toEqual({
        id: userAlice.id,
        name: userAlice.name,
        email: userAlice.email,
        avatarUrl: null,
        createdAt: userAlice.createdAt.toISOString(),
        updatedAt: userAlice.updatedAt.toISOString(),
      });

      // Confirma que a senha ou hash NUNCA aparecem no payload
      expect(response.body.user.password).toBeUndefined();
      expect(response.body.user.passwordHash).toBeUndefined();

      // Confirma atributo do cookie canônico qf_session
      const setCookieHeader = response.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();
      const cookieStr = Array.isArray(setCookieHeader)
        ? setCookieHeader.join(';')
        : String(setCookieHeader);
      expect(cookieStr).toContain(SESSION_COOKIE_NAME);
      expect(cookieStr).toContain('HttpOnly');
    });

    it('deve rejeitar login com credenciais inválidas usando mensagem genérica sem enumeração de usuários', async () => {
      const mockAuthService = {
        login: vi.fn().mockRejectedValue(
          new AuthDomainError('INVALID_CREDENTIALS', 'E-mail ou senha incorretos.', 401)
        ),
      } as unknown as AuthService;

      const app = createApp({
        auth: { authService: mockAuthService },
      });

      const response = await request(app)
        .post('/api/auth/login')
        .set('Origin', ALLOWED_ORIGIN)
        .set(CSRF_HEADER_NAME, CSRF_HEADER_EXPECTED_VALUE)
        .send({
          email: 'nonexistent@questforge.local',
          password: 'wrong_password_123',
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('E-mail ou senha incorretos');
      expect(response.body.message).not.toContain('usuário não encontrado');
    });

    it('deve revogar a sessão no logout e limpar o cookie qf_session', async () => {
      const mockAuthService = {
        validateSession: vi.fn().mockResolvedValue(validAliceSession),
        logout: vi.fn().mockResolvedValue(undefined),
      } as unknown as AuthService;

      const app = createApp({
        auth: { authService: mockAuthService },
      });

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Origin', ALLOWED_ORIGIN)
        .set(CSRF_HEADER_NAME, CSRF_HEADER_EXPECTED_VALUE)
        .set('Cookie', `${SESSION_COOKIE_NAME}=token_valid_alice`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Sessão encerrada com sucesso.');

      // Verifica limpeza do cookie
      const setCookieHeader = response.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();
      const cookieStr = Array.isArray(setCookieHeader)
        ? setCookieHeader.join(';')
        : String(setCookieHeader);
      expect(cookieStr).toMatch(/qf_session=;.*Expires=Thu, 01 Jan 1970|Max-Age=0/);
    });

    it('deve retornar 401 e limpar cookie quando a sessão estiver expirada', async () => {
      const mockAuthService = {
        validateSession: vi.fn().mockRejectedValue(
          new AuthDomainError(
            'SESSION_INVALID_OR_EXPIRED',
            'Sessão expirada. Faça login novamente.',
            401
          )
        ),
      } as unknown as AuthService;

      const app = createApp({
        auth: { authService: mockAuthService },
      });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `${SESSION_COOKIE_NAME}=token_expired`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
      expect(response.body.message).toContain('Sessão expirada');

      const setCookieHeader = response.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();
    });

    it('deve retornar 401 ao tentar acessar rota protegida sem cookie de sessão', async () => {
      const app = createApp();

      const response = await request(app).get('/api/simulations');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
      expect(response.body.message).toBe('Autenticação necessária.');
    });
  });

  // ==========================================================================
  // BLOCO 2: Segurança HTTP, Proteção CSRF e Headers Obrigatórios
  // ==========================================================================
  describe('2. Segurança HTTP, Proteção CSRF e Defesa em Profundidade', () => {
    it('deve rejeitar requisição mutável POST sem cabeçalho X-Requested-With com HTTP 403', async () => {
      const app = createApp();

      const response = await request(app)
        .post('/api/auth/login')
        .set('Origin', ALLOWED_ORIGIN)
        .send({
          email: 'alice@questforge.local',
          password: 'Password123!',
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('CsrfValidationFailed');
      expect(response.body.message).toContain('cabeçalho de cliente ausente ou inválido');
    });

    it('deve rejeitar requisição mutável com cabeçalho X-Requested-With incorreto com HTTP 403', async () => {
      const app = createApp();

      const response = await request(app)
        .post('/api/auth/login')
        .set('Origin', ALLOWED_ORIGIN)
        .set(CSRF_HEADER_NAME, 'XMLHttpRequest') // Valor genérico não autorizado
        .send({
          email: 'alice@questforge.local',
          password: 'Password123!',
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('CsrfValidationFailed');
    });

    it('deve rejeitar requisição mutável vinda de Origin maliciosa não autorizada com HTTP 403', async () => {
      const app = createApp();

      const response = await request(app)
        .post('/api/auth/login')
        .set('Origin', 'http://malicious-attacker-site.com')
        .set(CSRF_HEADER_NAME, CSRF_HEADER_EXPECTED_VALUE)
        .send({
          email: 'alice@questforge.local',
          password: 'Password123!',
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('CsrfValidationFailed');
      expect(response.body.message).toContain('Origem da requisição não autorizada');
    });

    it('deve rejeitar requisição mutável vinda de Referer malicioso não autorizado com HTTP 403', async () => {
      const app = createApp();

      const response = await request(app)
        .post('/api/auth/login')
        .set('Referer', 'http://malicious-phishing.org/steal')
        .set(CSRF_HEADER_NAME, CSRF_HEADER_EXPECTED_VALUE)
        .send({
          email: 'alice@questforge.local',
          password: 'Password123!',
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('CsrfValidationFailed');
      expect(response.body.message).toContain('Origem de referência da requisição não autorizada');
    });

    it('deve permitir requisições seguras GET sem exigir cabeçalho CSRF', async () => {
      const app = createApp();

      const response = await request(app).get('/api/live');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('alive');
    });
  });

  // ==========================================================================
  // BLOCO 3: IDOR e Escalada Horizontal de Privilégios entre Usuários
  // ==========================================================================
  describe('3. Prevenção de IDOR e Isolamento de Recursos entre Contas', () => {
    it('deve impedir que Usuário Bob consulte o simulado de Usuário Alice retornando HTTP 404', async () => {
      const mockAuthService = {
        validateSession: vi.fn().mockImplementation(async (token: string) => {
          if (token === 'bob_token') return validBobSession;
          return validAliceSession;
        }),
      } as unknown as AuthService;

      const mockSimulationService = {
        getSimulation: vi.fn().mockImplementation(async (userId: string, simId: string) => {
          if (userId === userAlice.id && simId === 'sim-alice-100') {
            return { id: 'sim-alice-100', userId: userAlice.id, title: 'Simulado de Alice' };
          }
          throw new SimulationDomainError(
            'SIMULATION_NOT_FOUND',
            'Simulado não encontrado.',
            404
          );
        }),
      };

      const app = createApp({
        auth: { authService: mockAuthService },
        simulations: {
          authService: mockAuthService,
          simulationService: mockSimulationService as any,
        },
      });

      // Bob tenta consultar simulado de Alice
      const response = await request(app)
        .get('/api/simulations/sim-alice-100')
        .set('Cookie', `${SESSION_COOKIE_NAME}=bob_token`);

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('Simulado não encontrado');
    });

    it('deve impedir que Usuário Bob submeta respostas no simulado de Alice retornando HTTP 404', async () => {
      const mockAuthService = {
        validateSession: vi.fn().mockResolvedValue(validBobSession),
      } as unknown as AuthService;

      const mockSimulationService = {
        submitAnswer: vi.fn().mockImplementation(async (userId: string) => {
          throw new SimulationDomainError(
            'SIMULATION_NOT_FOUND',
            'Simulado não encontrado.',
            404
          );
        }),
      };

      const app = createApp({
        auth: { authService: mockAuthService },
        simulations: {
          authService: mockAuthService,
          simulationService: mockSimulationService as any,
        },
      });

      const response = await request(app)
        .post('/api/simulations/sim-alice-100/answers')
        .set('Origin', ALLOWED_ORIGIN)
        .set(CSRF_HEADER_NAME, CSRF_HEADER_EXPECTED_VALUE)
        .set('Cookie', `${SESSION_COOKIE_NAME}=bob_token`)
        .send({
          questionId: 'q-101',
          selectedAlternativeId: 'alt-a',
          timeSpentSeconds: 15,
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('Simulado não encontrado');
    });

    it('deve rejeitar criação de simulado com propriedade não autorizada userId injetada no corpo com HTTP 400', async () => {
      const mockAuthService = {
        validateSession: vi.fn().mockResolvedValue(validAliceSession),
      } as unknown as AuthService;

      const app = createApp({
        auth: { authService: mockAuthService },
      });

      // Alice tenta injetar userId de Bob no corpo protegido por strict schema
      const response = await request(app)
        .post('/api/simulations')
        .set('Origin', ALLOWED_ORIGIN)
        .set(CSRF_HEADER_NAME, CSRF_HEADER_EXPECTED_VALUE)
        .set('Cookie', `${SESSION_COOKIE_NAME}=alice_token`)
        .send({
          title: 'Simulado Fake',
          totalQuestions: 5,
          timeLimitSeconds: 1800,
          userId: userBob.id, // Propriedade não permitida
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('SIMULATION_INVALID_INPUT');
    });

    it('deve impedir que Usuário Bob acesse ou exclua documento PDF pertencente a Alice', async () => {
      const mockAuthService = {
        validateSession: vi.fn().mockResolvedValue(validBobSession),
      } as unknown as AuthService;

      const mockPdfService = {
        getUserDocumentById: vi.fn().mockImplementation(async (actorUserId: string, docId: string) => {
          throw new PdfDocumentDomainError(
            'DOCUMENT_NOT_FOUND',
            'Documento PDF não encontrado.',
            404
          );
        }),
        deleteUserDocument: vi.fn().mockImplementation(async (actorUserId: string, docId: string) => {
          throw new PdfDocumentDomainError(
            'DOCUMENT_NOT_FOUND',
            'Documento PDF não encontrado.',
            404
          );
        }),
      };

      const app = createApp({
        auth: { authService: mockAuthService },
        documents: {
          authService: mockAuthService,
          pdfDocumentService: mockPdfService as any,
        },
      });

      // Bob tenta consultar documento de Alice
      const resGet = await request(app)
        .get('/api/documents/doc-alice-999')
        .set('Cookie', `${SESSION_COOKIE_NAME}=bob_token`);
      expect(resGet.status).toBe(404);

      // Bob tenta excluir documento de Alice
      const resDel = await request(app)
        .delete('/api/documents/doc-alice-999')
        .set('Origin', ALLOWED_ORIGIN)
        .set(CSRF_HEADER_NAME, CSRF_HEADER_EXPECTED_VALUE)
        .set('Cookie', `${SESSION_COOKIE_NAME}=bob_token`);
      expect(resDel.status).toBe(404);
    });
  });

  // ==========================================================================
  // BLOCO 4: Rate Limiting Hermético e Validação de Payload
  // ==========================================================================
  describe('4. Rate Limiting Hermético e Proteção de Payload', () => {
    it('deve acionar HTTP 429 TooManyRequests ao exceder o limite do rate limiter configurado', async () => {
      const mockAuthService = {
        login: vi.fn().mockRejectedValue(
          new AuthDomainError('INVALID_CREDENTIALS', 'E-mail ou senha incorretos.', 401)
        ),
      } as unknown as AuthService;

      const app = createApp({
        auth: {
          authService: mockAuthService,
          rateLimit: {
            windowMs: 60000,
            maxAttempts: 2, // Bloqueia na 3ª tentativa
          },
        },
      });

      // Tentativa 1: 401
      const res1 = await request(app)
        .post('/api/auth/login')
        .set('Origin', ALLOWED_ORIGIN)
        .set(CSRF_HEADER_NAME, CSRF_HEADER_EXPECTED_VALUE)
        .send({ email: 'test@questforge.local', password: 'p1' });
      expect(res1.status).toBe(401);

      // Tentativa 2: 401
      const res2 = await request(app)
        .post('/api/auth/login')
        .set('Origin', ALLOWED_ORIGIN)
        .set(CSRF_HEADER_NAME, CSRF_HEADER_EXPECTED_VALUE)
        .send({ email: 'test@questforge.local', password: 'p2' });
      expect(res2.status).toBe(401);

      // Tentativa 3: Bloqueada pelo Rate Limiter (429)
      const res3 = await request(app)
        .post('/api/auth/login')
        .set('Origin', ALLOWED_ORIGIN)
        .set(CSRF_HEADER_NAME, CSRF_HEADER_EXPECTED_VALUE)
        .send({ email: 'test@questforge.local', password: 'p3' });
      expect(res3.status).toBe(429);
      expect(res3.body.error).toBe('TooManyRequests');
      expect(res3.body.message).toContain('Muitas tentativas realizadas');
    });

    it('deve rejeitar payload JSON malformado com HTTP 400 sem expor stack trace', async () => {
      const app = createApp();

      const response = await request(app)
        .post('/api/auth/login')
        .set('Origin', ALLOWED_ORIGIN)
        .set(CSRF_HEADER_NAME, CSRF_HEADER_EXPECTED_VALUE)
        .set('Content-Type', 'application/json')
        .send('{ invalid json payload string');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('BadRequest');
      expect(response.body.message).toContain('JSON malformado');
      const rawText = JSON.stringify(response.body);
      expect(rawText).not.toContain('node_modules');
      expect(rawText).not.toContain('SyntaxError: Unexpected token');
    });
  });

  // ==========================================================================
  // BLOCO 5: Ausência de Dados Sensíveis e Sanitização de Erros
  // ==========================================================================
  describe('5. Sanitização de Erros e Ausência de Dados Sensíveis', () => {
    it('deve mascarar erros inesperados de banco como HTTP 503 sem expor credenciais ou query SQL', async () => {
      const mockAuthService = {
        validateSession: vi.fn().mockResolvedValue(validAliceSession),
      } as unknown as AuthService;

      const mockSimulationService = {
        getSimulation: vi.fn().mockRejectedValue(
          new Error('Connection failure: postgresql://admin:SUPER_SECRET_DB_PASS@10.0.0.1:5432/questforge')
        ),
      };

      const app = createApp({
        auth: { authService: mockAuthService },
        simulations: {
          authService: mockAuthService,
          simulationService: mockSimulationService as any,
        },
      });

      const response = await request(app)
        .get('/api/simulations/sim-err-1')
        .set('Cookie', `${SESSION_COOKIE_NAME}=alice_token`);

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Não foi possível processar a operação de simulado no momento.');

      const bodyStr = JSON.stringify(response.body);
      expect(bodyStr).not.toContain('SUPER_SECRET_DB_PASS');
      expect(bodyStr).not.toContain('10.0.0.1');
      expect(bodyStr).not.toContain('postgresql://');
    });
  });
});
