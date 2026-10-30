import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../App.tsx';
import type { DashboardSummaryDTO, StudyActivityDTO } from '../types/index.ts';
import { formatDurationHoursMinutes } from '../components/dashboard/DashboardMetricCards.tsx';
import { formatStreakDateUtc } from '../components/dashboard/DashboardStreakBanner.tsx';
import { formatEvolutionDate } from '../components/dashboard/PerformanceTrendChart.tsx';
import { formatActivityDate } from '../components/dashboard/RecentActivitiesList.tsx';

describe('Sprint 8.4 — Dashboard do Estudante (src/tests/DashboardPage.test.tsx)', () => {
  const originalFetch = globalThis.fetch;

  const mockAuthenticatedUser = {
    user: {
      id: 'user-dash-1',
      name: 'Mariana Silva',
      email: 'mariana@questforge.dev',
      avatarUrl: null,
      createdAt: '2026-10-20T10:00:00.000Z',
      updatedAt: '2026-10-20T10:00:00.000Z',
    },
    session: {
      id: 'session-dash-1',
      userId: 'user-dash-1',
      expiresAt: '2026-10-25T10:00:00.000Z',
      createdAt: '2026-10-20T10:00:00.000Z',
      lastUsedAt: '2026-10-20T10:00:00.000Z',
    },
  };

  const sampleRecentActivities: StudyActivityDTO[] = [
    {
      id: 'act-sim-1',
      userId: 'user-dash-1',
      type: 'SIMULATION',
      simulationId: 'sim-abc-123',
      questionId: null,
      examId: null,
      durationSeconds: 3600,
      scorePercentage: 85.0,
      correctCount: 51,
      wrongCount: 9,
      unansweredCount: 0,
      completedAt: '2026-03-30T15:30:00.000Z',
      createdAt: '2026-03-30T15:30:00.000Z',
    },
    {
      id: 'act-q-2',
      userId: 'user-dash-1',
      type: 'QUESTION',
      simulationId: null,
      questionId: 'quest-xyz-789',
      examId: null,
      durationSeconds: 120,
      scorePercentage: 100.0,
      correctCount: 1,
      wrongCount: 0,
      unansweredCount: 0,
      completedAt: '2026-03-29T10:15:00.000Z',
      createdAt: '2026-03-29T10:15:00.000Z',
    },
    {
      id: 'act-exam-3',
      userId: 'user-dash-1',
      type: 'EXAM',
      simulationId: null,
      questionId: null,
      examId: 'exam-policia-fed',
      durationSeconds: 7200,
      scorePercentage: 72.5,
      correctCount: 87,
      wrongCount: 33,
      unansweredCount: 0,
      completedAt: '2026-03-28T18:00:00.000Z',
      createdAt: '2026-03-28T18:00:00.000Z',
    },
  ];

  const sampleDashboardSummary: DashboardSummaryDTO = {
    completedSimulationsCount: 14,
    totalAnsweredQuestions: 1250,
    totalCorrectAnswers: 956,
    totalWrongAnswers: 294,
    accuracyPercentage: 76.48, // Deve formatar como 76,5%
    totalDurationSeconds: 9900, // 2h 45m
    currentStreak: 5,
    longestStreak: 12,
    lastActivityDate: '2026-03-30',
    recentSimulationsEvolution: [
      {
        id: 'sim-evol-1',
        title: 'Simulado PF 1',
        scorePercentage: 70.0,
        correctCount: 42,
        wrongCount: 18,
        totalQuestions: 60,
        durationSeconds: 3400,
        finishedAt: '2026-03-25T14:00:00.000Z',
      },
      {
        id: 'sim-evol-2',
        title: 'Simulado PF 2',
        scorePercentage: 80.0,
        correctCount: 48,
        wrongCount: 12,
        totalQuestions: 60,
        durationSeconds: 3600,
        finishedAt: '2026-03-28T14:00:00.000Z',
      },
      {
        id: 'sim-evol-3',
        title: 'Simulado PF 3',
        scorePercentage: 85.0,
        correctCount: 51,
        wrongCount: 9,
        totalQuestions: 60,
        durationSeconds: 3500,
        finishedAt: '2026-03-30T14:00:00.000Z',
      },
    ],
    recentActivities: sampleRecentActivities,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Funções utilitárias de formatação', () => {
    it('formatDurationHoursMinutes formata segundos em horas e minutos', () => {
      expect(formatDurationHoursMinutes(0)).toBe('0h 00m');
      expect(formatDurationHoursMinutes(-10)).toBe('0h 00m');
      expect(formatDurationHoursMinutes(60)).toBe('0h 01m');
      expect(formatDurationHoursMinutes(3600)).toBe('1h 00m');
      expect(formatDurationHoursMinutes(9900)).toBe('2h 45m');
      expect(formatDurationHoursMinutes(3665)).toBe('1h 01m');
    });

    it('formatStreakDateUtc formata data UTC evitando deslocamento de fuso', () => {
      expect(formatStreakDateUtc(null)).toBe('Nenhuma atividade registrada ainda');
      expect(formatStreakDateUtc('2026-03-30')).toBe('30/03/2026');
      expect(formatStreakDateUtc('2026-12-31T23:59:59.000Z')).toBe('31/12/2026');
    });

    it('formatEvolutionDate formata datas abreviadas para o gráfico', () => {
      expect(formatEvolutionDate(null)).toBe('Data não registrada');
      expect(formatEvolutionDate('2026-03-25T14:00:00.000Z')).toBe('25/03');
    });

    it('formatActivityDate formata data e hora da atividade em pt-BR', () => {
      const formatted = formatActivityDate('2026-03-30T15:30:00.000Z');
      expect(formatted).toContain('2026');
      expect(formatted).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });
  });

  describe('Cenários de Integração da Página do Dashboard', () => {
    it('1. deve renderizar a precisão global com vírgula decimal brasileira (ACH-01: 76,5%)', async () => {
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
        if (url.includes('/api/dashboard/summary')) {
          return {
            status: 200,
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => sampleDashboardSummary,
          } as Response;
        }
        throw new Error(`Chamada não esperada: ${url}`);
      });

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      );

      // Precisão: 76,5% com vírgula brasileira
      const accCard = await screen.findByTestId('metric-card-accuracy-percentage');
      expect(accCard).toHaveTextContent('76,5%');
      expect(accCard).toHaveTextContent('956 acertos de 1.250');
    });

    it('2. deve aplicar aria-current="page" ao link do Dashboard na Navbar na rota /dashboard (ACH-02)', async () => {
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
        if (url.includes('/api/dashboard/summary')) {
          return {
            status: 200,
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => sampleDashboardSummary,
          } as Response;
        }
        throw new Error(`Chamada não esperada: ${url}`);
      });

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      );

      // Links do Navbar para Dashboard
      const dashLinks = await screen.findAllByRole('link', { name: /Dashboard/i });
      expect(dashLinks.length).toBeGreaterThanOrEqual(1);
      expect(dashLinks[0]).toHaveAttribute('aria-current', 'page');
    });

    it('3. deve utilizar skeletons com motion-safe:animate-pulse (ACH-03)', async () => {
      let resolvePromise: (res: Response) => void;
      const delayed = new Promise<Response>((res) => {
        resolvePromise = res;
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
        if (url.includes('/api/dashboard/summary')) {
          return delayed;
        }
        throw new Error(`Chamada não esperada: ${url}`);
      });

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      );

      const statusEl = await screen.findByRole('status', { name: /Carregando dados do dashboard/i });
      expect(statusEl).toBeInTheDocument();
      // Confirma que contém classe motion-safe:animate-pulse
      const pulseElement = statusEl.querySelector('.motion-safe\\:animate-pulse');
      expect(pulseElement).not.toBeNull();

      resolvePromise!({
        status: 200,
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => sampleDashboardSummary,
      } as Response);

      expect(await screen.findByTestId('metric-card-completed-simulations')).toBeInTheDocument();
    });

    it('4. deve exibir estado vazio no gráfico quando não houver simulados na evolução', async () => {
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
        if (url.includes('/api/dashboard/summary')) {
          return {
            status: 200,
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              ...sampleDashboardSummary,
              recentSimulationsEvolution: [],
            }),
          } as Response;
        }
        throw new Error(`Chamada não esperada: ${url}`);
      });

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(await screen.findByTestId('performance-trend-chart-empty')).toBeInTheDocument();
      expect(
        screen.getByText(/Nenhum simulado concluído para exibir evolução/i)
      ).toBeInTheDocument();
    });

    it('5. deve renderizar o gráfico com um único simulado sem gerar linha corrompida', async () => {
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
        if (url.includes('/api/dashboard/summary')) {
          return {
            status: 200,
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              ...sampleDashboardSummary,
              recentSimulationsEvolution: [
                {
                  id: 'sim-single-1',
                  title: 'Simulado Único',
                  scorePercentage: 75.0,
                  correctCount: 45,
                  wrongCount: 15,
                  totalQuestions: 60,
                  durationSeconds: 3600,
                  finishedAt: '2026-03-30T10:00:00.000Z',
                },
              ],
            }),
          } as Response;
        }
        throw new Error(`Chamada não esperada: ${url}`);
      });

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      );

      const chart = await screen.findByTestId('performance-trend-chart');
      expect(chart).toBeInTheDocument();
      expect(chart).toHaveTextContent('1 simulado avaliado');
    });

    it('6. deve renderizar o gráfico com múltiplos simulados e tabela textual acessível', async () => {
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
        if (url.includes('/api/dashboard/summary')) {
          return {
            status: 200,
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => sampleDashboardSummary,
          } as Response;
        }
        throw new Error(`Chamada não esperada: ${url}`);
      });

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      );

      const chart = await screen.findByTestId('performance-trend-chart');
      expect(chart).toBeInTheDocument();
      expect(chart).toHaveTextContent('3 últimos simulados');

      // Tabela de acessibilidade
      const table = chart.querySelector('table.sr-only');
      expect(table).not.toBeNull();
      expect(table).toHaveTextContent('Simulado PF 1');
      expect(table).toHaveTextContent('70,0%');
      expect(table).toHaveTextContent('Simulado PF 2');
      expect(table).toHaveTextContent('80,0%');
      expect(table).toHaveTextContent('Simulado PF 3');
      expect(table).toHaveTextContent('85,0%');
    });

    it('7. deve tratar scorePercentage nulo sem inventar pontuação', async () => {
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
        if (url.includes('/api/dashboard/summary')) {
          return {
            status: 200,
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              ...sampleDashboardSummary,
              recentSimulationsEvolution: [
                {
                  id: 'sim-null-score',
                  title: 'Simulado Incompleto',
                  scorePercentage: null,
                  correctCount: 0,
                  wrongCount: 0,
                  totalQuestions: 20,
                  durationSeconds: null,
                  finishedAt: null,
                },
              ],
            }),
          } as Response;
        }
        throw new Error(`Chamada não esperada: ${url}`);
      });

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      );

      const chart = await screen.findByTestId('performance-trend-chart');
      expect(chart).toBeInTheDocument();
      expect(chart).toHaveTextContent('Nota não apurada');
    });

    it('8. deve exibir estado vazio na lista de atividades quando vazia', async () => {
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
        if (url.includes('/api/dashboard/summary')) {
          return {
            status: 200,
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              ...sampleDashboardSummary,
              recentActivities: [],
            }),
          } as Response;
        }
        throw new Error(`Chamada não esperada: ${url}`);
      });

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(await screen.findByTestId('recent-activities-empty')).toBeInTheDocument();
      expect(
        screen.getByText(/Nenhuma atividade recente registrada/i)
      ).toBeInTheDocument();
    });

    it('9. deve renderizar atividades com tipos QUESTION, SIMULATION e EXAM e links apenas para rotas válidas', async () => {
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
        if (url.includes('/api/dashboard/summary')) {
          return {
            status: 200,
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => sampleDashboardSummary,
          } as Response;
        }
        throw new Error(`Chamada não esperada: ${url}`);
      });

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      );

      // Simulado: deve ter link para /simulations/:id/results
      const simItem = await screen.findByTestId('activity-item-act-sim-1');
      expect(simItem).toHaveTextContent('Simulado');
      const simLink = simItem.querySelector('a');
      expect(simLink).toHaveAttribute('href', '/simulations/sim-abc-123/results');

      // Questão: deve ter link para /questions/:id
      const qItem = screen.getByTestId('activity-item-act-q-2');
      expect(qItem).toHaveTextContent('Questão');
      const qLink = qItem.querySelector('a');
      expect(qLink).toHaveAttribute('href', '/questions/quest-xyz-789');

      // Prova Oficial (EXAM): NÃO deve ter link inventado
      const examItem = screen.getByTestId('activity-item-act-exam-3');
      expect(examItem).toHaveTextContent('Prova Oficial');
      const examLink = examItem.querySelector('a');
      expect(examLink).toBeNull();
    });

    it('10. deve preservar o streak e atividades existentes mesmo com zero simulados concluídos', async () => {
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
        if (url.includes('/api/dashboard/summary')) {
          return {
            status: 200,
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              ...sampleDashboardSummary,
              completedSimulationsCount: 0,
              totalAnsweredQuestions: 15,
              totalCorrectAnswers: 12,
              totalWrongAnswers: 3,
              accuracyPercentage: 80.0,
              totalDurationSeconds: 600,
              currentStreak: 3,
              longestStreak: 5,
              lastActivityDate: '2026-03-30',
              recentSimulationsEvolution: [],
              recentActivities: [sampleRecentActivities[1]], // Apenas questão avulsa
            }),
          } as Response;
        }
        throw new Error(`Chamada não esperada: ${url}`);
      });

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      );

      // Streak de 3 dias preservado
      expect(await screen.findByTestId('current-streak-value')).toHaveTextContent('3 dias consecutivos');

      // Atividade de questão preservada
      expect(screen.getByTestId('activity-item-act-q-2')).toBeInTheDocument();

      // Gráfico vazio com mensagem específica
      expect(screen.getByTestId('performance-trend-chart-empty')).toBeInTheDocument();

      // Banner orientativo para primeiros passos com simulados
      expect(screen.getByTestId('dashboard-empty-state')).toBeInTheDocument();
      expect(screen.getByText(/Nenhum simulado concluído ainda/i)).toBeInTheDocument();
    });

    it('11. deve manter o funcionamento do botão Tentar Novamente em caso de erro', async () => {
      let callCount = 0;

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
        if (url.includes('/api/dashboard/summary')) {
          callCount++;
          if (callCount === 1) {
            return {
              status: 500,
              ok: false,
              headers: new Headers({ 'content-type': 'application/json' }),
              json: async () => ({ error: 'TEMP_ERROR', message: 'Erro temporário' }),
            } as Response;
          }
          return {
            status: 200,
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => sampleDashboardSummary,
          } as Response;
        }
        throw new Error(`Chamada não esperada: ${url}`);
      });

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      );

      const retryBtn = await screen.findByRole('button', { name: /Tentar novamente/i });
      fireEvent.click(retryBtn);

      expect(await screen.findByTestId('metric-card-completed-simulations')).toBeInTheDocument();
      expect(callCount).toBe(2);
    });

    it('12. não deve emitir chamadas redundantes à API do dashboard em uma única montagem', async () => {
      let dashboardCalls = 0;

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
        if (url.includes('/api/dashboard/summary')) {
          dashboardCalls++;
          return {
            status: 200,
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => sampleDashboardSummary,
          } as Response;
        }
        throw new Error(`Chamada não esperada: ${url}`);
      });

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await screen.findByTestId('metric-card-completed-simulations');
      expect(dashboardCalls).toBe(1);
    });

    it('13. deve exibir painel de acesso restrito e NÃO invocar a API privada quando deslogado (Cenário A)', async () => {
      let dashboardApiCalled = false;

      globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/auth/me')) {
          return {
            status: 401,
            ok: false,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ error: 'UNAUTHORIZED', message: 'Sessão inválida' }),
          } as Response;
        }
        if (url.includes('/api/dashboard/summary')) {
          dashboardApiCalled = true;
          return {
            status: 200,
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => sampleDashboardSummary,
          } as Response;
        }
        throw new Error(`Chamada não esperada: ${url}`);
      });

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      );

      // Painel de acesso restrito exibido
      expect(
        await screen.findByRole('heading', {
          name: /Autenticação necessária para acessar o Dashboard/i,
        })
      ).toBeInTheDocument();

      // Links de autenticação presentes
      const loginLink = screen.getByRole('link', { name: /Ir para o Login/i });
      expect(loginLink).toBeInTheDocument();
      expect(loginLink).toHaveAttribute('href', '/login');

      const registerLinks = screen.getAllByRole('link', { name: /Criar conta/i });
      expect(registerLinks.length).toBeGreaterThanOrEqual(1);
      expect(registerLinks[0]).toHaveAttribute('href', '/register');

      // getDashboardSummary NÃO foi chamado
      expect(dashboardApiCalled).toBe(false);

      // Nenhum dado privado do Dashboard foi renderizado
      expect(screen.queryByTestId('dashboard-streak-banner')).toBeNull();
      expect(screen.queryByTestId('metric-card-completed-simulations')).toBeNull();
      expect(screen.queryByTestId('performance-trend-chart')).toBeNull();
      expect(screen.queryByTestId('recent-activities-list')).toBeNull();
    });

    it('14. não deve exibir o link do Dashboard na Navbar para usuário deslogado (Cenário B)', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/auth/me')) {
          return {
            status: 401,
            ok: false,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ error: 'UNAUTHORIZED', message: 'Sessão inválida' }),
          } as Response;
        }
        throw new Error(`Chamada não esperada: ${url}`);
      });

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      );

      // Aguarda estabilizar a verificação de sessão deslogada
      await screen.findByRole('heading', {
        name: /Autenticação necessária para acessar o Dashboard/i,
      });

      // Link para o Dashboard NÃO deve existir no Navbar (nem desktop nem mobile)
      const dashboardLinks = screen.queryAllByRole('link', { name: /^Dashboard$/i });
      expect(dashboardLinks).toHaveLength(0);

      // Links públicos "Entrar" e "Criar conta" devem estar presentes na Navbar
      expect(screen.getByRole('link', { name: /^Entrar$/i })).toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: /Criar conta/i }).length).toBeGreaterThanOrEqual(1);
    });

    it('15. deve conter botão CTA Novo Simulado no cabeçalho apontando para rota válida (Cenário C)', async () => {
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
        if (url.includes('/api/dashboard/summary')) {
          return {
            status: 200,
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => sampleDashboardSummary,
          } as Response;
        }
        throw new Error(`Chamada não esperada: ${url}`);
      });

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      );

      // Botão CTA "Novo Simulado" no topo do Dashboard
      const ctaButton = await screen.findByRole('link', { name: /Novo Simulado/i });
      expect(ctaButton).toBeInTheDocument();
      expect(ctaButton).toHaveAttribute('href', '/simulations/new');
    });

    it('16. deve garantir semântica acessível dos pontos SVG sem anunciar botões falsos (ACH-05)', async () => {
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
        if (url.includes('/api/dashboard/summary')) {
          return {
            status: 200,
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => sampleDashboardSummary,
          } as Response;
        }
        throw new Error(`Chamada não esperada: ${url}`);
      });

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await screen.findByTestId('performance-trend-chart');

      // Os pontos do gráfico NÃO devem possuir role="button" (não são botões de ação)
      const fakePointButtons = screen.queryAllByRole('button', { name: /Simulado/i });
      expect(fakePointButtons).toHaveLength(0);

      // Os pontos possuem testid e são focáveis via teclado (tabindex=0)
      const point0 = screen.getByTestId('chart-point-0');
      expect(point0).toHaveAttribute('tabindex', '0');
      expect(point0).toHaveAttribute('aria-label');

      // Ao receber foco, o tooltip de detalhes é revelado
      fireEvent.focus(point0);
      const tooltip = await screen.findByTestId('chart-active-tooltip');
      expect(tooltip).toBeInTheDocument();
      expect(tooltip).toHaveTextContent('Simulado PF 1');
      expect(tooltip).toHaveTextContent('70,0%');

      // Ao perder foco, o tooltip é fechado
      fireEvent.blur(point0);
      expect(screen.queryByTestId('chart-active-tooltip')).toBeNull();
    });
  });
});
