import { Link } from 'react-router-dom';
import { ArrowLeft, Info } from 'lucide-react';
import { Navbar } from '../components/Navbar.tsx';
import { Footer } from '../components/Footer.tsx';

/**
 * Página informativa de Recuperação de Senha.
 * Conforme diretriz de segurança da Sprint 1, não simula envio de e-mail falso
 * enquanto um provedor transacional real (SMTP/API de e-mail) não estiver configurado.
 */
export function ForgotPasswordPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] flex flex-col justify-between">
      <Navbar />

      <main className="mx-auto w-full max-w-lg px-4 py-16 sm:px-6 flex-1 flex flex-col justify-center">
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-6 sm:p-8 qf-animate-in">
          <p className="text-xs font-mono text-neutral-400">
            Recuperação de Credenciais · Dependência de Provedor de E-mail
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
            Recuperação de senha
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-neutral-300">
            Para garantir segurança real e impedir vazamento de tokens de redefinição, o fluxo de
            recuperação de senha exige um provedor transacional de envio de e-mail (SMTP) ativo no
            ambiente.
          </p>

          <div className="mt-6 rounded-md border border-neutral-800 bg-[#0A0A0A] p-4">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-[#2563EB]" />
              <div className="text-xs leading-relaxed text-neutral-300">
                <p className="font-semibold text-white">
                  Sem simulação de envio de e-mail
                </p>
                <p className="mt-1 text-neutral-400">
                  O QuestForge não exibe confirmações falsas de envio de e-mail nem expõe tokens de
                  redefinição na resposta HTTP. A entrega de tokens de recuperação está documentada
                  como dependente da configuração de um serviço SMTP real.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-md bg-[#2563EB] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para o Login
            </Link>
            <Link
              to="/register"
              className="rounded-md border border-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
            >
              Criar nova conta
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
