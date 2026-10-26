import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../App.tsx';
import type { SimulationDetailDTO } from '../types/index.ts';

describe('Página de Criação de Simulados (src/tests/SimulationCreatePage.test.tsx) — Sprint 6.7-C', () => {
  const originalFetch = globalThis.fetch;

  const mockAuthenticatedUser = {
    user: {
      id: 'user-auth-1',
      name: 'Carlos Oliveira',
      email: 'carlos@questforge.dev',
      avatarUrl: null,
      createdAt: '2026-10-20T10:00:00.000Z',
      updatedAt: '2026-10-20T10:00:00.000Z',
    },
    session: {
      id: 'session-auth-1',
      userId: 'user-auth-1',
      expiresAt: '2026-10-25T10:00:00.000Z',
      createdAt: '2026-10-20T10:00:00.000Z',
      lastUsedAt: '2026-10-20T10:00:00.000Z',
    },
  };

  const sampleCreatedSimulation: SimulationDetailDTO = {
    id: 'sim-new-12345',
    userId: 'user-auth-1',
    title: 'Simulado Direito Administrativo 2026',
    status: 'CREATED',
    totalQuestions: 20,
    timeLimitSeconds: 3600,
    startedAt: null,
    finishedAt: null,
    durationSeconds: null,
    scorePercentage: null,
    correctCount: null,
    wrongCount: null,
    unansweredCount: null,
    createdAt: '2026-10-24T12:00:00.000Z',
    timeRemainingSeconds: 3600,
    isExpired: false,
    questions: [],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('1. deve exibir aviso de autenticação necessária quando o usuário não estiver logado', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 401,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: 'Unauthorized', message: 'Sessão inválida' }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/new']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(
      await screen.findByRole('heading', {
        name: /Autenticação necessária para criar simulados/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ir para o Login/i })).toBeInTheDocument();
  });

  it('2. deve renderizar os campos do formulário para usuário autenticado', async () => {
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
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/new']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(
      await screen.findByRole('heading', { name: /Configurar Novo Simulado/i })
    ).toBeInTheDocument();

    // Campos básicos
    expect(screen.getByLabelText(/Título do Simulado/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Quantidade de Questões/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Definir tempo limite oficial/i)).toBeInTheDocument();

    // Critérios opcionais
    expect(screen.getByLabelText(/^Disciplina$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Tópico$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Subtópico$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Banca Examinadora$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Concurso \/ Prova$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Ano do Concurso$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nível de Dificuldade$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Formato da Questão$/i)).toBeInTheDocument();

    // Botões
    expect(screen.getByRole('button', { name: /Criar Simulado/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Cancelar/i })).toBeInTheDocument();
  });

  it('3. deve validar limites no frontend (questões entre 1 e 200, ano válido)', async () => {
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
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/new']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /Configurar Novo Simulado/i })).toBeInTheDocument();

    const questionsInput = screen.getByLabelText(/Quantidade de Questões/i);
    const yearInput = screen.getByLabelText(/^Ano do Concurso$/i);
    const submitBtn = screen.getByRole('button', { name: /Criar Simulado/i });

    // Quantidade inválida (> 200)
    fireEvent.change(questionsInput, { target: { value: '250' } });
    // Ano inválido (< 1990)
    fireEvent.change(yearInput, { target: { value: '1980' } });

    fireEvent.click(submitBtn);

    expect(
      screen.getByText('A quantidade de questões não pode exceder 200.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('O ano deve ser um valor numérico entre 1990 e 2100.')
    ).toBeInTheDocument();
  });

  it('4. deve enviar o payload correto para createSimulation e exibir confirmação', async () => {
    let capturedBody: Record<string, unknown> = {};

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
      if (url.includes('/api/simulations') && init?.method === 'POST') {
        capturedBody = JSON.parse(init.body as string);
        return {
          status: 201,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: sampleCreatedSimulation }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/new']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /Configurar Novo Simulado/i })).toBeInTheDocument();

    // Preenche campos
    fireEvent.change(screen.getByLabelText(/Título do Simulado/i), {
      target: { value: 'Simulado Direito Administrativo 2026' },
    });
    fireEvent.change(screen.getByLabelText(/Quantidade de Questões/i), {
      target: { value: '20' },
    });
    fireEvent.change(screen.getByLabelText(/^Disciplina$/i), {
      target: { value: 'Direito Administrativo' },
    });
    fireEvent.change(screen.getByLabelText(/^Banca Examinadora$/i), {
      target: { value: 'Cebraspe' },
    });
    fireEvent.change(screen.getByLabelText(/^Nível de Dificuldade$/i), {
      target: { value: 'MEDIUM' },
    });

    // Submete
    fireEvent.click(screen.getByRole('button', { name: /Criar Simulado/i }));

    // Valida o payload enviado
    await waitFor(() => {
      expect(capturedBody.title).toBe('Simulado Direito Administrativo 2026');
      expect(capturedBody.totalQuestions).toBe(20);
      expect(capturedBody.timeLimitSeconds).toBe(3600); // 60 min * 60 s
      expect(capturedBody.criteria).toEqual({
        subject: 'Direito Administrativo',
        board: 'Cebraspe',
        difficulty: 'MEDIUM',
      });
    });

    // Confirmação exibida
    expect(await screen.findByText('Simulado criado com sucesso!')).toBeInTheDocument();
    expect(screen.getByText('sim-new-12345')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ver na Lista de Simulados/i })).toBeInTheDocument();
  });

  it('5. deve suportar simulado sem limite de tempo (timeLimitSeconds: null)', async () => {
    let capturedBody: Record<string, unknown> = {};

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
      if (url.includes('/api/simulations') && init?.method === 'POST') {
        capturedBody = JSON.parse(init.body as string);
        return {
          status: 201,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            simulation: {
              ...sampleCreatedSimulation,
              timeLimitSeconds: null,
            },
          }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/new']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /Configurar Novo Simulado/i })).toBeInTheDocument();

    // Desmarca a opção de tempo limite
    const toggleTimeLimit = screen.getByLabelText(/Definir tempo limite oficial/i);
    fireEvent.click(toggleTimeLimit);

    fireEvent.click(screen.getByRole('button', { name: /Criar Simulado/i }));

    await waitFor(() => {
      expect(capturedBody.timeLimitSeconds).toBeNull();
    });

    expect(await screen.findByText('Simulado criado com sucesso!')).toBeInTheDocument();
    expect(screen.getByText(/Sem limite/i)).toBeInTheDocument();
  });

  it('6. deve tratar especificamente erro SIMULATION_INSUFFICIENT_QUESTIONS (HTTP 422)', async () => {
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
      if (url.includes('/api/simulations') && init?.method === 'POST') {
        return {
          status: 422,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            error: 'SIMULATION_INSUFFICIENT_QUESTIONS',
            message:
              'Quantidade insuficiente de questões elegíveis com gabarito válido. Solicitadas: 50, Disponíveis: 12.',
          }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/new']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /Configurar Novo Simulado/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Criar Simulado/i }));

    expect(
      await screen.findByText('Questões insuficientes no banco de dados')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Quantidade insuficiente de questões elegíveis com gabarito válido/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Sugestão: Reduza a quantidade de questões solicitada/i)
    ).toBeInTheDocument();
  });

  it('7. deve tratar outros erros da API e exibir alerta explicativo', async () => {
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
      if (url.includes('/api/simulations') && init?.method === 'POST') {
        return {
          status: 503,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            error: 'ServiceUnavailable',
            message: 'O serviço de banco de dados está temporariamente indisponível.',
          }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/new']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /Configurar Novo Simulado/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Criar Simulado/i }));

    expect(await screen.findByText('Não foi possível gerar o simulado')).toBeInTheDocument();
    expect(
      screen.getByText('O serviço de banco de dados está temporariamente indisponível.')
    ).toBeInTheDocument();
  });

  it('8. deve desabilitar o botão durante a submissão para evitar envios duplicados', async () => {
    let resolvePost: (value: Response) => void;
    const postPromise = new Promise<Response>((resolve) => {
      resolvePost = resolve;
    });

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
      if (url.includes('/api/simulations') && init?.method === 'POST') {
        return postPromise;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/new']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /Configurar Novo Simulado/i })).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /Criar Simulado/i });
    fireEvent.click(submitBtn);

    // Durante o envio, botão fica desabilitado com texto de loading
    expect(screen.getByRole('button', { name: /Gerando simulado\.\.\./i })).toBeDisabled();

    // Conclui a resposta
    resolvePost!({
      status: 201,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ simulation: sampleCreatedSimulation }),
    } as Response);

    expect(await screen.findByText('Simulado criado com sucesso!')).toBeInTheDocument();
  });

  it('9. deve permitir navegar de volta para a listagem a partir dos botões de retorno', async () => {
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
      if (url.includes('/api/simulations')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulations: [], total: 0, limit: 10, offset: 0 }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/new']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /Configurar Novo Simulado/i })).toBeInTheDocument();

    // Link do breadcrumb "Meus Simulados"
    const breadcrumbLink = screen.getByRole('link', { name: /Meus Simulados/i });
    expect(breadcrumbLink).toHaveAttribute('href', '/simulations');

    // Botão "Cancelar"
    const cancelLink = screen.getByRole('link', { name: /Cancelar/i });
    expect(cancelLink).toHaveAttribute('href', '/simulations');
  });

  it('10. deve exibir o botão "Novo Simulado" na página de listagem e navegar para /simulations/new', async () => {
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
      if (url.includes('/api/simulations')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulations: [], total: 0, limit: 10, offset: 0 }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /Meus Simulados/i })).toBeInTheDocument();

    const newSimLink = screen.getByRole('link', { name: /Novo Simulado/i });
    expect(newSimLink).toBeInTheDocument();
    expect(newSimLink).toHaveAttribute('href', '/simulations/new');
  });
});
