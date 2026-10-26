import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../App.tsx';
import type {
  SimulationDetailDTO,
  SimulationPublicQuestionDTO,
  SimulationResultDTO,
} from '../types/index.ts';

describe('Página de Execução de Simulados (src/tests/SimulationPlayPage.test.tsx) — Sprint 6.7-D', () => {
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

  const sampleQuestions: SimulationPublicQuestionDTO[] = [
    {
      id: 'sq-1',
      simulationId: 'sim-exec-1',
      questionId: 'q-real-1',
      position: 1,
      statement: 'Qual é o princípio fundamental da administração pública previsto no art. 37 da CF/88?',
      type: 'MULTIPLE_CHOICE',
      subject: 'Direito Administrativo',
      topic: 'Princípios',
      subtopic: 'Legalidade',
      board: 'CESPE',
      examTitle: 'Analista Judiciário',
      year: 2024,
      difficulty: 'MEDIUM',
      alternatives: [
        { id: 'alt-1', letter: 'A', text: 'Legalidade estrita e impessoalidade', position: 1 },
        { id: 'alt-2', letter: 'B', text: 'Supremacia irrestrita do interesse privado', position: 2 },
        { id: 'alt-3', letter: 'C', text: 'Opacidade dos atos decisórios', position: 3 },
      ],
      currentAttempt: null,
    },
    {
      id: 'sq-2',
      simulationId: 'sim-exec-1',
      questionId: 'q-real-2',
      position: 2,
      statement: 'O ato administrativo discricionário dispensa qualquer motivação posterior.',
      type: 'TRUE_FALSE',
      subject: 'Direito Administrativo',
      topic: 'Atos Administrativos',
      subtopic: null,
      board: 'CESPE',
      examTitle: 'Técnico Judiciário',
      year: 2023,
      difficulty: 'HARD',
      alternatives: [
        { id: 'alt-4', letter: 'C', text: 'Certo', position: 1 },
        { id: 'alt-5', letter: 'E', text: 'Errado', position: 2 },
      ],
      currentAttempt: {
        selectedAlternativeId: 'alt-5',
        selectedLetter: 'E',
        answeredAt: '2026-10-24T14:10:00.000Z',
        timeSpentSeconds: 45,
      },
    },
  ];

  const sampleCreatedSimulation: SimulationDetailDTO = {
    id: 'sim-exec-1',
    userId: 'user-auth-1',
    title: 'Simulado de Treinamento Rápido',
    status: 'CREATED',
    totalQuestions: 2,
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
    questions: sampleQuestions,
  };

  const sampleInProgressSimulation: SimulationDetailDTO = {
    ...sampleCreatedSimulation,
    status: 'IN_PROGRESS',
    startedAt: '2026-10-24T14:00:00.000Z',
    timeRemainingSeconds: 3500,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('1. deve exigir autenticação quando o usuário estiver deslogado', async () => {
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
      <MemoryRouter initialEntries={['/simulations/sim-exec-1']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(
      await screen.findByRole('heading', {
        name: /Autenticação necessária para resolver simulados/i,
      })
    ).toBeInTheDocument();
  });

  it('2. deve exibir mensagem de erro e botão de tentar novamente se falhar o carregamento do simulado', async () => {
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
      if (url.includes('/api/simulations/sim-exec-1')) {
        return {
          status: 404,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            code: 'SIMULATION_NOT_FOUND',
            message: 'Simulado não encontrado.',
          }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-exec-1']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Não foi possível carregar o simulado/i)).toBeInTheDocument();
    expect(screen.getByText(/Simulado não encontrado/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tentar Novamente/i })).toBeInTheDocument();
  });

  it('3. deve exibir tela de início quando o simulado estiver com status CREATED', async () => {
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
      if (url.includes('/api/simulations/sim-exec-1')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: sampleCreatedSimulation }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-exec-1']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText('Caderno de Questões Preparado')).toBeInTheDocument();
    expect(screen.getByText('Simulado de Treinamento Rápido')).toBeInTheDocument();
    expect(screen.getByText('2 questões')).toBeInTheDocument();
    expect(screen.getByText('60 minutos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Iniciar Prova Agora/i })).toBeInTheDocument();
  });

  it('4. deve chamar POST /api/simulations/:id/start ao clicar em Iniciar Prova Agora', async () => {
    let startCalled = false;

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
      if (url.endsWith('/api/simulations/sim-exec-1/start') && init?.method === 'POST') {
        startCalled = true;
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: sampleInProgressSimulation }),
        } as Response;
      }
      if (url.includes('/api/simulations/sim-exec-1')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: sampleCreatedSimulation }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-exec-1']}>
        <AppRoutes />
      </MemoryRouter>
    );

    const startBtn = await screen.findByRole('button', { name: /Iniciar Prova Agora/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(startCalled).toBe(true);
    });

    // Deve transicionar para a prova em andamento
    expect(await screen.findByText(/Qual é o princípio fundamental da administração pública/i)).toBeInTheDocument();
  });

  it('5. deve renderizar enunciado, alternativas e mapa de questões quando em andamento', async () => {
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
      if (url.includes('/api/simulations/sim-exec-1')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: sampleInProgressSimulation }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-exec-1']}>
        <AppRoutes />
      </MemoryRouter>
    );

    // Questão 1
    expect(await screen.findByText(/Qual é o princípio fundamental da administração pública/i)).toBeInTheDocument();
    expect(screen.getByText('Legalidade estrita e impessoalidade')).toBeInTheDocument();
    expect(screen.getByText('Supremacia irrestrita do interesse privado')).toBeInTheDocument();
    expect(screen.getByText('Opacidade dos atos decisórios')).toBeInTheDocument();

    // Contador e Mapa de Questões
    expect(screen.getByText('Questão 1 de 2')).toBeInTheDocument();
    expect(screen.getByText('Mapa de Questões')).toBeInTheDocument();
  });

  it('6. deve submeter resposta via POST /api/simulations/:id/answers ao selecionar alternativa', async () => {
    let answerSubmitted: unknown = null;

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
      if (url.endsWith('/api/simulations/sim-exec-1/answers') && init?.method === 'POST') {
        answerSubmitted = JSON.parse(String(init.body));
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            attempt: {
              id: 'att-100',
              simulationId: 'sim-exec-1',
              questionId: 'q-real-1',
              userId: 'user-auth-1',
              selectedAlternativeId: 'alt-1',
              selectedLetter: 'A',
              timeSpentSeconds: null,
              answeredAt: '2026-10-24T14:15:00.000Z',
            },
          }),
        } as Response;
      }
      if (url.includes('/api/simulations/sim-exec-1')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: sampleInProgressSimulation }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-exec-1']}>
        <AppRoutes />
      </MemoryRouter>
    );

    const altA = await screen.findByRole('radio', {
      name: /Legalidade estrita e impessoalidade/i,
    });
    fireEvent.click(altA);

    await waitFor(() => {
      expect(answerSubmitted).toEqual({
        questionId: 'q-real-1',
        selectedAlternativeId: 'alt-1',
      });
    });

    expect(await screen.findByText('Salvo no servidor')).toBeInTheDocument();
  });

  it('7. deve navegar entre questões usando Próxima, Anterior e o Mapa de Questões', async () => {
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
      if (url.includes('/api/simulations/sim-exec-1')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: sampleInProgressSimulation }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-exec-1']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Qual é o princípio fundamental da administração pública/i)).toBeInTheDocument();

    // Clica em Próxima
    const nextBtn = screen.getByRole('button', { name: /Próxima/i });
    fireEvent.click(nextBtn);

    // Deve exibir questão 2
    expect(await screen.findByText(/O ato administrativo discricionário dispensa qualquer motivação posterior/i)).toBeInTheDocument();
    expect(screen.getByText('Questão 2 de 2')).toBeInTheDocument();

    // Na última questão, o botão passa a ser "Revisar e Finalizar"
    expect(screen.getByRole('button', { name: /Revisar e Finalizar/i })).toBeInTheDocument();

    // Clica em Anterior
    const prevBtn = screen.getByRole('button', { name: /Anterior/i });
    fireEvent.click(prevBtn);

    // Volta para questão 1
    expect(await screen.findByText(/Qual é o princípio fundamental da administração pública/i)).toBeInTheDocument();

    // Navega pelo Mapa de Questões clicando na Questão 2
    const q2PaletteBtn = screen.getByRole('button', { name: /Questão 2/i });
    fireEvent.click(q2PaletteBtn);

    expect(await screen.findByText(/O ato administrativo discricionário dispensa qualquer motivação posterior/i)).toBeInTheDocument();
  });

  it('8. deve permitir desmarcar resposta enviando selectedAlternativeId como null', async () => {
    let answerSubmitted: unknown = null;

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
      if (url.endsWith('/api/simulations/sim-exec-1/answers') && init?.method === 'POST') {
        answerSubmitted = JSON.parse(String(init.body));
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            attempt: {
              id: 'att-null',
              simulationId: 'sim-exec-1',
              questionId: 'q-real-2',
              userId: 'user-auth-1',
              selectedAlternativeId: null,
              selectedLetter: null,
              timeSpentSeconds: null,
              answeredAt: '2026-10-24T14:20:00.000Z',
            },
          }),
        } as Response;
      }
      if (url.includes('/api/simulations/sim-exec-1')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: sampleInProgressSimulation }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-exec-1']}>
        <AppRoutes />
      </MemoryRouter>
    );

    // Vai para a questão 2 que já possui resposta marcada ('alt-5' / Errado)
    const q2Btn = await screen.findByRole('button', { name: /Questão 2/i });
    fireEvent.click(q2Btn);

    const clearBtn = await screen.findByRole('button', { name: /Limpar Resposta/i });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(answerSubmitted).toEqual({
        questionId: 'q-real-2',
        selectedAlternativeId: null,
      });
    });
  });

  it('9. deve abrir modal de confirmação ao clicar em Finalizar e chamar POST /api/simulations/:id/finish', async () => {
    let finishCalled = false;
    const sampleResult: SimulationResultDTO = {
      ...sampleInProgressSimulation,
      status: 'COMPLETED',
      finishedAt: '2026-10-24T14:30:00.000Z',
      durationSeconds: 1800,
      scorePercentage: 100,
      correctCount: 2,
      wrongCount: 0,
      unansweredCount: 0,
      questions: [],
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
      if (url.endsWith('/api/simulations/sim-exec-1/finish') && init?.method === 'POST') {
        finishCalled = true;
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ result: sampleResult }),
        } as Response;
      }
      if (url.includes('/api/simulations/sim-exec-1')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: sampleInProgressSimulation }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-exec-1']}>
        <AppRoutes />
      </MemoryRouter>
    );

    const finishTopBtn = await screen.findByRole('button', { name: /Finalizar/i });
    fireEvent.click(finishTopBtn);

    // Modal aberto
    expect(screen.getByRole('dialog', { name: /Finalizar Simulado\?/i })).toBeInTheDocument();
    expect(screen.getByText(/Total de questões:/i)).toBeInTheDocument();

    // Clica em confirmar
    const confirmBtn = screen.getByRole('button', { name: /Confirmar e Finalizar/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(finishCalled).toBe(true);
    });

    // Tela de conclusão
    expect(await screen.findByText('Simulado Concluído')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voltar para Meus Simulados/i })).toBeInTheDocument();
  });

  it('10. deve abrir modal de confirmação ao clicar em Abandonar e chamar POST /api/simulations/:id/abandon', async () => {
    let abandonCalled = false;

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
      if (url.endsWith('/api/simulations/sim-exec-1/abandon') && init?.method === 'POST') {
        abandonCalled = true;
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            simulation: {
              ...sampleInProgressSimulation,
              status: 'ABANDONED',
            },
          }),
        } as Response;
      }
      if (url.includes('/api/simulations/sim-exec-1')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: sampleInProgressSimulation }),
        } as Response;
      }
      if (url.includes('/api/simulations')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulations: [], total: 0, limit: 20, offset: 0 }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-exec-1']}>
        <AppRoutes />
      </MemoryRouter>
    );

    const abandonTopBtn = await screen.findByRole('button', { name: /Abandonar/i });
    fireEvent.click(abandonTopBtn);

    // Modal de abandono
    expect(screen.getByRole('dialog', { name: /Abandonar Simulado\?/i })).toBeInTheDocument();
    expect(screen.getByText(/Esta ação é definitiva/i)).toBeInTheDocument();

    const confirmAbandonBtn = screen.getByRole('button', { name: /Sim, Abandonar Simulado/i });
    fireEvent.click(confirmAbandonBtn);

    await waitFor(() => {
      expect(abandonCalled).toBe(true);
    });
  });

  it('11. deve exibir tela de status finalizado quando o simulado for carregado com status EXPIRED', async () => {
    const expiredSimulation: SimulationDetailDTO = {
      ...sampleInProgressSimulation,
      status: 'EXPIRED',
      isExpired: true,
      timeRemainingSeconds: 0,
    };

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
      if (url.includes('/api/simulations/sim-exec-1')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: expiredSimulation }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-exec-1']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText('Tempo Esgotado')).toBeInTheDocument();
    expect(screen.getByText(/O limite de tempo deste simulado encerrou/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voltar para Meus Simulados/i })).toBeInTheDocument();
  });

  it('12. deve reverter a seleção e apresentar erro visual caso falhe o salvamento da resposta', async () => {
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
      if (url.endsWith('/api/simulations/sim-exec-1/answers') && init?.method === 'POST') {
        return {
          status: 500,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            code: 'INTERNAL_ERROR',
            message: 'Falha temporária ao persistir resposta no PostgreSQL.',
          }),
        } as Response;
      }
      if (url.includes('/api/simulations/sim-exec-1')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: sampleInProgressSimulation }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-exec-1']}>
        <AppRoutes />
      </MemoryRouter>
    );

    const altA = await screen.findByRole('radio', {
      name: /Legalidade estrita e impessoalidade/i,
    });
    fireEvent.click(altA);

    expect(await screen.findByText(/Falha temporária ao persistir resposta/i)).toBeInTheDocument();
    // A alternativa não deve permanecer com aria-checked=true
    expect(altA).toHaveAttribute('aria-checked', 'false');
  });

  it('13. deve exibir mensagem de erro se a inicialização do simulado falhar', async () => {
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
      if (url.endsWith('/api/simulations/sim-exec-1/start') && init?.method === 'POST') {
        return {
          status: 409,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            code: 'SIMULATION_ALREADY_STARTED',
            message: 'Este simulado já se encontra em andamento.',
          }),
        } as Response;
      }
      if (url.includes('/api/simulations/sim-exec-1')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: sampleCreatedSimulation }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-exec-1']}>
        <AppRoutes />
      </MemoryRouter>
    );

    const startBtn = await screen.findByRole('button', { name: /Iniciar Prova Agora/i });
    fireEvent.click(startBtn);

    expect(await screen.findByText(/Este simulado já se encontra em andamento/i)).toBeInTheDocument();
  });

  it('14. deve fechar o modal de finalização ao pressionar Escape ou clicar em Voltar à Prova', async () => {
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
      if (url.includes('/api/simulations/sim-exec-1')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: sampleInProgressSimulation }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-exec-1']}>
        <AppRoutes />
      </MemoryRouter>
    );

    const finishTopBtn = await screen.findByRole('button', { name: /Finalizar/i });
    fireEvent.click(finishTopBtn);

    expect(screen.getByRole('dialog', { name: /Finalizar Simulado\?/i })).toBeInTheDocument();

    const cancelBtn = screen.getByRole('button', { name: /Voltar à Prova/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Finalizar Simulado\?/i })).not.toBeInTheDocument();
    });
  });
});
