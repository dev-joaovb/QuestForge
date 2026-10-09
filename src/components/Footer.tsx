import { Link } from 'react-router-dom';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-neutral-800 bg-[#0A0A0A] text-neutral-400">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="md:col-span-2">
            <Link
              to="/"
              className="text-lg font-bold tracking-tight text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563EB]"
            >
              QuestForge
            </Link>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-neutral-400">
              Plataforma de engenharia de estudos para preparação estruturada em concursos públicos,
              vestibulares, certificações e exames, com processamento de provas em PDF, OCR,
              validação de dados e acompanhamento de desempenho no PostgreSQL.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-white">Seções da Plataforma</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <a href="#problema" className="hover:text-white transition-colors">
                  O Problema
                </a>
              </li>
              <li>
                <a href="#funcionamento" className="hover:text-white transition-colors">
                  Pipeline de Funcionamento
                </a>
              </li>
              <li>
                <a href="#recursos" className="hover:text-white transition-colors">
                  Recursos e Status das Sprints
                </a>
              </li>
              <li>
                <a href="#ia-aplicada" className="hover:text-white transition-colors">
                  IA Aplicada com Validação
                </a>
              </li>
              <li>
                <a href="#privacidade" className="hover:text-white transition-colors">
                  Privacidade e Confiabilidade
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-white">Acesso</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link to="/login" className="hover:text-white transition-colors">
                  Entrar na plataforma
                </Link>
              </li>
              <li>
                <Link to="/register" className="hover:text-white transition-colors">
                  Criar conta
                </Link>
              </li>
              <li>
                <a href="#status-fundacao" className="hover:text-white transition-colors">
                  Status da Fundação (Sprint 0)
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-neutral-900 pt-8 text-xs text-neutral-500 sm:flex-row sm:items-center">
          <p>© {currentYear} QuestForge. Arquitetura React, Node.js, Express, Prisma e PostgreSQL.</p>
          <p>Sprint 0 (Fundação Técnica Ativa) · Módulos de domínio em evolução incremental por Sprints.</p>
        </div>
      </div>
    </footer>
  );
}
