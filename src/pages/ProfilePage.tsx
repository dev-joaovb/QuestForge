import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, LogOut, RefreshCw, UserCheck } from 'lucide-react';
import { Navbar } from '../components/Navbar.tsx';
import { Footer } from '../components/Footer.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';

export function ProfilePage() {
  const { status, user, session, sessionCheckError, logout, refreshSession } = useAuth();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLogoutError(null);
    setIsLoggingOut(true);
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      setLogoutError(
        error instanceof Error ? error.message : 'Não foi possível encerrar a sessão.'
      );
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] flex flex-col justify-between">
      <Navbar />

      <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 flex-1">
        {status === 'loading' && (
          <div
            role="status"
            className="rounded-lg border border-neutral-800 bg-neutral-950 p-8 text-sm font-mono text-neutral-400"
          >
            Verificando sessão ativa junto ao servidor (GET /api/auth/me)...
          </div>
        )}

        {status === 'unauthenticated' && (
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-6 sm:p-8 qf-animate-in">
            <p className="text-xs font-mono text-neutral-400">Acesso Restrito · Sessão Não Autenticada</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
              Você não está autenticado
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              Para visualizar os dados da sua conta e da sua sessão ativa, realize o login ou crie
              uma conta.
            </p>

            {sessionCheckError && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2.5 rounded-md border border-red-900/60 bg-red-950/20 p-3.5 text-xs text-red-200"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <span>{sessionCheckError}</span>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                to="/login"
                className="rounded-md bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-[#2563EB]"
              >
                Ir para o Login
              </Link>
              <Link
                to="/register"
                className="rounded-md border border-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-white focus-visible:outline-2 focus-visible:outline-[#2563EB]"
              >
                Criar conta
              </Link>
            </div>
          </div>
        )}

        {status === 'authenticated' && user && session && (
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-6 sm:p-8 qf-animate-in">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-5">
              <div>
                <p className="text-xs font-mono text-neutral-400">
                  Perfil do Usuário · Dados Confirmados por GET /api/auth/me
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
                  {user.name}
                </h1>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => refreshSession()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-900 hover:text-white focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Revalidar sessão
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {isLoggingOut ? 'Encerrando...' : 'Encerrar sessão'}
                </button>
              </div>
            </div>

            {logoutError && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2.5 rounded-md border border-red-900/60 bg-red-950/20 p-3.5 text-xs text-red-200"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <span>{logoutError}</span>
              </div>
            )}

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
              <div className="rounded border border-neutral-800 bg-[#0A0A0A] p-4">
                <span className="text-neutral-400">E-mail da Conta</span>
                <p className="mt-1 font-mono text-sm text-white">{user.email}</p>
              </div>
              <div className="rounded border border-neutral-800 bg-[#0A0A0A] p-4">
                <span className="text-neutral-400">ID do Usuário</span>
                <p className="mt-1 font-mono text-sm text-white tabular-nums">{user.id}</p>
              </div>
              <div className="rounded border border-neutral-800 bg-[#0A0A0A] p-4">
                <span className="text-neutral-400">ID da Sessão Ativa</span>
                <p className="mt-1 font-mono text-sm text-white tabular-nums">{session.id}</p>
              </div>
              <div className="rounded border border-neutral-800 bg-[#0A0A0A] p-4">
                <span className="text-neutral-400">Expiração da Sessão</span>
                <p className="mt-1 font-mono text-sm text-white tabular-nums">
                  {new Date(session.expiresAt).toISOString()}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-2 border-t border-neutral-800 pt-5 text-xs text-neutral-400">
              <UserCheck className="h-4 w-4 text-[#2563EB]" />
              <span>
                Sessão mantida via cookie <code>HttpOnly</code> sem uso de <code>localStorage</code>.
              </span>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
