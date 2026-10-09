import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { Navbar } from '../components/Navbar.tsx';
import { Footer } from '../components/Footer.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';

export function LoginPage() {
  const { login, status, user } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateFields = () => {
    const errors: { email?: string; password?: string } = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      errors.email = 'Informe seu endereço de e-mail.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Informe um endereço de e-mail válido.';
    }

    if (!password) {
      errors.password = 'A senha é obrigatória.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    if (!validateFields()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await login({
        email: email.trim().toLowerCase(),
        password,
      });
      navigate('/profile');
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Não foi possível realizar o login. Verifique a conexão com o servidor.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] flex flex-col justify-between">
      <Navbar />

      <main className="mx-auto w-full max-w-md px-4 py-16 sm:px-6 flex-1 flex flex-col justify-center">
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-6 sm:p-8 qf-animate-in">
          <p className="text-xs font-mono text-neutral-400">
            Autenticação QuestForge · Sessão Segura HttpOnly
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
            Entrar na sua conta
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Acesse sua conta para gerenciar seus estudos. A sessão é validada no servidor via cookie{' '}
            <code>HttpOnly</code>.
          </p>

          {status === 'authenticated' && user && (
            <div className="mt-4 rounded-md border border-neutral-800 bg-[#0A0A0A] p-3.5 text-xs text-neutral-300">
              Você já está autenticado como <strong>{user.email}</strong>.{' '}
              <Link to="/profile" className="text-[#2563EB] underline hover:text-white">
                Ir para Minha Conta
              </Link>
            </div>
          )}

          {submitError && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2.5 rounded-md border border-red-900/60 bg-red-950/20 p-3.5 text-xs text-red-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span>{submitError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-neutral-200">
                E-mail
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
                placeholder="voce@exemplo.com"
                className="mt-1.5 block w-full rounded-md border border-neutral-800 bg-[#0A0A0A] px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 transition-colors focus:border-[#2563EB] focus:outline-none disabled:opacity-50"
              />
              {fieldErrors.email && (
                <p id="login-email-error" className="mt-1.5 text-xs text-red-400">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="login-password"
                  className="block text-xs font-medium text-neutral-200"
                >
                  Senha
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-neutral-400 hover:text-white focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                >
                  Recuperação de senha
                </Link>
              </div>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                placeholder="Sua senha"
                className="mt-1.5 block w-full rounded-md border border-neutral-800 bg-[#0A0A0A] px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 transition-colors focus:border-[#2563EB] focus:outline-none disabled:opacity-50"
              />
              {fieldErrors.password && (
                <p id="login-password-error" className="mt-1.5 text-xs text-red-400">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
            >
              {isSubmitting ? 'Autenticando...' : 'Entrar'}
              {!isSubmitting && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          <div className="mt-6 border-t border-neutral-800 pt-5 text-center text-xs text-neutral-400">
            Ainda não possui uma conta?{' '}
            <Link
              to="/register"
              className="font-medium text-white underline decoration-[#2563EB] underline-offset-4 hover:text-neutral-200"
            >
              Criar conta
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
