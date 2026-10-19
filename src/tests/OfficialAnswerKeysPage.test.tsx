import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../App.tsx';
import type { OfficialAnswerKeyDTO, OfficialAnswerKeyItemDTO } from '../types/index.ts';
import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from '../services/api.ts';

describe('Interface de Gabaritos Oficiais (src/tests/OfficialAnswerKeysPage.test.tsx) — Sprint 5.2.6', () => {
  const originalFetch = globalThis.fetch;

  const validExamId = '22222222-2222-4222-8222-222222222222';
  const validKeyId = '33333333-3333-4333-8333-333333333333';

  const mockAuthenticatedUser = {
    user: {
      id: 'user-auth-1',
      name: 'Professor Titular',
      email: 'titular@questforge.dev',
      avatarUrl: null,
      createdAt: '2026-10-15T10:00:00.000Z',
      updatedAt: '2026-10-15T10:00:00.000Z',
    },
    session: {
      id: 'session-auth-1',
      userId: 'user-auth-1',
      expiresAt: '2026-10-20T10:00:00.000Z',
      createdAt: '2026-10-15T10:00:00.000Z',
      lastUsedAt: '2026-10-15T10:00:00.000Z',
    },
  };

  const sampleDraftItem: OfficialAnswerKeyItemDTO = {
    id: 'item-1',
    answerKeyId: validKeyId,
    questionNumber: 1,
    questionId: null,
    correctAnswer: 'A',
    previousAnswer: null,
    status: 'ACTIVE',
    isAnnulled: false,
    justification: 'Texto claro da questão',
    textEvidence: 'Linha 12 do edital',
    confidence: 1.0,
    sourcePage: 1,
    createdAt: '2026-10-15T10:00:00.000Z',
    updatedAt: '2026-10-15T10:00:00.000Z',
  };

  const sampleDraftKey: OfficialAnswerKeyDTO = {
    id: validKeyId,
    userId: 'user-auth-1',
    examId: validExamId,
    pdfDocumentId: null,
    type: 'PRELIMINARY',
    status: 'DRAFT',
    version: 1,
    isCurrent: false,
    publicationDate: null,
    notes: 'Rascunho preliminar',
    createdAt: '2026-10-15T10:00:00.000Z',
    updatedAt: '2026-10-15T10:00:00.000Z',
    items: [sampleDraftItem],
  };

  const samplePublishedKey: OfficialAnswerKeyDTO = {
    id: '44444444-4444-4444-8444-444444444444',
    userId: 'user-auth-1',
    examId: validExamId,
    pdfDocumentId: null,
    type: 'PRELIMINARY',
    status: 'PUBLISHED',
    version: 1,
    isCurrent: true,
    publicationDate: '2026-10-15T12:00:00.000Z',
    notes: 'Gabarito oficial homologado',
    createdAt: '2026-10-15T10:00:00.000Z',
    updatedAt: '2026-10-15T12:00:00.000Z',
    items: [sampleDraftItem],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('1. deve renderizar a página inicial com cabeçalho e campo de identificação da prova', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/answer-keys']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /Gabaritos Oficiais/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Exemplo: 22222222-2222-4222-8222/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Consultar Prova/i })).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma prova selecionada/i)).toBeInTheDocument();
  });

  it('2. deve validar UUID antes de consultar a prova e exibir mensagem de erro para entrada inválida', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/answer-keys']}>
        <AppRoutes />
      </MemoryRouter>
    );

    const input = await screen.findByPlaceholderText(/Exemplo: 22222222-2222-4222-8222/i);
    const submitBtn = screen.getByRole('button', { name: /Consultar Prova/i });

    // Envio vazio
    fireEvent.click(submitBtn);
    expect(await screen.findByText(/Informe o identificador único \(UUID\) da prova/i)).toBeInTheDocument();

    // Envio com texto inválido (não UUID)
    fireEvent.change(input, { target: { value: 'prova-invalida-123' } });
    fireEvent.click(submitBtn);
    expect(await screen.findByText(/O identificador deve ser um UUID válido/i)).toBeInTheDocument();
  });

  it('3. deve carregar dados da prova quando o UUID for válido e exibir estado sem gabarito vigente', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }
      if (url.includes(`/current`)) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ answerKey: null }),
        } as Response;
      }
      if (url.includes(`/versions`)) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ versions: [] }),
        } as Response;
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/answer-keys']}>
        <AppRoutes />
      </MemoryRouter>
    );

    const input = await screen.findByPlaceholderText(/Exemplo: 22222222-2222-4222-8222/i);
    fireEvent.change(input, { target: { value: validExamId } });
    fireEvent.click(screen.getByRole('button', { name: /Consultar Prova/i }));

    expect(await screen.findByText(/Nenhum gabarito vigente ou rascunho selecionado/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Criar Primeiro Rascunho/i })).toBeInTheDocument();
  });

  it('4. deve criar um novo rascunho com sucesso incluindo cabeçalhos CSRF e credenciais', async () => {
    let capturedRequest: RequestInit | undefined;
    let capturedUrl = '';

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      capturedUrl = url;
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }
      if (url.includes(`/current`)) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ answerKey: null }),
        } as Response;
      }
      if (url.includes(`/versions`)) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ versions: [] }),
        } as Response;
      }
      if (url.endsWith('/api/official-answer-keys') && init?.method === 'POST') {
        capturedRequest = init;
        return {
          status: 201,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ answerKey: sampleDraftKey }),
        } as Response;
      }
      if (url.includes(validKeyId)) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ answerKey: sampleDraftKey }),
        } as Response;
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/answer-keys']}>
        <AppRoutes />
      </MemoryRouter>
    );

    // Carrega a prova
    const input = await screen.findByPlaceholderText(/Exemplo: 22222222-2222-4222-8222/i);
    fireEvent.change(input, { target: { value: validExamId } });
    fireEvent.click(screen.getByRole('button', { name: /Consultar Prova/i }));

    // Clica para criar rascunho
    const createBtn = await screen.findByRole('button', { name: /Criar Primeiro Rascunho/i });
    fireEvent.click(createBtn);

    // Modal abre
    expect(await screen.findByRole('heading', { name: /Criar Rascunho de Gabarito/i })).toBeInTheDocument();
    const notesInput = screen.getByPlaceholderText(/Observações sobre banca/i);
    fireEvent.change(notesInput, { target: { value: 'Rascunho de teste inicial' } });

    // Submete formulário
    fireEvent.click(screen.getByRole('button', { name: /^Criar Rascunho$/i }));

    // Confirma envio correto
    await waitFor(() => {
      expect(capturedRequest).toBeDefined();
    });
    expect(capturedRequest?.method).toBe('POST');
    expect(capturedRequest?.credentials).toBe('include');
    const headers = capturedRequest?.headers as Record<string, string>;
    expect(headers[CSRF_HEADER_NAME]).toBe(CSRF_HEADER_VALUE);
    expect(JSON.parse(String(capturedRequest?.body))).toEqual(
      expect.objectContaining({
        examId: validExamId,
        type: 'PRELIMINARY',
        version: 1,
        notes: 'Rascunho de teste inicial',
      })
    );

    expect(await screen.findByText(/criado com sucesso/i)).toBeInTheDocument();
  });

  it('5. deve listar itens do rascunho e permitir adicionar novo item individual', async () => {
    let itemAddedPayload: any;

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }
      if (url.includes(`/current`)) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ answerKey: sampleDraftKey }),
        } as Response;
      }
      if (url.includes(`/versions`)) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ versions: [sampleDraftKey] }),
        } as Response;
      }
      if (url.includes(`/items`) && init?.method === 'POST') {
        itemAddedPayload = JSON.parse(String(init.body));
        const newItem: OfficialAnswerKeyItemDTO = {
          ...sampleDraftItem,
          id: 'item-2',
          questionNumber: 2,
          correctAnswer: 'B',
        };
        return {
          status: 201,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ item: newItem }),
        } as Response;
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/answer-keys']}>
        <AppRoutes />
      </MemoryRouter>
    );

    // Carrega a prova
    const input = await screen.findByPlaceholderText(/Exemplo: 22222222-2222-4222-8222/i);
    fireEvent.change(input, { target: { value: validExamId } });
    fireEvent.click(screen.getByRole('button', { name: /Consultar Prova/i }));

    // Item 1 deve estar visível
    expect(await screen.findByText(/Questão 1/i)).toBeInTheDocument();

    // Clica em adicionar item
    fireEvent.click(screen.getByRole('button', { name: /Adicionar Item/i }));
    expect(await screen.findByRole('heading', { name: /Adicionar Item ao Rascunho/i })).toBeInTheDocument();

    // Preenche item 2 com resposta B
    const answerInput = screen.getByPlaceholderText(/Ex: A, B, C.../i);
    fireEvent.change(answerInput, { target: { value: 'B' } });

    fireEvent.click(screen.getByRole('button', { name: /^Salvar Item$/i }));

    await waitFor(() => {
      expect(itemAddedPayload).toBeDefined();
    });
    expect(itemAddedPayload.questionNumber).toBe(2);
    expect(itemAddedPayload.correctAnswer).toBe('B');

    expect(await screen.findByText(/Item da questão 2 adicionado com sucesso/i)).toBeInTheDocument();
  });

  it('6. deve desabilitar/ocultar botões de edição para gabaritos publicados (somente leitura)', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }
      if (url.includes(`/current`)) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ answerKey: samplePublishedKey }),
        } as Response;
      }
      if (url.includes(`/versions`)) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ versions: [samplePublishedKey] }),
        } as Response;
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/answer-keys']}>
        <AppRoutes />
      </MemoryRouter>
    );

    const input = await screen.findByPlaceholderText(/Exemplo: 22222222-2222-4222-8222/i);
    fireEvent.change(input, { target: { value: validExamId } });
    fireEvent.click(screen.getByRole('button', { name: /Consultar Prova/i }));

    expect(await screen.findByText(/Gabarito Publicado \(Somente Leitura\)/i)).toBeInTheDocument();
    // Botões de alteração não devem estar presentes
    expect(screen.queryByRole('button', { name: /Adicionar Item/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Substituição em Lote/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Excluir Rascunho/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Publicar Gabarito/i })).not.toBeInTheDocument();
  });

  it('7. deve publicar gabarito oficial com sucesso após confirmação', async () => {
    let publishRequested = false;

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }
      if (url.includes(`/current`)) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ answerKey: sampleDraftKey }),
        } as Response;
      }
      if (url.includes(`/versions`)) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ versions: [sampleDraftKey] }),
        } as Response;
      }
      if (url.includes(`/publish`) && init?.method === 'POST') {
        publishRequested = true;
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            answerKey: { ...sampleDraftKey, status: 'PUBLISHED', isCurrent: true },
          }),
        } as Response;
      }
      if (url.includes(validKeyId)) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ answerKey: { ...sampleDraftKey, status: 'PUBLISHED', isCurrent: true } }),
        } as Response;
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/answer-keys']}>
        <AppRoutes />
      </MemoryRouter>
    );

    const input = await screen.findByPlaceholderText(/Exemplo: 22222222-2222-4222-8222/i);
    fireEvent.change(input, { target: { value: validExamId } });
    fireEvent.click(screen.getByRole('button', { name: /Consultar Prova/i }));

    const publishBtn = await screen.findByRole('button', { name: /Publicar Gabarito/i });
    expect(publishBtn).toBeEnabled();
    fireEvent.click(publishBtn);

    // Modal de publicação
    expect(await screen.findByRole('heading', { name: /Publicar Gabarito Oficial/i })).toBeInTheDocument();

    const checkbox = screen.getByRole('checkbox');
    expect(screen.getByRole('button', { name: /Confirmar e Publicar/i })).toBeDisabled();

    fireEvent.click(checkbox);
    expect(screen.getByRole('button', { name: /Confirmar e Publicar/i })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /Confirmar e Publicar/i }));

    await waitFor(() => {
      expect(publishRequested).toBe(true);
    });
    expect(await screen.findByText(/publicado com sucesso e tornado vigente/i)).toBeInTheDocument();
  });

  it('8. deve tratar conflito de concorrência HTTP 409 ao publicar e fornecer botão para recarregar dados', async () => {
    let reloadClicked = false;

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }
      if (url.includes(`/current`)) {
        if (reloadClicked) {
          return {
            status: 200,
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ answerKey: samplePublishedKey }),
          } as Response;
        }
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ answerKey: sampleDraftKey }),
        } as Response;
      }
      if (url.includes(`/versions`)) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ versions: [sampleDraftKey] }),
        } as Response;
      }
      if (url.includes(`/publish`) && init?.method === 'POST') {
        return {
          status: 409,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            error: 'ANSWER_KEY_PUBLISH_CONFLICT',
            message: 'Conflito de publicação concorrente: outra versão deste gabarito oficial foi ativada simultaneamente.',
          }),
        } as Response;
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/answer-keys']}>
        <AppRoutes />
      </MemoryRouter>
    );

    const input = await screen.findByPlaceholderText(/Exemplo: 22222222-2222-4222-8222/i);
    fireEvent.change(input, { target: { value: validExamId } });
    fireEvent.click(screen.getByRole('button', { name: /Consultar Prova/i }));

    const publishBtn = await screen.findByRole('button', { name: /Publicar Gabarito/i });
    fireEvent.click(publishBtn);

    const checkbox = await screen.findByRole('checkbox');
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: /Confirmar e Publicar/i }));

    // Confirma que o aviso de conflito 409 é apresentado
    expect(
      await screen.findByText(/Conflito de publicação concorrente: outra versão deste gabarito oficial foi ativada simultaneamente/i)
    ).toBeInTheDocument();

    const reloadBtn = screen.getByRole('button', { name: /Recarregar Dados Recentes/i });
    expect(reloadBtn).toBeInTheDocument();

    reloadClicked = true;
    fireEvent.click(reloadBtn);

    expect(await screen.findByText(/Gabarito Publicado \(Somente Leitura\)/i)).toBeInTheDocument();
  });

  it('9. deve excluir rascunho com sucesso após confirmação no modal', async () => {
    let deleteCalled = false;

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }
      if (url.includes(`/current`)) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ answerKey: sampleDraftKey }),
        } as Response;
      }
      if (url.includes(`/versions`)) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ versions: [sampleDraftKey] }),
        } as Response;
      }
      if (url.includes(validKeyId) && init?.method === 'DELETE') {
        deleteCalled = true;
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ message: 'Rascunho de gabarito oficial excluído com sucesso.' }),
        } as Response;
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/answer-keys']}>
        <AppRoutes />
      </MemoryRouter>
    );

    const input = await screen.findByPlaceholderText(/Exemplo: 22222222-2222-4222-8222/i);
    fireEvent.change(input, { target: { value: validExamId } });
    fireEvent.click(screen.getByRole('button', { name: /Consultar Prova/i }));

    const deleteBtn = await screen.findByRole('button', { name: /Excluir Rascunho/i });
    fireEvent.click(deleteBtn);

    expect(await screen.findByRole('heading', { name: /Excluir Rascunho/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Confirmar Exclusão/i }));

    await waitFor(() => {
      expect(deleteCalled).toBe(true);
    });
    expect(await screen.findByText(/Rascunho de gabarito excluído com sucesso/i)).toBeInTheDocument();
  });

  it('10. deve responder adequadamente a acesso através da rota alias /official-answer-keys', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/official-answer-keys']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /Gabaritos Oficiais/i })).toBeInTheDocument();
  });

  it('11. deve exibir mensagem de acesso restrito com link para login quando usuário estiver desautenticado', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 401,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ message: 'Sessão inválida ou expirada.' }),
        } as Response;
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/answer-keys']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(
      await screen.findByText(/Autenticação necessária para gerenciar Gabaritos Oficiais/i)
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: /Ir para o Login/i })
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: /Criar conta/i })
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Exemplo: 22222222-2222-4222-8222/i)).not.toBeInTheDocument();
  });

  it('12. deve isolar requisições assíncronas ao trocar o UUID da prova, limpando imediatamente os dados anteriores e ignorando respostas defasadas', async () => {
    const examA = '11111111-1111-4111-8111-111111111111';
    const examB = '22222222-2222-4222-8222-222222222222';

    const keyExamA: OfficialAnswerKeyDTO = {
      ...sampleDraftKey,
      id: 'key-exam-a',
      examId: examA,
      notes: 'Gabarito da Prova A',
    };

    const keyExamB: OfficialAnswerKeyDTO = {
      ...sampleDraftKey,
      id: 'key-exam-b',
      examId: examB,
      notes: 'Gabarito da Prova B',
    };

    let resolveExamA: (value: unknown) => void;
    const delayedExamAPromise = new Promise((resolve) => {
      resolveExamA = resolve;
    });

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }
      if (url.includes(examA) && url.includes('/current')) {
        // Atrasar resposta da Prova A
        await delayedExamAPromise;
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ answerKey: keyExamA }),
        } as Response;
      }
      if (url.includes(examA) && url.includes('/versions')) {
        await delayedExamAPromise;
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ versions: [keyExamA] }),
        } as Response;
      }
      if (url.includes(examB) && url.includes('/current')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ answerKey: keyExamB }),
        } as Response;
      }
      if (url.includes(examB) && url.includes('/versions')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ versions: [keyExamB] }),
        } as Response;
      }
      if (url.includes('key-exam-b') || url.includes('key-exam-a')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ answerKey: url.includes('key-exam-b') ? keyExamB : keyExamA }),
        } as Response;
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/answer-keys']}>
        <AppRoutes />
      </MemoryRouter>
    );

    const input = await screen.findByPlaceholderText(/Exemplo: 22222222-2222-4222-8222/i);
    const searchBtn = screen.getByRole('button', { name: /Consultar Prova/i });

    // 1. Inicia consulta para Prova A (vai ficar pendente)
    fireEvent.change(input, { target: { value: examA } });
    fireEvent.click(searchBtn);

    // 2. Antes de a Prova A responder, usuário seleciona a Prova B
    fireEvent.change(input, { target: { value: examB } });
    fireEvent.click(searchBtn);

    // A Prova B responde rapidamente
    expect(await screen.findByText(/Gabarito da Prova B/i)).toBeInTheDocument();

    // 3. Agora a resposta atrasada da Prova A se resolve
    resolveExamA!({});

    // Aguarda qualquer ciclo de microtarefas
    await new Promise((r) => setTimeout(r, 50));

    // Garante que a Prova B continua visível e a Prova A NÃO sobrescreveu os dados
    expect(screen.getByText(/Gabarito da Prova B/i)).toBeInTheDocument();
    expect(screen.queryByText(/Gabarito da Prova A/i)).not.toBeInTheDocument();
  });

  it('13. deve exibir erro retornado pela API diretamente dentro do modal de substituição em lote mantendo o modal aberto', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }
      if (url.includes(`/current`)) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ answerKey: sampleDraftKey }),
        } as Response;
      }
      if (url.includes(`/versions`)) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ versions: [sampleDraftKey] }),
        } as Response;
      }
      if (url.includes(validKeyId) && init?.method === 'PUT') {
        return {
          status: 400,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ message: 'Número de questão excede o limite máximo permitido para a prova.' }),
        } as Response;
      }
      if (url.includes(validKeyId)) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ answerKey: sampleDraftKey }),
        } as Response;
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/answer-keys']}>
        <AppRoutes />
      </MemoryRouter>
    );

    const input = await screen.findByPlaceholderText(/Exemplo: 22222222-2222-4222-8222/i);
    fireEvent.change(input, { target: { value: validExamId } });
    fireEvent.click(screen.getByRole('button', { name: /Consultar Prova/i }));

    const batchBtn = await screen.findByRole('button', { name: /Substituição em Lote/i });
    fireEvent.click(batchBtn);

    const modalTitle = await screen.findByRole('heading', { name: /Substituição em Lote de Itens/i });
    expect(modalTitle).toBeInTheDocument();

    const textarea = screen.getByLabelText(/Cole o gabarito/i);
    fireEvent.change(textarea, { target: { value: '1: A\n2: B' } });

    const submitBtn = screen.getByRole('button', { name: /Substituir Todos os Itens/i });
    fireEvent.submit(submitBtn.closest('form')!);

    // O modal deve permanecer aberto e exibir a mensagem de erro da API dentro dele
    expect(modalTitle).toBeInTheDocument();
    const alertBox = await screen.findByRole('alert');
    expect(alertBox).toHaveTextContent(/Número de questão excede o limite máximo permitido para a prova/i);

    // Ao alterar o texto, o erro da API deve ser limpo
    fireEvent.change(textarea, { target: { value: '1: C' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('14. deve tratar expiração de sessão (HTTP 401) durante operação na página e atualizar para estado desautenticado', async () => {
    let callCount = 0;

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        callCount++;
        if (callCount === 1) {
          return {
            status: 200,
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => mockAuthenticatedUser,
          } as Response;
        }
        // Segunda chamada (refreshSession) confirma que a sessão expirou
        return {
          status: 401,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ message: 'Sessão expirada.' }),
        } as Response;
      }
      if (url.includes(`/current`)) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ answerKey: sampleDraftKey }),
        } as Response;
      }
      if (url.includes(`/versions`)) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ versions: [sampleDraftKey] }),
        } as Response;
      }
      if (url.includes(validKeyId) && init?.method === 'DELETE') {
        // Retorna 401 indicando sessão revogada/expirada no backend
        return {
          status: 401,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ message: 'Sessão expirada.' }),
        } as Response;
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/answer-keys']}>
        <AppRoutes />
      </MemoryRouter>
    );

    const input = await screen.findByPlaceholderText(/Exemplo: 22222222-2222-4222-8222/i);
    fireEvent.change(input, { target: { value: validExamId } });
    fireEvent.click(screen.getByRole('button', { name: /Consultar Prova/i }));

    const deleteBtn = await screen.findByRole('button', { name: /Excluir Rascunho/i });
    fireEvent.click(deleteBtn);

    fireEvent.click(screen.getByRole('button', { name: /Confirmar Exclusão/i }));

    // Deve transicionar para estado de autenticação necessária
    expect(
      await screen.findByText(/Autenticação necessária para gerenciar Gabaritos Oficiais/i)
    ).toBeInTheDocument();
  });
});
