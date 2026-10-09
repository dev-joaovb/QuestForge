import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { Navbar } from '../components/Navbar.tsx';
import { Footer } from '../components/Footer.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import {
  ApiHttpError,
  deleteQuestion,
  fetchQuestions,
} from '../services/api.ts';
import type {
  ListQuestionsParams,
  PaginatedQuestionsResponse,
  QuestionDifficulty,
  QuestionType,
} from '../types/index.ts';

const DIFFICULTY_LABELS: Record<QuestionDifficulty, string> = {
  EASY: 'Fácil',
  MEDIUM: 'Média',
  HARD: 'Difícil',
};

const TYPE_LABELS: Record<QuestionType, string> = {
  MULTIPLE_CHOICE: 'Múltipla Escolha',
  TRUE_FALSE: 'Certo / Errado',
};

const EMPTY_FILTERS: Omit<ListQuestionsParams, 'page' | 'limit'> = {
  search: '',
  subject: '',
  topic: '',
  board: '',
  examTitle: '',
  type: '',
  difficulty: '',
};

export function QuestionsListPage() {
  const { status, sessionCheckError, refreshSession } = useAuth();

  // Estado rascunho do formulário de filtros (não dispara requisição a cada tecla)
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  // Filtros efetivamente aplicados na consulta à API
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [data, setData] = useState<PaginatedQuestionsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Estado de confirmação e execução de exclusão
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadQuestions = useCallback(
    async (signal?: AbortSignal) => {
      if (status !== 'authenticated') return;

      setIsLoading(true);
      setLoadError(null);

      try {
        const result = await fetchQuestions(
          {
            ...appliedFilters,
            page: currentPage,
            limit: pageSize,
          },
          signal
        );
        if (signal?.aborted) return;
        setData(result);
      } catch (error) {
        if (signal?.aborted) return;
        if (error instanceof ApiHttpError && error.status === 401) {
          await refreshSession();
          return;
        }
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar o banco de questões no momento.'
        );
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [status, appliedFilters, currentPage, refreshSession]
  );

  useEffect(() => {
    if (status !== 'authenticated') return;
    const controller = new AbortController();
    loadQuestions(controller.signal);
    return () => controller.abort();
  }, [status, loadQuestions]);

  const handleApplyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError(null);
    setActionSuccess(null);
    setCurrentPage(1);
    setAppliedFilters({ ...draftFilters });
  };

  const handleClearFilters = () => {
    setActionError(null);
    setActionSuccess(null);
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setCurrentPage(1);
  };

  const handleConfirmDelete = async (questionId: string) => {
    setActionError(null);
    setActionSuccess(null);
    setDeletingId(questionId);

    try {
      const response = await deleteQuestion(questionId);
      setConfirmDeleteId(null);
      setActionSuccess(response.message);
      await loadQuestions();
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 401) {
        await refreshSession();
        return;
      }
      setActionError(
        error instanceof Error
          ? error.message
          : 'Não foi possível excluir a questão selecionada.'
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] flex flex-col justify-between">
      <Navbar />

      <main className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8 flex-1">
        {status === 'loading' && (
          <div
            role="status"
            className="rounded-lg border border-neutral-800 bg-neutral-950 p-8 text-sm font-mono text-neutral-400"
          >
            Verificando sessão ativa junto ao servidor (GET /api/auth/me)...
          </div>
        )}

        {status === 'unauthenticated' && (
          <div className="mx-auto max-w-2xl rounded-lg border border-neutral-800 bg-neutral-950 p-6 sm:p-8 qf-animate-in">
            <p className="text-xs font-mono text-neutral-400">
              Acesso Restrito · Banco de Questões
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
              Autenticação necessária para acessar o Banco de Questões
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              Suas questões e alternativas são isoladas por usuário no PostgreSQL. Realize o
              login para consultar, filtrar ou cadastrar questões.
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

        {status === 'authenticated' && (
          <div className="space-y-8 qf-animate-in">
            {/* Cabeçalho da Página */}
            <div className="flex flex-col gap-4 border-b border-neutral-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-neutral-400">
                  Sprint 2 · Repositório Estruturado de Estudo
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Banco de Questões
                </h1>
                <p className="mt-1 text-sm text-neutral-400">
                  Consulte, filtre e gerencie suas questões persistidas com gabarito protegido por
                  padrão.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => loadQuestions()}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Atualizar
                </button>
                <Link
                  to="/questions/new"
                  className="inline-flex items-center gap-2 rounded-md bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
                >
                  <Plus className="h-4 w-4" />
                  Nova Questão
                </Link>
              </div>
            </div>

            {/* Painel de Busca e Filtros (Submissão explícita) */}
            <form
              onSubmit={handleApplyFilters}
              aria-label="Filtros do banco de questões"
              className="rounded-lg border border-neutral-800 bg-neutral-950 p-5"
            >
              <div className="mb-4 flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-neutral-400">
                <Filter className="h-3.5 w-3.5 text-[#2563EB]" />
                <span>Busca e Filtros Combináveis</span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="filter-search"
                    className="block text-xs font-medium text-neutral-300"
                  >
                    Busca textual
                  </label>
                  <div className="relative mt-1.5">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-neutral-500" />
                    <input
                      id="filter-search"
                      type="text"
                      value={draftFilters.search ?? ''}
                      onChange={(e) =>
                        setDraftFilters((prev) => ({ ...prev, search: e.target.value }))
                      }
                      placeholder="Buscar no enunciado, disciplina, assunto ou banca..."
                      className="w-full rounded-md border border-neutral-800 bg-[#0A0A0A] py-2 pl-9 pr-3 text-sm text-white placeholder-neutral-500 focus:border-[#2563EB] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="filter-subject"
                    className="block text-xs font-medium text-neutral-300"
                  >
                    Disciplina
                  </label>
                  <input
                    id="filter-subject"
                    type="text"
                    value={draftFilters.subject ?? ''}
                    onChange={(e) =>
                      setDraftFilters((prev) => ({ ...prev, subject: e.target.value }))
                    }
                    placeholder="Ex.: Direito Constitucional"
                    className="mt-1.5 w-full rounded-md border border-neutral-800 bg-[#0A0A0A] px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-[#2563EB] focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="filter-topic"
                    className="block text-xs font-medium text-neutral-300"
                  >
                    Assunto
                  </label>
                  <input
                    id="filter-topic"
                    type="text"
                    value={draftFilters.topic ?? ''}
                    onChange={(e) =>
                      setDraftFilters((prev) => ({ ...prev, topic: e.target.value }))
                    }
                    placeholder="Ex.: Controle de Constitucionalidade"
                    className="mt-1.5 w-full rounded-md border border-neutral-800 bg-[#0A0A0A] px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-[#2563EB] focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="filter-board"
                    className="block text-xs font-medium text-neutral-300"
                  >
                    Banca
                  </label>
                  <input
                    id="filter-board"
                    type="text"
                    value={draftFilters.board ?? ''}
                    onChange={(e) =>
                      setDraftFilters((prev) => ({ ...prev, board: e.target.value }))
                    }
                    placeholder="Ex.: CEBRASPE, FGV"
                    className="mt-1.5 w-full rounded-md border border-neutral-800 bg-[#0A0A0A] px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-[#2563EB] focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="filter-examTitle"
                    className="block text-xs font-medium text-neutral-300"
                  >
                    Concurso / Prova
                  </label>
                  <input
                    id="filter-examTitle"
                    type="text"
                    value={draftFilters.examTitle ?? ''}
                    onChange={(e) =>
                      setDraftFilters((prev) => ({ ...prev, examTitle: e.target.value }))
                    }
                    placeholder="Ex.: Analista Judiciário 2025"
                    className="mt-1.5 w-full rounded-md border border-neutral-800 bg-[#0A0A0A] px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-[#2563EB] focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="filter-type"
                    className="block text-xs font-medium text-neutral-300"
                  >
                    Tipo de questão
                  </label>
                  <select
                    id="filter-type"
                    value={draftFilters.type ?? ''}
                    onChange={(e) =>
                      setDraftFilters((prev) => ({
                        ...prev,
                        type: e.target.value as QuestionType | '',
                      }))
                    }
                    className="mt-1.5 w-full rounded-md border border-neutral-800 bg-[#0A0A0A] px-3 py-2 text-sm text-white focus:border-[#2563EB] focus:outline-none"
                  >
                    <option value="">Todos os tipos</option>
                    <option value="MULTIPLE_CHOICE">Múltipla Escolha</option>
                    <option value="TRUE_FALSE">Certo / Errado</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="filter-difficulty"
                    className="block text-xs font-medium text-neutral-300"
                  >
                    Dificuldade
                  </label>
                  <select
                    id="filter-difficulty"
                    value={draftFilters.difficulty ?? ''}
                    onChange={(e) =>
                      setDraftFilters((prev) => ({
                        ...prev,
                        difficulty: e.target.value as QuestionDifficulty | '',
                      }))
                    }
                    className="mt-1.5 w-full rounded-md border border-neutral-800 bg-[#0A0A0A] px-3 py-2 text-sm text-white focus:border-[#2563EB] focus:outline-none"
                  >
                    <option value="">Todas as dificuldades</option>
                    <option value="EASY">Fácil</option>
                    <option value="MEDIUM">Média</option>
                    <option value="HARD">Difícil</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-neutral-900 pt-4">
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="rounded-md border border-neutral-800 px-3.5 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-white focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                >
                  Limpar filtros
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                >
                  Aplicar filtros
                </button>
              </div>
            </form>

            {/* Mensagens de feedback de ação (exclusão / erro) */}
            {actionError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-md border border-red-900/60 bg-red-950/20 p-4 text-xs text-red-200"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <span>{actionError}</span>
              </div>
            )}

            {actionSuccess && (
              <div
                role="status"
                className="rounded-md border border-neutral-700 bg-neutral-900/60 p-3.5 text-xs text-neutral-200"
              >
                {actionSuccess}
              </div>
            )}

            {/* Estado de Carregamento */}
            {isLoading && (
              <div
                role="status"
                className="rounded-lg border border-neutral-800 bg-neutral-950 p-8 text-center text-sm font-mono text-neutral-400"
              >
                Carregando questões de GET /api/questions...
              </div>
            )}

            {/* Estado de Erro / Indisponibilidade */}
            {!isLoading && loadError && (
              <div
                role="alert"
                className="rounded-lg border border-red-900/60 bg-red-950/20 p-6 text-sm text-red-200"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                  <div className="space-y-2">
                    <p className="font-semibold text-white">
                      Falha ao consultar o banco de questões
                    </p>
                    <p className="text-xs text-red-200/90">{loadError}</p>
                    <button
                      type="button"
                      onClick={() => loadQuestions()}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-red-800/80 bg-neutral-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-900 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                    >
                      Tentar novamente
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Estado Vazio */}
            {!isLoading && !loadError && data && data.items.length === 0 && (
              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-10 text-center">
                <BookOpen className="mx-auto h-8 w-8 text-neutral-500" />
                <h2 className="mt-3 text-lg font-semibold text-white">
                  Nenhuma questão encontrada
                </h2>
                <p className="mx-auto mt-1 max-w-md text-xs text-neutral-400">
                  Não há questões registradas para os critérios informados. Cadastre uma nova
                  questão ou limpe os filtros de busca.
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <Link
                    to="/questions/new"
                    className="inline-flex items-center gap-2 rounded-md bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                  >
                    <Plus className="h-4 w-4" />
                    Cadastrar primeira questão
                  </Link>
                </div>
              </div>
            )}

            {/* Lista de Questões */}
            {!isLoading && !loadError && data && data.items.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs font-mono text-neutral-400">
                  <span>
                    Total: <strong className="text-white">{data.total}</strong>{' '}
                    {data.total === 1 ? 'questão encontrada' : 'questões encontradas'}
                  </span>
                  <span>
                    Página <strong className="text-white">{data.currentPage}</strong> de{' '}
                    <strong className="text-white">{data.totalPages}</strong>
                  </span>
                </div>

                <ul className="space-y-4" aria-label="Lista de questões">
                  {data.items.map((question) => (
                    <li
                      key={question.id}
                      className="rounded-lg border border-neutral-800 bg-neutral-950 p-5 transition-colors hover:border-neutral-700"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-900 pb-3 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-white">{question.subject}</span>
                          {question.topic && (
                            <span className="text-neutral-400">· {question.topic}</span>
                          )}
                          {question.board && (
                            <span className="font-mono text-neutral-400">
                              [{question.board}
                              {question.year ? ` ${question.year}` : ''}]
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-neutral-400">
                          <span>{TYPE_LABELS[question.type]}</span>
                          {question.difficulty && (
                            <span>· Dificuldade: {DIFFICULTY_LABELS[question.difficulty]}</span>
                          )}
                          <span>
                            · {question.hasAnswerKey ? 'Gabarito oculto' : 'Sem gabarito'}
                          </span>
                        </div>
                      </div>

                      <p className="mt-3 line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-neutral-200">
                        {question.statement}
                      </p>

                      {question.alternatives.length > 0 && (
                        <p className="mt-2 text-xs font-mono text-neutral-500">
                          {question.alternatives.length} alternativas cadastradas
                        </p>
                      )}

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-900 pt-3">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/questions/${question.id}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-[#0A0A0A] px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:bg-neutral-900 hover:text-white focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                          >
                            <Eye className="h-3.5 w-3.5 text-[#2563EB]" />
                            Visualizar
                          </Link>
                          <Link
                            to={`/questions/${question.id}/edit`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-[#0A0A0A] px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-white focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            Editar
                          </Link>
                        </div>

                        {confirmDeleteId === question.id ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-neutral-300">
                              Confirmar exclusão permanente?
                            </span>
                            <button
                              type="button"
                              disabled={deletingId === question.id}
                              onClick={() => handleConfirmDelete(question.id)}
                              className="rounded-md bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                            >
                              {deletingId === question.id
                                ? 'Excluindo...'
                                : 'Confirmar exclusão'}
                            </button>
                            <button
                              type="button"
                              disabled={deletingId === question.id}
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-md border border-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-900 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(question.id)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-[#0A0A0A] px-3 py-1.5 text-xs font-medium text-neutral-400 transition-colors hover:border-red-900/60 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Excluir
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>

                {/* Controles de Paginação Real */}
                <nav
                  aria-label="Paginação do banco de questões"
                  className="flex items-center justify-between border-t border-neutral-800 pt-4"
                >
                  <button
                    type="button"
                    disabled={data.currentPage <= 1 || isLoading}
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs font-medium text-neutral-200 transition-colors hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Página anterior
                  </button>

                  <span className="text-xs font-mono text-neutral-400">
                    Página {data.currentPage} de {data.totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={data.currentPage >= data.totalPages || isLoading}
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(data.totalPages, prev + 1))
                    }
                    className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs font-medium text-neutral-200 transition-colors hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                  >
                    Próxima página
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </nav>
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
