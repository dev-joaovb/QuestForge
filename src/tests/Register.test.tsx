import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../App.tsx';

describe('Página de Cadastro (src/tests/Register.test.tsx)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('deve validar tamanho mínimo de nome e senha no frontend antes de chamar a API', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'Unauthorized', message: 'Autenticação necessária.' }),
    } as Response);

    render(
      <MemoryRouter initialEntries={['/register']}>
        <AppRoutes />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/Nome completo/i), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText(/E-mail/i), { target: { value: 'invalido' } });
    fireEvent.change(screen.getByLabelText(/Senha/i), { target: { value: '12345' } });

    fireEvent.click(screen.getByRole('button', { name: /Criar conta/i }));

    expect(
      await screen.findByText(/O nome deve ter pelo menos 2 caracteres/i)
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Informe um endereço de e-mail válido/i)
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/A senha deve possuir no mínimo 8 caracteres/i)
    ).toBeInTheDocument();
  });

  it('deve enviar POST /api/auth/register com cabeçalho CSRF e redirecionar para /profile em caso de sucesso', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 401,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: 'Unauthorized', message: 'Autenticação necessária.' }),
        } as Response;
      }

      if (url.includes('/api/auth/register')) {
        const headers = init?.headers as Record<string, string>;
        expect(headers['X-Requested-With']).toBe('QuestForge-Client');
        expect(init?.credentials).toBe('include');

        return {
          status: 201,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            user: {
              id: 'user-303',
              name: 'Carlos Mendes',
              email: 'carlos@questforge.dev',
              avatarUrl: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            session: {
              id: 'session-404',
              userId: 'user-303',
              expiresAt: new Date(Date.now() + 3600000).toISOString(),
              createdAt: new Date().toISOString(),
              lastUsedAt: new Date().toISOString(),
            },
          }),
        } as Response;
      }

      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/register']}>
        <AppRoutes />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/Nome completo/i), {
      target: { value: 'Carlos Mendes' },
    });
    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'carlos@questforge.dev' },
    });
    fireEvent.change(screen.getByLabelText(/Senha/i), {
      target: { value: 'SenhaCarlos2026!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Criar conta/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Carlos Mendes' })).toBeInTheDocument();
    });
    expect(screen.getByText('carlos@questforge.dev')).toBeInTheDocument();
  });

  it('deve exibir erro HTTP 409 ou falha quando o e-mail já está em uso ou o banco está indisponível', async () => {
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
        status: 409,
        ok: false,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          error: 'EMAIL_ALREADY_IN_USE',
          message: 'Não foi possível concluir o cadastro com o e-mail informado.',
        }),
      } as Response;
    });

    render(
      <MemoryRouter initialEntries={['/register']}>
        <AppRoutes />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/Nome completo/i), {
      target: { value: 'Carlos Mendes' },
    });
    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'carlos@questforge.dev' },
    });
    fireEvent.change(screen.getByLabelText(/Senha/i), {
      target: { value: 'SenhaCarlos2026!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Criar conta/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Não foi possível concluir o cadastro com o e-mail informado/i);
  });
});
