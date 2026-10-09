import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../App.tsx';

describe('Página de Login & Sessão (src/tests/Login.test.tsx)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('deve validar campos obrigatórios no frontend antes de submeter à API', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'Unauthorized', message: 'Autenticação necessária.' }),
    } as Response);

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AppRoutes />
      </MemoryRouter>
    );

    const submitButton = screen.getByRole('button', { name: /Entrar/i });
    fireEvent.click(submitButton);

    expect(await screen.findByText(/Informe seu endereço de e-mail/i)).toBeInTheDocument();
    expect(await screen.findByText(/A senha é obrigatória/i)).toBeInTheDocument();
  });

  it('deve enviar POST /api/auth/login com X-Requested-With: QuestForge-Client, autenticar e redirecionar para /profile, permitindo logout real', async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 401,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: 'Unauthorized', message: 'Autenticação necessária.' }),
        } as Response;
      }

      if (url.includes('/api/auth/login')) {
        const headers = init?.headers as Record<string, string>;
        expect(headers['X-Requested-With']).toBe('QuestForge-Client');
        expect(init?.credentials).toBe('include');

        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            user: {
              id: 'user-101',
              name: 'Helena Martins',
              email: 'helena@questforge.dev',
              avatarUrl: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            session: {
              id: 'session-202',
              userId: 'user-101',
              expiresAt: new Date(Date.now() + 3600000).toISOString(),
              createdAt: new Date().toISOString(),
              lastUsedAt: new Date().toISOString(),
            },
          }),
        } as Response;
      }

      if (url.includes('/api/auth/logout')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ message: 'Sessão encerrada com sucesso.' }),
        } as Response;
      }

      throw new Error(`URL inesperada: ${url}`);
    });

    globalThis.fetch = fetchMock;

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AppRoutes />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'helena@questforge.dev' },
    });
    fireEvent.change(screen.getByLabelText(/Senha/i), {
      target: { value: 'SenhaForte2026!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }));

    // Deve redirecionar para /profile e exibir os dados da sessão
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Helena Martins' })).toBeInTheDocument();
    });
    expect(screen.getByText('session-202')).toBeInTheDocument();

    // Executa logout real e verifica retorno para /login
    fireEvent.click(screen.getByRole('button', { name: /Encerrar sessão/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Entrar na sua conta/i })).toBeInTheDocument();
    });
  });

  it('deve exibir alerta acessível quando a API retorna 401 ou está indisponível sem autenticar o usuário', async () => {
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
        status: 401,
        ok: false,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          error: 'INVALID_CREDENTIALS',
          message: 'E-mail ou senha inválidos.',
        }),
      } as Response;
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AppRoutes />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'helena@questforge.dev' },
    });
    fireEvent.change(screen.getByLabelText(/Senha/i), {
      target: { value: 'SenhaIncorreta!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/E-mail ou senha inválidos/i);
  });

  it('deve tratar respostas HTTP 429 (Rate Limit) e HTTP 503 (Serviço Indisponível) sem autenticar o usuário, e manter sessão intacta se o logout falhar', async () => {
    let callPhase: 'rate_limit' | 'service_unavailable' = 'rate_limit';

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

      if (callPhase === 'rate_limit') {
        return {
          status: 429,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            error: 'TooManyRequests',
            message: 'Muitas tentativas realizadas. Aguarde alguns minutos antes de tentar novamente.',
          }),
        } as Response;
      }

      return {
        status: 503,
        ok: false,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          error: 'ServiceUnavailable',
          message: 'Não foi possível verificar a sessão no momento.',
        }),
      } as Response;
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AppRoutes />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'helena@questforge.dev' },
    });
    fireEvent.change(screen.getByLabelText(/Senha/i), {
      target: { value: 'SenhaQualquer123!' },
    });

    // 1. Cenário HTTP 429
    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Muitas tentativas realizadas/i);

    // 2. Cenário HTTP 503
    callPhase = 'service_unavailable';
    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Não foi possível verificar a sessão no momento/i
    );
  });
});
