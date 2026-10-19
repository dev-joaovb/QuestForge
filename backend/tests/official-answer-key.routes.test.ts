import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { OfficialAnswerKey, OfficialAnswerKeyItem } from '@prisma/client';
import { createApp } from '../src/app.ts';
import { AuthService } from '../src/services/auth.service.ts';
import { OfficialAnswerKeyService } from '../src/services/official-answer-key.service.ts';
import {
  OfficialAnswerKeyError,
  type OfficialAnswerKeyWithItems,
} from '../src/types/official-answer-key.types.ts';
import { AuthDomainError, type ValidatedSessionResult } from '../src/types/auth.types.ts';
import { CSRF_HEADER_EXPECTED_VALUE } from '../src/middlewares/csrf.middleware.ts';
import { SESSION_COOKIE_NAME } from '../src/utils/cookies.ts';

describe('Rotas HTTP de Gabaritos Oficiais (/api/official-answer-keys e /api/answer-keys) — Sprint 5.2.5', () => {
  const TEST_SECRET = 'test_session_secret_with_at_least_32_characters_long_999';
  const ALLOWED_ORIGIN = 'http://localhost:3000';

  const userOwner = {
    id: 'user-owner-1',
    name: 'Professor Titular',
    email: 'titular@questforge.local',
    avatarUrl: null,
    createdAt: new Date('2026-10-15T10:00:00Z'),
    updatedAt: new Date('2026-10-15T10:00:00Z'),
  };

  const otherUser = {
    id: 'user-other-2',
    name: 'Outro Usuário',
    email: 'outro@questforge.local',
    avatarUrl: null,
    createdAt: new Date('2026-10-15T10:00:00Z'),
    updatedAt: new Date('2026-10-15T10:00:00Z'),
  };

  const validKeyId = '33333333-3333-4333-8333-333333333333';
  const validExamId = '22222222-2222-4222-8222-222222222222';

  const baseItem: OfficialAnswerKeyItem = {
    id: 'item-1',
    answerKeyId: validKeyId,
    questionNumber: 1,
    questionId: null,
    correctAnswer: 'A',
    previousAnswer: null,
    status: 'ACTIVE',
    isAnnulled: false,
    justification: null,
    textEvidence: null,
    confidence: null,
    sourcePage: null,
    createdAt: new Date('2026-10-15T10:00:00Z'),
    updatedAt: new Date('2026-10-15T10:00:00Z'),
  };

  const baseDraft: OfficialAnswerKeyWithItems = {
    id: validKeyId,
    userId: userOwner.id,
    examId: validExamId,
    pdfDocumentId: null,
    type: 'PRELIMINARY',
    status: 'DRAFT',
    version: 1,
    isCurrent: false,
    publicationDate: null,
    notes: 'Rascunho inicial',
    createdAt: new Date('2026-10-15T10:00:00Z'),
    updatedAt: new Date('2026-10-15T10:00:00Z'),
    items: [baseItem],
  };

  let mockAuthService: AuthService;
  let mockAnswerKeyService: OfficialAnswerKeyService;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    mockAuthService = {
      validateSession: vi.fn().mockImplementation(async (token: string): Promise<ValidatedSessionResult> => {
        if (token === 'valid-token-owner') {
          return {
            user: userOwner,
            session: {
              id: 'session-1',
              userId: userOwner.id,
              expiresAt: new Date(Date.now() + 3600000),
              createdAt: new Date(),
              lastUsedAt: new Date(),
            },
          };
        }
        if (token === 'valid-token-other') {
          return {
            user: otherUser,
            session: {
              id: 'session-2',
              userId: otherUser.id,
              expiresAt: new Date(Date.now() + 3600000),
              createdAt: new Date(),
              lastUsedAt: new Date(),
            },
          };
        }
        throw new AuthDomainError('SESSION_INVALID_OR_EXPIRED', 'Sessão inválida ou expirada.', 401);
      }),
    } as unknown as AuthService;

    mockAnswerKeyService = {
      createDraft: vi.fn(),
      findById: vi.fn(),
      findByIdWithItems: vi.fn(),
      findCurrentByExamId: vi.fn(),
      findCurrentByExamIdWithItems: vi.fn(),
      findVersionsByExamId: vi.fn(),
      findItemsByAnswerKeyId: vi.fn(),
      findItemByQuestionNumber: vi.fn(),
      updateDraft: vi.fn(),
      addDraftItem: vi.fn(),
      updateDraftItem: vi.fn(),
      replaceDraftItems: vi.fn(),
      deleteDraft: vi.fn(),
      publishAnswerKey: vi.fn(),
    } as unknown as OfficialAnswerKeyService;

    app = createApp({
      csrf: { allowedOrigins: [ALLOWED_ORIGIN] },
      auth: { authService: mockAuthService },
      officialAnswerKeys: {
        authService: mockAuthService,
        officialAnswerKeyService: mockAnswerKeyService,
      },
    });
  });

  // Helper para injetar cookies e headers válidos
  function authedAgent(token = 'valid-token-owner') {
    return request(app);
  }

  describe('1. Autenticação Obrigatória e Sessão (Fail-Closed)', () => {
    it('deve retornar 401 Unauthorized se o cookie qf_session estiver ausente', async () => {
      const res = await request(app).get(`/api/official-answer-keys/${validKeyId}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
      expect(mockAnswerKeyService.findById).not.toHaveBeenCalled();
    });

    it('deve retornar 401 Unauthorized se a sessão for inválida ou expirada', async () => {
      const res = await request(app)
        .get(`/api/official-answer-keys/${validKeyId}`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=token-invalido`]);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
      expect(mockAnswerKeyService.findById).not.toHaveBeenCalled();
    });
  });

  describe('2. Proteção CSRF nas Operações Mutáveis', () => {
    it('deve rejeitar POST sem o cabeçalho X-Requested-With com 403 CsrfValidationFailed', async () => {
      const res = await request(app)
        .post('/api/official-answer-keys')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`])
        .send({ examId: validExamId });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('CsrfValidationFailed');
      expect(mockAnswerKeyService.createDraft).not.toHaveBeenCalled();
    });

    it('deve rejeitar PATCH sem o cabeçalho X-Requested-With com 403', async () => {
      const res = await request(app)
        .patch(`/api/official-answer-keys/${validKeyId}`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`])
        .send({ notes: 'Nova nota' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('CsrfValidationFailed');
      expect(mockAnswerKeyService.updateDraft).not.toHaveBeenCalled();
    });

    it('deve rejeitar DELETE sem o cabeçalho X-Requested-With com 403', async () => {
      const res = await request(app)
        .delete(`/api/official-answer-keys/${validKeyId}`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`]);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('CsrfValidationFailed');
      expect(mockAnswerKeyService.deleteDraft).not.toHaveBeenCalled();
    });

    it('deve aceitar mutação quando X-Requested-With e cookie forem válidos', async () => {
      vi.mocked(mockAnswerKeyService.createDraft).mockResolvedValueOnce(baseDraft);

      const res = await request(app)
        .post('/api/official-answer-keys')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`])
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({ examId: validExamId });

      expect(res.status).toBe(201);
      expect(res.body.answerKey.id).toBe(validKeyId);
    });
  });

  describe('3. POST /api/official-answer-keys — Criação de Rascunho', () => {
    it('deve criar rascunho com sucesso ignorando userId vindo no payload e usando req.user.id', async () => {
      vi.mocked(mockAnswerKeyService.createDraft).mockResolvedValueOnce(baseDraft);

      const res = await request(app)
        .post('/api/official-answer-keys')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`])
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({
          examId: validExamId,
          userId: 'hacker-user-attempting-spoof', // Deve ser ignorado pelo controller/service
          type: 'PRELIMINARY',
        });

      expect(res.status).toBe(201);
      expect(res.body.answerKey).toBeDefined();
      expect(mockAnswerKeyService.createDraft).toHaveBeenCalledWith(
        userOwner.id, // Identidade autêntica injetada
        expect.objectContaining({ examId: validExamId })
      );
    });

    it('deve mapear erro de validação (400) quando campos obrigatórios estiverem incorretos', async () => {
      vi.mocked(mockAnswerKeyService.createDraft).mockRejectedValueOnce(
        new OfficialAnswerKeyError('ANSWER_KEY_INVALID_DATA', 'O identificador da prova (examId) deve ser um UUID válido.', 400)
      );

      const res = await request(app)
        .post('/api/official-answer-keys')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`])
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({ examId: 'not-a-uuid' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ANSWER_KEY_INVALID_DATA');
      expect(res.body.message).toContain('UUID válido');
    });

    it('deve retornar 404/403 se a prova pertencer a outro usuário ou não existir', async () => {
      vi.mocked(mockAnswerKeyService.createDraft).mockRejectedValueOnce(
        new OfficialAnswerKeyError('EXAM_NOT_FOUND', 'Prova não encontrada.', 404)
      );

      const res = await request(app)
        .post('/api/official-answer-keys')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`])
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({ examId: validExamId });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('EXAM_NOT_FOUND');
    });
  });

  describe('4. GET /api/official-answer-keys/:id — Consulta por ID e Opção includeItems', () => {
    it('deve consultar gabarito sem itens quando includeItems for omitido ou false', async () => {
      vi.mocked(mockAnswerKeyService.findById).mockResolvedValueOnce(baseDraft);

      const res = await request(app)
        .get(`/api/official-answer-keys/${validKeyId}`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`]);

      expect(res.status).toBe(200);
      expect(res.body.answerKey.id).toBe(validKeyId);
      expect(mockAnswerKeyService.findById).toHaveBeenCalledWith(
        userOwner.id,
        validKeyId,
        { includeItems: false }
      );
    });

    it('deve consultar gabarito com itens quando includeItems=true', async () => {
      vi.mocked(mockAnswerKeyService.findByIdWithItems).mockResolvedValueOnce(baseDraft);

      const res = await request(app)
        .get(`/api/official-answer-keys/${validKeyId}?includeItems=true`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`]);

      expect(res.status).toBe(200);
      expect(res.body.answerKey.items).toHaveLength(1);
      expect(mockAnswerKeyService.findByIdWithItems).toHaveBeenCalledWith(
        userOwner.id,
        validKeyId
      );
    });

    it('deve retornar 400 se includeItems tiver valor inválido', async () => {
      const res = await request(app)
        .get(`/api/official-answer-keys/${validKeyId}?includeItems=invalid_boolean`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`]);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ANSWER_KEY_INVALID_DATA');
      expect(res.body.message).toContain('includeItems inválido');
    });

    it('deve retornar 404 quando o gabarito não pertencer ao usuário autenticado', async () => {
      vi.mocked(mockAnswerKeyService.findById).mockRejectedValueOnce(
        new OfficialAnswerKeyError('ANSWER_KEY_NOT_FOUND', 'Gabarito oficial não encontrado.', 404)
      );

      const res = await request(app)
        .get(`/api/official-answer-keys/${validKeyId}`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`]);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('ANSWER_KEY_NOT_FOUND');
    });
  });

  describe('5. GET /api/official-answer-keys/exams/:examId/current — Gabarito Vigente de uma Prova', () => {
    it('deve retornar o gabarito vigente da prova', async () => {
      vi.mocked(mockAnswerKeyService.findCurrentByExamId).mockResolvedValueOnce({
        ...baseDraft,
        status: 'PUBLISHED',
        isCurrent: true,
      });

      const res = await request(app)
        .get(`/api/official-answer-keys/exams/${validExamId}/current`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`]);

      expect(res.status).toBe(200);
      expect(res.body.answerKey.isCurrent).toBe(true);
      expect(mockAnswerKeyService.findCurrentByExamId).toHaveBeenCalledWith(
        userOwner.id,
        validExamId,
        { includeItems: false }
      );
    });

    it('deve retornar null no corpo quando não houver gabarito vigente para a prova', async () => {
      vi.mocked(mockAnswerKeyService.findCurrentByExamId).mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/api/official-answer-keys/exams/${validExamId}/current`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`]);

      expect(res.status).toBe(200);
      expect(res.body.answerKey).toBeNull();
    });

    it('deve consultar gabarito vigente incluindo itens com includeItems=true', async () => {
      vi.mocked(mockAnswerKeyService.findCurrentByExamIdWithItems).mockResolvedValueOnce({
        ...baseDraft,
        status: 'PUBLISHED',
        isCurrent: true,
      });

      const res = await request(app)
        .get(`/api/official-answer-keys/exams/${validExamId}/current?includeItems=true`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`]);

      expect(res.status).toBe(200);
      expect(mockAnswerKeyService.findCurrentByExamIdWithItems).toHaveBeenCalledWith(
        userOwner.id,
        validExamId
      );
    });
  });

  describe('6. GET /api/official-answer-keys/exams/:examId/versions — Histórico de Versões', () => {
    it('deve listar versões de uma prova com sucesso', async () => {
      vi.mocked(mockAnswerKeyService.findVersionsByExamId).mockResolvedValueOnce([baseDraft]);

      const res = await request(app)
        .get(`/api/official-answer-keys/exams/${validExamId}/versions`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`]);

      expect(res.status).toBe(200);
      expect(res.body.versions).toHaveLength(1);
      expect(mockAnswerKeyService.findVersionsByExamId).toHaveBeenCalledWith(
        userOwner.id,
        validExamId,
        expect.any(Object)
      );
    });

    it('deve permitir filtro por type e rejeitar type inválido com 400', async () => {
      vi.mocked(mockAnswerKeyService.findVersionsByExamId).mockRejectedValueOnce(
        new OfficialAnswerKeyError('ANSWER_KEY_INVALID_DATA', 'Tipo de gabarito inválido.', 400)
      );

      const res = await request(app)
        .get(`/api/official-answer-keys/exams/${validExamId}/versions?type=TIPO_INEXISTENTE`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`]);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ANSWER_KEY_INVALID_DATA');
    });
  });

  describe('7. Itens do Gabarito: GET, POST e Consulta Específica', () => {
    it('GET /api/official-answer-keys/:id/items — deve listar itens do gabarito', async () => {
      vi.mocked(mockAnswerKeyService.findItemsByAnswerKeyId).mockResolvedValueOnce([baseItem]);

      const res = await request(app)
        .get(`/api/official-answer-keys/${validKeyId}/items`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`]);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
    });

    it('GET /api/official-answer-keys/:id/items/:questionNumber — deve retornar item específico', async () => {
      vi.mocked(mockAnswerKeyService.findItemByQuestionNumber).mockResolvedValueOnce(baseItem);

      const res = await request(app)
        .get(`/api/official-answer-keys/${validKeyId}/items/1`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`]);

      expect(res.status).toBe(200);
      expect(res.body.item.questionNumber).toBe(1);
      expect(mockAnswerKeyService.findItemByQuestionNumber).toHaveBeenCalledWith(
        userOwner.id,
        validKeyId,
        1
      );
    });

    it('GET /api/official-answer-keys/:id/items/:questionNumber — deve rejeitar questionNumber não inteiro ou < 1 com 400', async () => {
      const res = await request(app)
        .get(`/api/official-answer-keys/${validKeyId}/items/0`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`]);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ANSWER_KEY_INVALID_DATA');
      expect(mockAnswerKeyService.findItemByQuestionNumber).not.toHaveBeenCalled();
    });

    it('POST /api/official-answer-keys/:id/items — deve adicionar item com sucesso ao rascunho', async () => {
      const newItem: OfficialAnswerKeyItem = {
        ...baseItem,
        id: 'item-2',
        questionNumber: 2,
        correctAnswer: 'B',
      };
      vi.mocked(mockAnswerKeyService.addDraftItem).mockResolvedValueOnce(newItem);

      const res = await request(app)
        .post(`/api/official-answer-keys/${validKeyId}/items`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`])
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({ questionNumber: 2, correctAnswer: 'B' });

      expect(res.status).toBe(201);
      expect(res.body.item.questionNumber).toBe(2);
      expect(mockAnswerKeyService.addDraftItem).toHaveBeenCalledWith(
        userOwner.id,
        validKeyId,
        expect.objectContaining({ questionNumber: 2, correctAnswer: 'B' })
      );
    });

    it('POST /api/official-answer-keys/:id/items — deve retornar 422 quando questionNumber já existir no gabarito', async () => {
      vi.mocked(mockAnswerKeyService.addDraftItem).mockRejectedValueOnce(
        new OfficialAnswerKeyError('ANSWER_KEY_DUPLICATE_ITEM', 'Já existe um item com o número de questão 1 neste gabarito oficial.', 422)
      );

      const res = await request(app)
        .post(`/api/official-answer-keys/${validKeyId}/items`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`])
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({ questionNumber: 1, correctAnswer: 'A' });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('ANSWER_KEY_DUPLICATE_ITEM');
    });

    it('POST /api/official-answer-keys/:id/items — deve retornar 422 se o gabarito não for DRAFT', async () => {
      vi.mocked(mockAnswerKeyService.addDraftItem).mockRejectedValueOnce(
        new OfficialAnswerKeyError('ANSWER_KEY_NOT_DRAFT', 'Apenas gabaritos em estado DRAFT podem receber novos itens.', 422)
      );

      const res = await request(app)
        .post(`/api/official-answer-keys/${validKeyId}/items`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`])
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({ questionNumber: 2, correctAnswer: 'B' });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('ANSWER_KEY_NOT_DRAFT');
    });
  });

  describe('8. PATCH /api/official-answer-keys/:id/items/:questionNumber — Atualização de Item', () => {
    it('deve atualizar item individual com sucesso', async () => {
      const updatedItem = { ...baseItem, correctAnswer: 'C' };
      vi.mocked(mockAnswerKeyService.updateDraftItem).mockResolvedValueOnce(updatedItem);

      const res = await request(app)
        .patch(`/api/official-answer-keys/${validKeyId}/items/1`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`])
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({ correctAnswer: 'C' });

      expect(res.status).toBe(200);
      expect(res.body.item.correctAnswer).toBe('C');
      expect(mockAnswerKeyService.updateDraftItem).toHaveBeenCalledWith(
        userOwner.id,
        validKeyId,
        1,
        expect.objectContaining({ correctAnswer: 'C' })
      );
    });

    it('deve rejeitar inconsistência de anulação com 400', async () => {
      vi.mocked(mockAnswerKeyService.updateDraftItem).mockRejectedValueOnce(
        new OfficialAnswerKeyError('ANSWER_KEY_INVALID_DATA', 'Itens com status ANNULLED devem possuir isAnnulled como true.', 400)
      );

      const res = await request(app)
        .patch(`/api/official-answer-keys/${validKeyId}/items/1`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`])
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({ status: 'ANNULLED', isAnnulled: false });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ANSWER_KEY_INVALID_DATA');
    });
  });

  describe('9. PUT /api/official-answer-keys/:id/items — Substituição em Lote', () => {
    it('deve substituir itens com sucesso', async () => {
      vi.mocked(mockAnswerKeyService.replaceDraftItems).mockResolvedValueOnce([baseItem]);

      const res = await request(app)
        .put(`/api/official-answer-keys/${validKeyId}/items`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`])
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({ items: [{ questionNumber: 1, correctAnswer: 'A' }] });

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
    });

    it('deve rejeitar payload com itens em duplicidade com 422', async () => {
      vi.mocked(mockAnswerKeyService.replaceDraftItems).mockRejectedValueOnce(
        new OfficialAnswerKeyError('ANSWER_KEY_DUPLICATE_ITEM', 'Número de questão duplicado: questão 1.', 422)
      );

      const res = await request(app)
        .put(`/api/official-answer-keys/${validKeyId}/items`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`])
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({
          items: [
            { questionNumber: 1, correctAnswer: 'A' },
            { questionNumber: 1, correctAnswer: 'B' },
          ],
        });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('ANSWER_KEY_DUPLICATE_ITEM');
    });
  });

  describe('10. PATCH /api/official-answer-keys/:id — Atualização do Rascunho', () => {
    it('deve atualizar metadados de rascunho com sucesso', async () => {
      const updatedDraft = { ...baseDraft, notes: 'Notas atualizadas' };
      vi.mocked(mockAnswerKeyService.updateDraft).mockResolvedValueOnce(updatedDraft);

      const res = await request(app)
        .patch(`/api/official-answer-keys/${validKeyId}`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`])
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({ notes: 'Notas atualizadas' });

      expect(res.status).toBe(200);
      expect(res.body.answerKey.notes).toBe('Notas atualizadas');
    });

    it('deve rejeitar payload vazio {} com 400', async () => {
      vi.mocked(mockAnswerKeyService.updateDraft).mockRejectedValueOnce(
        new OfficialAnswerKeyError('ANSWER_KEY_INVALID_DATA', 'Pelo menos um campo deve ser fornecido para atualização.', 400)
      );

      const res = await request(app)
        .patch(`/api/official-answer-keys/${validKeyId}`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`])
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ANSWER_KEY_INVALID_DATA');
    });

    it('deve rejeitar edição se o gabarito já estiver publicado com 422', async () => {
      vi.mocked(mockAnswerKeyService.updateDraft).mockRejectedValueOnce(
        new OfficialAnswerKeyError('ANSWER_KEY_NOT_DRAFT', 'Apenas gabaritos em estado DRAFT podem ser editados.', 422)
      );

      const res = await request(app)
        .patch(`/api/official-answer-keys/${validKeyId}`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`])
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({ notes: 'Nova nota' });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('ANSWER_KEY_NOT_DRAFT');
    });
  });

  describe('11. DELETE /api/official-answer-keys/:id — Exclusão de Rascunho', () => {
    it('deve excluir rascunho com sucesso retornando mensagem de confirmação', async () => {
      vi.mocked(mockAnswerKeyService.deleteDraft).mockResolvedValueOnce(undefined);

      const res = await request(app)
        .delete(`/api/official-answer-keys/${validKeyId}`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`])
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('excluído com sucesso');
      expect(mockAnswerKeyService.deleteDraft).toHaveBeenCalledWith(userOwner.id, validKeyId);
    });

    it('deve rejeitar exclusão de gabarito publicado com 422', async () => {
      vi.mocked(mockAnswerKeyService.deleteDraft).mockRejectedValueOnce(
        new OfficialAnswerKeyError('ANSWER_KEY_NOT_DRAFT', 'Apenas gabaritos em estado DRAFT podem ser excluídos.', 422)
      );

      const res = await request(app)
        .delete(`/api/official-answer-keys/${validKeyId}`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`])
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE);

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('ANSWER_KEY_NOT_DRAFT');
    });
  });

  describe('12. POST /api/official-answer-keys/:id/publish — Publicação e Regras de Integridade', () => {
    it('deve publicar o gabarito com sucesso', async () => {
      const publishedDraft: OfficialAnswerKeyWithItems = {
        ...baseDraft,
        status: 'PUBLISHED',
        isCurrent: true,
      };
      vi.mocked(mockAnswerKeyService.publishAnswerKey).mockResolvedValueOnce(publishedDraft);

      const res = await request(app)
        .post(`/api/official-answer-keys/${validKeyId}/publish`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`])
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({ confirmAllReviewed: true });

      expect(res.status).toBe(200);
      expect(res.body.answerKey.status).toBe('PUBLISHED');
      expect(res.body.answerKey.isCurrent).toBe(true);
      expect(mockAnswerKeyService.publishAnswerKey).toHaveBeenCalledWith(
        userOwner.id,
        validKeyId,
        expect.any(Object)
      );
    });

    it('deve rejeitar publicação de gabarito com itens NEEDS_REVIEW com 400', async () => {
      vi.mocked(mockAnswerKeyService.publishAnswerKey).mockRejectedValueOnce(
        new OfficialAnswerKeyError('ANSWER_KEY_INVALID_DATA', 'Não é possível publicar o gabarito com itens pendentes de revisão humana (questão 1).', 400)
      );

      const res = await request(app)
        .post(`/api/official-answer-keys/${validKeyId}/publish`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`])
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({ confirmAllReviewed: true });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ANSWER_KEY_INVALID_DATA');
      expect(res.body.message).toContain('pendentes de revisão humana');
    });

    it('deve converter conflito de concorrência de publicação em 409 ANSWER_KEY_PUBLISH_CONFLICT', async () => {
      vi.mocked(mockAnswerKeyService.publishAnswerKey).mockRejectedValueOnce(
        new OfficialAnswerKeyError(
          'ANSWER_KEY_PUBLISH_CONFLICT',
          'Conflito de publicação concorrente: outra versão deste gabarito oficial foi ativada simultaneamente.',
          409
        )
      );

      const res = await request(app)
        .post(`/api/official-answer-keys/${validKeyId}/publish`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`])
        .set('X-Requested-With', CSRF_HEADER_EXPECTED_VALUE)
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('ANSWER_KEY_PUBLISH_CONFLICT');
      expect(res.body.message).toContain('Conflito de publicação concorrente');
    });
  });

  describe('13. Tratamento Seguro de Erros Inesperados', () => {
    it('deve retornar 503 ServiceUnavailable e logar erro inesperado sem expor SQL ou stack trace', async () => {
      vi.mocked(mockAnswerKeyService.findById).mockRejectedValueOnce(
        new Error('FATAL: connection to PostgreSQL at 127.0.0.1:5432 failed: password authentication failed')
      );

      const res = await request(app)
        .get(`/api/official-answer-keys/${validKeyId}`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`]);

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('ServiceUnavailable');
      expect(res.body.message).toBe('Não foi possível processar a operação em gabaritos oficiais no momento.');
      // Garante que o detalhe da senha ou SQL não foi vazado no JSON
      expect(JSON.stringify(res.body)).not.toContain('PostgreSQL');
      expect(JSON.stringify(res.body)).not.toContain('password');
    });
  });

  describe('14. Rota Alias /api/answer-keys', () => {
    it('deve permitir acesso através do alias /api/answer-keys/:id', async () => {
      vi.mocked(mockAnswerKeyService.findById).mockResolvedValueOnce(baseDraft);

      const res = await request(app)
        .get(`/api/answer-keys/${validKeyId}`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`]);

      expect(res.status).toBe(200);
      expect(res.body.answerKey.id).toBe(validKeyId);
    });

    it('deve permitir acesso através do alias /api/answer-keys/exams/:examId/current', async () => {
      vi.mocked(mockAnswerKeyService.findCurrentByExamId).mockResolvedValueOnce(baseDraft);

      const res = await request(app)
        .get(`/api/answer-keys/exams/${validExamId}/current`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=valid-token-owner`]);

      expect(res.status).toBe(200);
      expect(res.body.answerKey.id).toBe(validKeyId);
    });
  });
});
