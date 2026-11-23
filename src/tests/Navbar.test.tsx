import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext.tsx';
import { Navbar } from '../components/Navbar.tsx';

const authenticatedUser = {
  user: {
    id: 'navbar-user-1',
    name: 'Mariana Silva',
    email: 'mariana@example.com',
    avatarUrl: null,
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
  },
  session: {
    id: 'navbar-session-1',
    userId: 'navbar-user-1',
    expiresAt: '2026-12-25T10:00:00.000Z',
    createdAt: '2026-10-20T10:00:00.000Z',
    lastUsedAt: '2026-11-23T10:00:00.000Z',
  },
};

const publicLinks = [
  'O Problema',
  'Funcionamento',
  'Recursos',
  'IA Aplicada',
  'Desempenho',
  'Consistência',
  'Confiabilidade',
];

const privateLinks = [
  'Dashboard',
  'Documentos PDF',
  'Banco de Questões',
  'Simulados',
  'Gabaritos Oficiais',
];

const originalFetch = globalThis.fetch;

function mockSession(authenticated: boolean) {
  globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes('/api/auth/me')) {
      return {
        ok: authenticated,
        status: authenticated ? 200 : 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () =>
          authenticated
            ? authenticatedUser
            : { error: 'UNAUTHORIZED', message: 'Sessão inválida' },
      };
    }

    if (url.includes('/api/auth/logout')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
      };
    }

    throw new Error(`Requisição inesperada: ${url}`);
  });
}

function renderNavbar() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <Navbar />
      </AuthProvider>
    </MemoryRouter>
  );
}

function desktopNav() {
  return screen.getByRole('navigation', { name: 'Navegação principal' });
}

function openMobileMenu() {
  const button = screen.getByRole('button', { name: /menu/i });
  fireEvent.click(button);
  return screen.getByRole('navigation', { name: 'Navegação móvel' });
}

describe('Navbar — navegação por estado de autenticação', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('exibe links públicos e ações de entrada para visitantes', async () => {
    mockSession(false);
    renderNavbar();

    await screen.findByRole('link', { name: 'Entrar' });

    const nav = desktopNav();

    for (const label of publicLinks) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    }

    expect(within(nav).getByRole('link', { name: 'Simulados' }))
      .toHaveAttribute('href', '/#simulados');

    expect(screen.getByRole('link', { name: 'Criar conta' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
  });

  it('exibe somente links privados para usuários autenticados', async () => {
    mockSession(true);
    renderNavbar();

    await screen.findByRole('link', { name: 'Dashboard' });

    for (const label of publicLinks) {
      expect(within(desktopNav()).queryByRole('link', { name: label }))
        .not.toBeInTheDocument();
    }

    for (const label of privateLinks) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }

    expect(screen.getByRole('link', { name: 'Simulados' }))
      .toHaveAttribute('href', '/simulations');

    expect(screen.queryByRole('link', { name: 'Entrar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Criar conta' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });

  it('não exibe links de sessão enquanto a autenticação carrega', () => {
    globalThis.fetch = vi.fn().mockImplementation(
      () => new Promise(() => {})
    );

    renderNavbar();

    expect(within(desktopNav()).queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Entrar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Criar conta' })).not.toBeInTheDocument();
  });

  it('mantém somente navegação privada no menu mobile autenticado', async () => {
    mockSession(true);
    renderNavbar();

    await screen.findByRole('link', { name: 'Dashboard' });

    const mobile = openMobileMenu();

    for (const label of publicLinks) {
      expect(within(mobile).queryByRole('link', { name: label }))
        .not.toBeInTheDocument();
    }

    for (const label of privateLinks) {
      expect(within(mobile).getByRole('link', { name: label }))
        .toBeInTheDocument();
    }

    expect(within(mobile).getByRole('link', { name: 'Simulados' }))
      .toHaveAttribute('href', '/simulations');

    expect(within(mobile).getByRole('button', { name: 'Sair' }))
      .toBeInTheDocument();
  });

  it('mantém somente navegação pública no menu mobile visitante', async () => {
    mockSession(false);
    renderNavbar();

    await screen.findByRole('link', { name: 'Entrar' });

    const mobile = openMobileMenu();

    expect(within(mobile).getByRole('link', { name: 'O Problema' }))
      .toBeInTheDocument();

    expect(within(mobile).getByRole('link', { name: 'Simulados' }))
      .toHaveAttribute('href', '/#simulados');

    expect(within(mobile).queryByRole('link', { name: 'Dashboard' }))
      .not.toBeInTheDocument();

    expect(within(mobile).getByRole('link', { name: 'Entrar' }))
      .toBeInTheDocument();
  });

  it('retorna à navegação pública após logout confirmado', async () => {
    mockSession(true);
    renderNavbar();

    await screen.findByRole('button', { name: 'Sair' });

    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Dashboard' }))
        .not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Entrar' }))
        .toBeInTheDocument();
    });

    expect(within(desktopNav()).getByRole('link', { name: 'O Problema' }))
      .toBeInTheDocument();
  });
});
