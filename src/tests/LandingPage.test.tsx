import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('deve renderizar as seções da Landing Page sem expor o diagnóstico técnico', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'Unauthorized', message: 'Autenticação necessária.' }),
    } as Response);

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>
    );

    // 1. Headline principal do Hero
    expect(
      screen.getByRole('heading', {
        name: /Transforme seus estudos em resultados reais/i,
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
        name: /Do material de estudo à sua próxima conquista/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /Estude com mais inteligência, não apenas por mais tempo/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /Crie uma rotina de estudos que gera resultados/i,
      })
    ).toBeInTheDocument();

    // 3. Verifica transparência sobre a validação operacional dos recursos
    expect(
      screen.getAllByText('Implementado — requer validação local')
    ).toHaveLength(9);
    expect(screen.queryByText(/Planejado — Sprint/i)).not.toBeInTheDocument();

    // 4. O diagnóstico técnico não deve aparecer na página pública.
    expect(
      screen.queryByRole('region', { name: /Diagnóstico técnico da plataforma/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Diagnóstico em Tempo Real da Fundação/i)
    ).not.toBeInTheDocument();

    // 5. A Landing Page não deve consultar o endpoint de diagnóstico.
    expect(
      vi.mocked(globalThis.fetch).mock.calls.some(([input]) =>
        String(input).includes('/api/health')
      )
    ).toBe(false);
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
