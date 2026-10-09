import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';

const NAV_LINKS = [
  { label: 'O Problema', href: '/#problema' },
  { label: 'Funcionamento', href: '/#funcionamento' },
  { label: 'Recursos', href: '/#recursos' },
  { label: 'IA Aplicada', href: '/#ia-aplicada' },
  { label: 'Simulados', href: '/#simulados' },
  { label: 'Desempenho', href: '/#desempenho' },
  { label: 'Consistência', href: '/#streak-historico' },
  { label: 'Confiabilidade', href: '/#privacidade' },
];

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
      setMobileMenuOpen(false);
      navigate('/login');
    } catch {
      // O estado de autenticação permanece intacto se o backend falhar ao encerrar a sessão
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-800 bg-[#0A0A0A]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Zona 1: Brand wordmark único */}
        <Link
          to="/"
          className="text-lg font-bold tracking-tight text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563EB]"
        >
          QuestForge
        </Link>

        {/* Zona 2: Links de navegação limpa */}
        <nav
          aria-label="Navegação principal"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-neutral-400"
        >
          {NAV_LINKS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="whitespace-nowrap transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563EB]"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Zona 3: Ações primárias conforme estado real da sessão */}
        <div className="hidden md:flex items-center gap-3">
          {status === 'authenticated' && user ? (
            <>
              <Link
                to="/profile"
                className="whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium text-neutral-300 transition-colors duration-150 hover:bg-neutral-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
              >
                Minha conta ({user.name.split(' ')[0]})
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="whitespace-nowrap rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors duration-150 hover:bg-neutral-900 hover:text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
              >
                {isLoggingOut ? 'Saindo...' : 'Sair'}
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium text-neutral-300 transition-colors duration-150 hover:bg-neutral-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
              >
                Entrar
              </Link>
              <Link
                to="/register"
                className="whitespace-nowrap rounded-md bg-[#2563EB] px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
              >
                Criar conta
              </Link>
            </>
          )}
        </div>

        {/* Botão Menu Mobile */}
        <div className="flex md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav-menu"
            aria-label={mobileMenuOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-neutral-800 text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Menu Mobile */}
      {mobileMenuOpen && (
        <nav
          id="mobile-nav-menu"
          aria-label="Navegação móvel"
          className="border-t border-neutral-800 bg-[#0A0A0A] px-4 pt-3 pb-5 md:hidden"
        >
          <div className="flex flex-col space-y-2">
            {NAV_LINKS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-900 hover:text-white focus-visible:outline-2 focus-visible:outline-[#2563EB]"
              >
                {item.label}
              </a>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-2 border-t border-neutral-800 pt-4">
            {status === 'authenticated' && user ? (
              <>
                <Link
                  to="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full rounded-md border border-neutral-800 px-4 py-2.5 text-center text-sm font-medium text-neutral-200 hover:bg-neutral-900 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                >
                  Minha conta ({user.name})
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="w-full rounded-md bg-[#2563EB] px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-[#1D4ED8] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                >
                  {isLoggingOut ? 'Saindo...' : 'Sair'}
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full rounded-md border border-neutral-800 px-4 py-2.5 text-center text-sm font-medium text-neutral-200 hover:bg-neutral-900 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                >
                  Entrar
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full rounded-md bg-[#2563EB] px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                >
                  Criar conta
                </Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
