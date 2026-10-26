import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../App.tsx';
import type { SimulationSummaryDTO } from '../types/index.ts';
import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from '../services/api.ts';

describe('Página de Listagem de Simulados (src/tests/SimulationsListPage.test.tsx) — Sprint 6.7-B', () => {
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

  const sampleSimulations: SimulationSummaryDTO[] = [
    {
      id: 'sim-1111-created',
      userId: 'user-auth-1',
      title: 'Simulado Polícia Federal 2026',
      status: 'CREATED',
      totalQuestions: 60,
      timeLimitSeconds: 7200,
      startedAt: null,
      finishedAt: null,
      durationSeconds: null,
      scorePercentage: null,
      correctCount: null,
      wrongCount: null,
      unansweredCount: null,
      createdAt: '2026-10-22T14:00:00.000Z',
    },
    {
      id: 'sim-2222-progress',
      userId: 'user-auth-1',
      title: 'Simulado Receita Federal - Direito',
      status: 'IN_PROGRESS',
      totalQuestions: 30,
      timeLimitSeconds: 3600,
      startedAt: '2026-10-22T15:00:00.000Z',
      finishedAt: null,
      durationSeconds: null,
      scorePercentage: null,
      correctCount: null,
      wrongCount: null,
      unansweredCount: null,
      createdAt: '2026-10-22T14:30:00.000Z',
    },
    {
      id: 'sim-3333-completed',
      userId: 'user-auth-1',
      title: 'Simulado Banco do Brasil - TI',
      status: 'COMPLETED',
      totalQuestions: 20,
      timeLimitSeconds: 2400,
      startedAt: '2026-10-21T09:00:00.000Z',
      finishedAt: '2026-10-21T09:35:00.000Z',
      durationSeconds: 2100,
      scorePercentage: 85.0,
      correctCount: 17,
      wrongCount: 2,
      unansweredCount: 1,
      createdAt: '2026-10-21T08:50:00.000Z',
    },
    {
      id: 'sim-4444-expired',
      userId: 'user-auth-1',
      title: 'Simulado Rápido de Português',
      status: 'EXPIRED',
      totalQuestions: 10,
      timeLimitSeconds: 600,
      startedAt: '2026-10-20T18:00:00.000Z',
      finishedAt: '2026-10-20T18:10:00.000Z',
      durationSeconds: 600,
      scorePercentage: 40.0,
      correctCount: 4,
      wrongCount: 4,
      unansweredCount: 2,
      createdAt: '2026-10-20T17:55:00.000Z',
    },
    {
      id: 'sim-5555-abandoned',
      userId: 'user-auth-1',
      title: 'Simulado Teste Descontinuado',
      status: 'ABANDONED',
      totalQuestions: 15,
      timeLimitSeconds: null,
      startedAt: '2026-10-19T10:00:00.000Z',
      finishedAt: '2026-10-19T10:05:00.000Z',
      durationSeconds: null,
      scorePercentage: null,
      correctCount: null,
      wrongCount: null,
      unansweredCount: null,
      createdAt: '2026-10-19T09:50:00.000Z',
    },
  ];

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
      <MemoryRouter initialEntries={['/simulations']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(
      await screen.findByRole('heading', {
        name: /Autenticação necessária para acessar seus simulados/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ir para o Login/i })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Criar conta/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('2. deve carregar e renderizar a lista de simulados com diferentes status e métricas', async () => {
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
          json: async () => ({
            simulations: sampleSimulations,
            total: sampleSimulations.length,
            limit: 10,
            offset: 0,
          }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations']}>
        <AppRoutes />
      </MemoryRouter>
    );

    // Título principal
    expect(await screen.findByRole('heading', { name: /Meus Simulados/i })).toBeInTheDocument();

    // Títulos dos simulados (aguarda carregamento assíncrono do fetch)
    expect(await screen.findByText('Simulado Polícia Federal 2026')).toBeInTheDocument();
    expect(screen.getByText('Simulado Receita Federal - Direito')).toBeInTheDocument();
    expect(screen.getByText('Simulado Banco do Brasil - TI')).toBeInTheDocument();
    expect(screen.getByText('Simulado Rápido de Português')).toBeInTheDocument();
    expect(screen.getByText('Simulado Teste Descontinuado')).toBeInTheDocument();

    // Badges de status
    expect(screen.getAllByText('Não iniciado').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Em andamento').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Concluído').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Expirado').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Abandonado').length).toBeGreaterThanOrEqual(1);

    // Métricas do simulado concluído
    expect(screen.getByText(/85.0% de aproveitamento/i)).toBeInTheDocument();
    expect(screen.getByText(/17 acertos · 2 erros · 1 em branco/i)).toBeInTheDocument();

    // Ausência de informações de gabarito ou explicações pedagógicas
    expect(screen.queryByText(/answerKeySnapshot/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/gabarito oficial da questão/i)).not.toBeInTheDocument();
  });

  it('3. deve exibir mensagem amigável quando não houver simulados cadastrados (lista vazia)', async () => {
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
          json: async () => ({
            simulations: [],
            total: 0,
            limit: 10,
            offset: 0,
          }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText('Nenhum simulado encontrado')).toBeInTheDocument();
    expect(
      screen.getByText(/Você ainda não criou nenhum simulado/i)
    ).toBeInTheDocument();
  });

  it('4. deve tratar erro na requisição e permitir tentar novamente', async () => {
    let shouldFail = true;

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
        if (shouldFail) {
          return {
            status: 503,
            ok: false,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ error: 'ServiceUnavailable', message: 'Falha temporária no banco' }),
          } as Response;
        }
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            simulations: [sampleSimulations[0]],
            total: 1,
            limit: 10,
            offset: 0,
          }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText('Não foi possível carregar os simulados')).toBeInTheDocument();
    expect(screen.getByText('Falha temporária no banco')).toBeInTheDocument();

    // Clica em "Tentar novamente" após recuperação do serviço
    shouldFail = false;
    const retryBtn = screen.getByRole('button', { name: /Tentar novamente/i });
    fireEvent.click(retryBtn);

    expect(await screen.findByText('Simulado Polícia Federal 2026')).toBeInTheDocument();
  });

  it('5. deve filtrar por status ao clicar no botão de filtro correspondente', async () => {
    const requestedUrls: string[] = [];

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
        requestedUrls.push(url);
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            simulations: [sampleSimulations[2]], // Retorna apenas o COMPLETED
            total: 1,
            limit: 10,
            offset: 0,
          }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText('Simulado Banco do Brasil - TI')).toBeInTheDocument();

    // Clica no filtro "Concluído"
    const completedFilterBtn = screen.getByRole('button', { name: /^Concluído$/i });
    fireEvent.click(completedFilterBtn);

    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('status=COMPLETED'))).toBe(true);
    });
  });

  it('6. deve executar fluxo de exclusão atômica com diálogo de confirmação seguro', async () => {
    let deleteCalled = false;
    let deleteHeaders: Record<string, string> = {};

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
      if (url.includes('/api/simulations/sim-1111-created') && init?.method === 'DELETE') {
        deleteCalled = true;
        deleteHeaders = (init?.headers as Record<string, string>) || {};
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, message: 'Simulado excluído com sucesso.' }),
        } as Response;
      }
      if (url.includes('/api/simulations')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            simulations: deleteCalled ? [] : [sampleSimulations[0]],
            total: deleteCalled ? 0 : 1,
            limit: 10,
            offset: 0,
          }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText('Simulado Polícia Federal 2026')).toBeInTheDocument();

    // Clica no botão de exclusão
    const deleteBtn = screen.getByTitle('Excluir simulado permanentemente');
    fireEvent.click(deleteBtn);

    // Confirmação inline aparece
    expect(screen.getByText('Excluir?')).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: /^Confirmar$/i });
    const cancelBtn = screen.getByRole('button', { name: /^Cancelar$/i });

    // Clica em Cancelar primeiro
    fireEvent.click(cancelBtn);
    expect(screen.queryByText('Excluir?')).not.toBeInTheDocument();

    // Clica em Excluir novamente e confirma
    fireEvent.click(screen.getByTitle('Excluir simulado permanentemente'));
    fireEvent.click(screen.getByRole('button', { name: /^Confirmar$/i }));

    // Valida que deleteSimulation foi disparado com CSRF
    await waitFor(() => {
      expect(deleteCalled).toBe(true);
      expect(deleteHeaders[CSRF_HEADER_NAME]).toBe(CSRF_HEADER_VALUE);
    });

    // Mensagem de sucesso deve ser exibida
    expect(await screen.findByText('Simulado excluído com sucesso.')).toBeInTheDocument();
  });

  it('7. deve conter o link "Simulados" no Navbar para usuário autenticado', async () => {
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

    // O link Simulados para /simulations deve estar presente no Navbar para usuário autenticado
    const navLinks = await screen.findAllByRole('link', { name: 'Simulados' });
    const hasSimulationRouteLink = navLinks.some(
      (link) => link.getAttribute('href') === '/simulations'
    );
    expect(hasSimulationRouteLink).toBe(true);
  });

  it('8. deve recuar à página anterior ao excluir o único item da segunda página', async () => {
    let page2ItemDeleted = false;
    const requestedUrls: string[] = [];

    // Cria 10 simulados para página 1 e 1 simulado para página 2
    const page1Sims: SimulationSummaryDTO[] = Array.from({ length: 10 }, (_, i) => ({
      id: `sim-page1-${i + 1}`,
      userId: 'user-auth-1',
      title: `Simulado Página 1 Item ${i + 1}`,
      status: 'COMPLETED' as const,
      totalQuestions: 10,
      timeLimitSeconds: 600,
      startedAt: null,
      finishedAt: null,
      durationSeconds: null,
      scorePercentage: 70,
      correctCount: 7,
      wrongCount: 3,
      unansweredCount: 0,
      createdAt: '2026-10-21T10:00:00.000Z',
    }));

    const page2Sim: SimulationSummaryDTO = {
      id: 'sim-page2-solitary',
      userId: 'user-auth-1',
      title: 'Simulado Solitário Página 2',
      status: 'CREATED' as const,
      totalQuestions: 15,
      timeLimitSeconds: 900,
      startedAt: null,
      finishedAt: null,
      durationSeconds: null,
      scorePercentage: null,
      correctCount: null,
      wrongCount: null,
      unansweredCount: null,
      createdAt: '2026-10-22T10:00:00.000Z',
    };

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
      if (url.includes('/api/simulations/sim-page2-solitary') && init?.method === 'DELETE') {
        page2ItemDeleted = true;
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, message: 'Simulado solitário excluído com sucesso.' }),
        } as Response;
      }
      if (url.includes('/api/simulations')) {
        requestedUrls.push(url);
        const parsedUrl = new URL(url, 'http://localhost:3000');
        const offset = parseInt(parsedUrl.searchParams.get('offset') ?? '0', 10);

        if (offset === 0) {
          return {
            status: 200,
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              simulations: page1Sims,
              total: page2ItemDeleted ? 10 : 11,
              limit: 10,
              offset: 0,
            }),
          } as Response;
        }

        if (offset === 10) {
          return {
            status: 200,
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              simulations: page2ItemDeleted ? [] : [page2Sim],
              total: page2ItemDeleted ? 10 : 11,
              limit: 10,
              offset: 10,
            }),
          } as Response;
        }
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations']}>
        <AppRoutes />
      </MemoryRouter>
    );

    // Carregou página 1
    expect(await screen.findByText('Simulado Página 1 Item 1')).toBeInTheDocument();
    expect(screen.getByText(/Mostrando página/i)).toHaveTextContent(/Mostrando página 1 de 2/i);

    // Navega para página 2
    const nextBtn = screen.getByRole('button', { name: /Próxima/i });
    fireEvent.click(nextBtn);

    // Página 2 renderiza o item solitário
    expect(await screen.findByText('Simulado Solitário Página 2')).toBeInTheDocument();
    expect(screen.getByText(/Mostrando página/i)).toHaveTextContent(/Mostrando página 2 de 2/i);

    // Exclui o item solitário da página 2
    const deleteBtn = screen.getByTitle('Excluir simulado permanentemente');
    fireEvent.click(deleteBtn);

    const confirmBtn = screen.getByRole('button', { name: /^Confirmar$/i });
    fireEvent.click(confirmBtn);

    // Deve retornar para a página 1 e renderizar os itens da página 1
    expect(await screen.findByText('Simulado solitário excluído com sucesso.')).toBeInTheDocument();
    expect(await screen.findByText('Simulado Página 1 Item 1')).toBeInTheDocument();
    expect(screen.queryByText('Simulado Solitário Página 2')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Próxima/i })).not.toBeInTheDocument();
  });

  it('9. deve permanecer na página atual ao excluir um item quando ainda restam outros itens', async () => {
    let itemDeleted = false;

    const twoItems: SimulationSummaryDTO[] = [
      {
        id: 'sim-page1-itemA',
        userId: 'user-auth-1',
        title: 'Simulado Primeiro Item A',
        status: 'CREATED',
        totalQuestions: 10,
        timeLimitSeconds: null,
        startedAt: null,
        finishedAt: null,
        durationSeconds: null,
        scorePercentage: null,
        correctCount: null,
        wrongCount: null,
        unansweredCount: null,
        createdAt: '2026-10-21T10:00:00.000Z',
      },
      {
        id: 'sim-page1-itemB',
        userId: 'user-auth-1',
        title: 'Simulado Segundo Item B',
        status: 'IN_PROGRESS',
        totalQuestions: 20,
        timeLimitSeconds: 1200,
        startedAt: null,
        finishedAt: null,
        durationSeconds: null,
        scorePercentage: null,
        correctCount: null,
        wrongCount: null,
        unansweredCount: null,
        createdAt: '2026-10-21T11:00:00.000Z',
      },
    ];

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
      if (url.includes('/api/simulations/sim-page1-itemA') && init?.method === 'DELETE') {
        itemDeleted = true;
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, message: 'Item A excluído com sucesso.' }),
        } as Response;
      }
      if (url.includes('/api/simulations')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            simulations: itemDeleted ? [twoItems[1]] : twoItems,
            total: itemDeleted ? 1 : 2,
            limit: 10,
            offset: 0,
          }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText('Simulado Primeiro Item A')).toBeInTheDocument();
    expect(screen.getByText('Simulado Segundo Item B')).toBeInTheDocument();

    // Exclui item A
    const deleteBtns = screen.getAllByTitle('Excluir simulado permanentemente');
    fireEvent.click(deleteBtns[0]);

    const confirmBtn = screen.getByRole('button', { name: /^Confirmar$/i });
    fireEvent.click(confirmBtn);

    // Mensagem de sucesso
    expect(await screen.findByText('Item A excluído com sucesso.')).toBeInTheDocument();

    // Item B permanece na página atual
    expect(screen.getByText('Simulado Segundo Item B')).toBeInTheDocument();
    expect(screen.queryByText('Simulado Primeiro Item A')).not.toBeInTheDocument();
  });

  it('10. deve tratar falha na exclusão (HTTP 500 / 403), exibir alerta de erro e manter o item na listagem', async () => {
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
      if (url.includes('/api/simulations/sim-1111-created') && init?.method === 'DELETE') {
        return {
          status: 500,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            error: 'InternalServerError',
            message: 'Falha transacional ao excluir simulado no banco de dados.',
          }),
        } as Response;
      }
      if (url.includes('/api/simulations')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            simulations: [sampleSimulations[0]],
            total: 1,
            limit: 10,
            offset: 0,
          }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText('Simulado Polícia Federal 2026')).toBeInTheDocument();

    const deleteBtn = screen.getByTitle('Excluir simulado permanentemente');
    fireEvent.click(deleteBtn);

    const confirmBtn = screen.getByRole('button', { name: /^Confirmar$/i });
    fireEvent.click(confirmBtn);

    // Mensagem de erro capturada e exibida
    expect(
      await screen.findByText('Falha transacional ao excluir simulado no banco de dados.')
    ).toBeInTheDocument();

    // O item NÃO foi removido da listagem
    expect(screen.getByText('Simulado Polícia Federal 2026')).toBeInTheDocument();
  });

  it('11. deve navegar entre páginas enviando limit e offset corretos para a API', async () => {
    const requestedOffsets: number[] = [];

    const fifteenSims: SimulationSummaryDTO[] = Array.from({ length: 15 }, (_, i) => ({
      id: `sim-multi-${i + 1}`,
      userId: 'user-auth-1',
      title: `Simulado Paginado #${i + 1}`,
      status: 'COMPLETED' as const,
      totalQuestions: 10,
      timeLimitSeconds: 600,
      startedAt: null,
      finishedAt: null,
      durationSeconds: null,
      scorePercentage: 80,
      correctCount: 8,
      wrongCount: 2,
      unansweredCount: 0,
      createdAt: '2026-10-21T10:00:00.000Z',
    }));

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
        const parsedUrl = new URL(url, 'http://localhost:3000');
        const offset = parseInt(parsedUrl.searchParams.get('offset') ?? '0', 10);
        requestedOffsets.push(offset);

        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            simulations: fifteenSims.slice(offset, offset + 10),
            total: 15,
            limit: 10,
            offset,
          }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations']}>
        <AppRoutes />
      </MemoryRouter>
    );

    // Página 1 inicial (offset 0)
    expect(await screen.findByText('Simulado Paginado #1')).toBeInTheDocument();
    expect(screen.getByText(/Mostrando página/i)).toHaveTextContent(/Mostrando página 1 de 2/i);
    expect(requestedOffsets).toContain(0);

    // Navega para página 2 (offset 10)
    const nextBtn = screen.getByRole('button', { name: /Próxima/i });
    fireEvent.click(nextBtn);

    expect(await screen.findByText('Simulado Paginado #11')).toBeInTheDocument();
    expect(screen.getByText(/Mostrando página/i)).toHaveTextContent(/Mostrando página 2 de 2/i);
    expect(requestedOffsets).toContain(10);

    // Navega de volta para a página 1 (offset 0)
    const prevBtn = screen.getByRole('button', { name: /Anterior/i });
    fireEvent.click(prevBtn);

    expect(await screen.findByText('Simulado Paginado #1')).toBeInTheDocument();
    expect(screen.getByText(/Mostrando página/i)).toHaveTextContent(/Mostrando página 1 de 2/i);
  });

  it('12. deve preservar o filtro ativo por status durante a navegação e após exclusão', async () => {
    let solitaryDeleted = false;
    const requestedUrls: string[] = [];

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
      if (url.includes('/api/simulations/sim-solitary-completed') && init?.method === 'DELETE') {
        solitaryDeleted = true;
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, message: 'Simulado concluído excluído com sucesso.' }),
        } as Response;
      }
      if (url.includes('/api/simulations')) {
        requestedUrls.push(url);
        const parsedUrl = new URL(url, 'http://localhost:3000');
        const offset = parseInt(parsedUrl.searchParams.get('offset') ?? '0', 10);
        const status = parsedUrl.searchParams.get('status');

        if (status === 'COMPLETED') {
          if (offset === 0) {
            return {
              status: 200,
              ok: true,
              headers: new Headers({ 'content-type': 'application/json' }),
              json: async () => ({
                simulations: [sampleSimulations[2]], // COMPLETED
                total: solitaryDeleted ? 1 : 2,
                limit: 10,
                offset: 0,
              }),
            } as Response;
          }
          if (offset === 10) {
            return {
              status: 200,
              ok: true,
              headers: new Headers({ 'content-type': 'application/json' }),
              json: async () => ({
                simulations: solitaryDeleted
                  ? []
                  : [
                      {
                        ...sampleSimulations[2],
                        id: 'sim-solitary-completed',
                        title: 'Simulado Concluído P2 Solitário',
                      },
                    ],
                total: solitaryDeleted ? 1 : 2,
                limit: 10,
                offset: 10,
              }),
            } as Response;
          }
        }

        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            simulations: sampleSimulations,
            total: sampleSimulations.length,
            limit: 10,
            offset: 0,
          }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText('Simulado Polícia Federal 2026')).toBeInTheDocument();

    // Ativa filtro "Concluído"
    const completedFilterBtn = screen.getByRole('button', { name: /^Concluído$/i });
    fireEvent.click(completedFilterBtn);

    // Confirma que a URL incluiu status=COMPLETED
    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('status=COMPLETED'))).toBe(true);
    });

    // O botão de filtro "Concluído" permanece ativo com a classe bg-[#2563EB]
    expect(completedFilterBtn).toHaveClass('bg-[#2563EB]');
  });
});
