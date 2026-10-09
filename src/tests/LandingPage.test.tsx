import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../App.tsx';

describe('Landing Page Oficial & Roteamento Inicial (src/tests/LandingPage.test.tsx)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('deve renderizar as seções obrigatórias da Landing Page, consultar /api/health e distinguir recursos ativos dos planejados', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 401,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: 'Unauthorized', message: 'Autenticação necessária.' }),
        } as Response;
      }

      return {
        status: 200,
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          app: {
            name: 'QuestForge API',
            status: 'up',
            environment: 'test',
          },
          dependencies: {
            database: {
              provider: 'postgresql',
              status: 'up',
              latencyMs: 5,
              message: 'Conectividade com PostgreSQL verificada com sucesso.',
            },
            environment: {
              status: 'configured',
              missingOrInvalidCount: 0,
              issues: [],
            },
          },
        }),
      } as Response;
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>
    );

    // 1. Headline principal do Hero
    expect(
      screen.getByRole('heading', {
        name: /Transforme provas anteriores em um plano de estudos orientado por desempenho/i,
      })
    ).toBeInTheDocument();

    // 2. Verifica seções estruturais obrigatórias
    expect(
      screen.getByRole('heading', {
        name: /Por que resolver provas soltas em PDF limita sua evolução/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /Como o QuestForge transforma documentos brutos em estudo orientado por dados/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /IA local para estruturar documentos e analisar métricas/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /Sequência de estudos \(Streak\) baseada em atividade real/i,
      })
    ).toBeInTheDocument();

    // 3. Verifica distinção explícita entre o que está ativo e o que está planejado
    expect(screen.getByText('Ativo na Sprint 0')).toBeInTheDocument();
    expect(
      screen.getByText('Ativo na Sprint 1 (Requer PostgreSQL ativo)')
    ).toBeInTheDocument();
    expect(screen.getByText('Planejado — Sprint 6')).toBeInTheDocument();

    // 4. Verifica atualização com o status real vindo de /api/health
    await waitFor(() => {
      expect(screen.getByText(/HEALTHY \(HTTP 200\)/i)).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Conectividade com PostgreSQL verificada com sucesso/i)
    ).toBeInTheDocument();
  });

  it('deve tratar falha ou indisponibilidade de /api/health sem exibir estado falso de sucesso', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Falha de conexão com o servidor'));

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByText(/API de Health Check indisponível/i)).toBeInTheDocument();
    expect(screen.queryByText(/HEALTHY \(HTTP 200\)/i)).not.toBeInTheDocument();
  });

  it('deve exibir estado DEGRADED (HTTP 503) sem indicar falsamente que o sistema está saudável quando o PostgreSQL está desconfigurado ou indisponível', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 503,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        app: { name: 'QuestForge API', status: 'up', environment: 'development' },
        dependencies: {
          database: {
            provider: 'postgresql',
            status: 'unconfigured',
            latencyMs: null,
            message: 'Variável DATABASE_URL ausente.',
          },
          environment: { status: 'incomplete', missingOrInvalidCount: 2, issues: [] },
        },
      }),
    } as Response);

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/DEGRADED \(HTTP 503\)/i)).toBeInTheDocument();
    });

    expect(screen.getByText('UNCONFIGURED')).toBeInTheDocument();
    expect(screen.queryByText(/HEALTHY \(HTTP 200\)/i)).not.toBeInTheDocument();
  });

  it('deve tratar respostas HTTP inválidas (ex.: HTML 502 ou JSON fora do contrato) como erro sem exibir estado saudável', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 502,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => '<html>Bad Gateway</html>',
    } as unknown as Response);

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByText(/Content-Type não é JSON/i)).toBeInTheDocument();
    expect(screen.queryByText(/HEALTHY \(HTTP 200\)/i)).not.toBeInTheDocument();
  });

  it('deve navegar para /login e /register exibindo os formulários reais de autenticação da Sprint 1', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'Unauthorized', message: 'Autenticação necessária.' }),
    } as Response);

    const { unmount } = render(
      <MemoryRouter initialEntries={['/login']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', { name: /Entrar na sua conta/i })
    ).toBeInTheDocument();

    unmount();

    render(
      <MemoryRouter initialEntries={['/register']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', { name: /Criar sua conta/i })
    ).toBeInTheDocument();
  });
});
