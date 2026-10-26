import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  HelpCircle,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Navbar } from '../components/Navbar.tsx';
import { Footer } from '../components/Footer.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import {
  ApiHttpError,
  deleteSimulation,
  listSimulations,
} from '../services/api.ts';
import type {
  PaginatedSimulationsResponse,
  SimulationStatus,
  SimulationSummaryDTO,
} from '../types/index.ts';

const STATUS_LABELS: Record<SimulationStatus, string> = {
  CREATED: 'Não iniciado',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluído',
  EXPIRED: 'Expirado',
  ABANDONED: 'Abandonado',
};

const STATUS_BADGE_CLASSES: Record<SimulationStatus, string> = {
  CREATED: 'border-blue-900/60 bg-blue-950/30 text-blue-300',
  IN_PROGRESS: 'border-amber-900/60 bg-amber-950/30 text-amber-300',
  COMPLETED: 'border-emerald-900/60 bg-emerald-950/30 text-emerald-300',
  EXPIRED: 'border-orange-900/60 bg-orange-950/30 text-orange-300',
  ABANDONED: 'border-neutral-800 bg-neutral-900/60 text-neutral-400',
};

function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

function formatTimeLimit(seconds: number | null): string {
  if (!seconds) return 'Livre';
  const mins = Math.round(seconds / 60);
  return `${mins} min`;
}

export function SimulationsListPage() {
  const { status: authStatus, sessionCheckError, refreshSession } = useAuth();

  const [selectedStatus, setSelectedStatus] = useState<SimulationStatus | ''>('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [data, setData] = useState<PaginatedSimulationsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Estados de confirmação e exclusão
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadSimulationsList = useCallback(
    async (signal?: AbortSignal, pageOverride?: number) => {
      if (authStatus !== 'authenticated') return;

      setIsLoading(true);
      setLoadError(null);

      const targetPage = pageOverride ?? currentPage;

      try {
        const offset = (targetPage - 1) * pageSize;
        const result = await listSimulations({
          status: selectedStatus || undefined,
          limit: pageSize,
          offset,
        });

        if (signal?.aborted) return;

        // Se a página retornou vazia mas ainda existem itens no total (ex.: exclusões externas ou último item excluído)
        if (result.simulations.length === 0 && result.total > 0 && targetPage > 1) {
          const adjustedPage = Math.max(1, Math.ceil(result.total / pageSize));
          setCurrentPage(adjustedPage);
          return;
        }

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
            : 'Não foi possível carregar a lista de simulados.'
        );
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [authStatus, selectedStatus, currentPage, refreshSession]
  );

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    const controller = new AbortController();
    loadSimulationsList(controller.signal);
    return () => controller.abort();
  }, [authStatus, loadSimulationsList]);

  const handleStatusFilterChange = (newStatus: SimulationStatus | '') => {
    setSelectedStatus(newStatus);
    setCurrentPage(1);
    setActionError(null);
    setActionSuccess(null);
  };

  const handleConfirmDelete = async (simulationId: string) => {
    setActionError(null);
    setActionSuccess(null);
    setDeletingId(simulationId);

    try {
      const response = await deleteSimulation(simulationId);
      setConfirmDeleteId(null);
      setActionSuccess(response.message);

      // Se este era o único item na página atual e não estamos na primeira página,
      // recuamos para a página anterior. A alteração de `currentPage` ativará o efeito
      // de carregamento com a página anterior, evitando requisições redundantes.
      const isOnlyItemOnCurrentPage = (data?.simulations.length ?? 0) <= 1 && currentPage > 1;
      if (isOnlyItemOnCurrentPage) {
        setCurrentPage((prev) => Math.max(1, prev - 1));
      } else {
        await loadSimulationsList();
      }
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 401) {
        await refreshSession();
        return;
      }
      setActionError(
        error instanceof Error
          ? error.message
          : 'Não foi possível excluir o simulado selecionado.'
      );
    } finally {
      setDeletingId(null);
    }
  };

  const totalSimulations = data?.total ?? 0;
  const totalPages = Math.ceil(totalSimulations / pageSize) || 1;
  const hasPreviousPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] flex flex-col justify-between">
      <Navbar />

      <main className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8 flex-1">
        {authStatus === 'loading' && (
          <div
            role="status"
            className="rounded-lg border border-neutral-800 bg-neutral-950 p-8 text-sm font-mono text-neutral-400"
          >
            Verificando sessão ativa junto ao servidor (GET /api/auth/me)...
          </div>
        )}

        {authStatus === 'unauthenticated' && (
          <div className="mx-auto max-w-2xl rounded-lg border border-neutral-800 bg-neutral-950 p-6 sm:p-8 qf-animate-in">
            <p className="text-xs font-mono text-neutral-400">
              Acesso Restrito · Motor de Simulados
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
              Autenticação necessária para acessar seus simulados
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              Seus simulados, tentativas e pontuações são isolados e persistidos no
              PostgreSQL. Realize o login para consultar o histórico ou realizar provas.
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
                className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-neutral-200 transition-colors hover:bg-neutral-900 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
              >
                Criar conta
              </Link>
            </div>
          </div>
        )}

        {authStatus === 'authenticated' && (
          <div className="space-y-6 qf-animate-in">
            {/* Cabeçalho da página */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-neutral-400">
                  QuestForge · Motor de Simulados
                </p>
                <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  Meus Simulados
                </h1>
                <p className="mt-1 text-sm text-neutral-400">
                  Histórico de provas, métricas de desempenho e simulados em andamento.
                </p>
              </div>

              {/* Link para novo simulado (Sprint 6.7-C) */}
              <div className="flex items-center gap-3">
                <Link
                  to="/simulations/new"
                  className="inline-flex items-center gap-2 rounded-md bg-[#2563EB] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                >
                  <Plus className="h-4 w-4" />
                  Novo Simulado
                </Link>
              </div>
            </div>

            {/* Banners de Sucesso ou Erro de Ação */}
            {actionSuccess && (
              <div
                role="status"
                className="flex items-center justify-between rounded-md border border-emerald-900/60 bg-emerald-950/20 p-4 text-sm text-emerald-200"
              >
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>{actionSuccess}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActionSuccess(null)}
                  className="text-xs text-neutral-400 hover:text-white"
                >
                  Fechar
                </button>
              </div>
            )}

            {actionError && (
              <div
                role="alert"
                className="flex items-center justify-between rounded-md border border-red-900/60 bg-red-950/20 p-4 text-sm text-red-200"
              >
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                  <span>{actionError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActionError(null)}
                  className="text-xs text-neutral-400 hover:text-white"
                >
                  Fechar
                </button>
              </div>
            )}

            {/* Barra de Filtros por Status */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-neutral-400 inline-flex items-center gap-1.5 mr-1">
                  <Filter className="h-3.5 w-3.5" />
                  Filtrar por status:
                </span>
                {(
                  [
                    ['', 'Todos'],
                    ['CREATED', 'Não iniciado'],
                    ['IN_PROGRESS', 'Em andamento'],
                    ['COMPLETED', 'Concluído'],
                    ['EXPIRED', 'Expirado'],
                    ['ABANDONED', 'Abandonado'],
                  ] as const
                ).map(([statusKey, label]) => {
                  const isActive = selectedStatus === statusKey;
                  return (
                    <button
                      key={statusKey || 'ALL'}
                      type="button"
                      onClick={() => handleStatusFilterChange(statusKey as SimulationStatus | '')}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[#2563EB] ${
                        isActive
                          ? 'bg-[#2563EB] text-white'
                          : 'border border-neutral-800 bg-neutral-900/50 text-neutral-300 hover:bg-neutral-900 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => loadSimulationsList()}
                disabled={isLoading}
                title="Recarregar lista"
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900/50 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-900 hover:text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                Atualizar
              </button>
            </div>

            {/* Estado de Carregamento */}
            {isLoading && (
              <div
                role="status"
                className="flex items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 p-12 text-sm font-mono text-neutral-400"
              >
                <RefreshCw className="mr-2.5 h-4 w-4 animate-spin text-[#2563EB]" />
                Carregando histórico de simulados...
              </div>
            )}

            {/* Estado de Erro de Carga */}
            {!isLoading && loadError && (
              <div
                role="alert"
                className="rounded-lg border border-red-900/60 bg-red-950/20 p-6 text-sm text-red-200"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                  <div className="space-y-2">
                    <p className="font-semibold text-white">
                      Não foi possível carregar os simulados
                    </p>
                    <p className="text-xs text-red-300">{loadError}</p>
                    <button
                      type="button"
                      onClick={() => loadSimulationsList()}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[#2563EB] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1D4ED8]"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Tentar novamente
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Lista Vazia */}
            {!isLoading && !loadError && data && data.simulations.length === 0 && (
              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-12 text-center">
                <HelpCircle className="mx-auto h-8 w-8 text-neutral-500" />
                <h3 className="mt-3 text-base font-semibold text-white">
                  Nenhum simulado encontrado
                </h3>
                <p className="mt-1 text-sm text-neutral-400 max-w-md mx-auto">
                  {selectedStatus
                    ? `Não há simulados com o status "${STATUS_LABELS[selectedStatus]}". Experimente selecionar outro filtro.`
                    : 'Você ainda não criou nenhum simulado. Crie simulados personalizados com filtros por concurso, disciplina e banca.'}
                </p>
              </div>
            )}

            {/* Tabela de Simulados */}
            {!isLoading && !loadError && data && data.simulations.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-neutral-800 bg-neutral-900/50 text-xs font-mono uppercase text-neutral-400">
                      <tr>
                        <th scope="col" className="px-5 py-3.5 font-semibold">
                          Simulado
                        </th>
                        <th scope="col" className="px-5 py-3.5 font-semibold">
                          Status
                        </th>
                        <th scope="col" className="px-5 py-3.5 font-semibold">
                          Questões
                        </th>
                        <th scope="col" className="px-5 py-3.5 font-semibold">
                          Tempo Limite
                        </th>
                        <th scope="col" className="px-5 py-3.5 font-semibold">
                          Desempenho
                        </th>
                        <th scope="col" className="px-5 py-3.5 font-semibold">
                          Data de Criação
                        </th>
                        <th scope="col" className="px-5 py-3.5 text-right font-semibold">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {data.simulations.map((sim: SimulationSummaryDTO) => {
                        const isFinished = sim.status === 'COMPLETED' || sim.status === 'EXPIRED';
                        const isDeleting = deletingId === sim.id;
                        const isConfirming = confirmDeleteId === sim.id;

                        return (
                          <tr
                            key={sim.id}
                            className="transition-colors hover:bg-neutral-900/30"
                          >
                            {/* Título e ID */}
                            <td className="px-5 py-4">
                              <div className="font-semibold text-white">
                                {sim.title?.trim() ? sim.title : 'Simulado sem título'}
                              </div>
                              <div className="text-xs font-mono text-neutral-500 mt-0.5">
                                ID: {sim.id.slice(0, 8)}...
                              </div>
                            </td>

                            {/* Badge de Status */}
                            <td className="px-5 py-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium ${
                                  STATUS_BADGE_CLASSES[sim.status]
                                }`}
                              >
                                {STATUS_LABELS[sim.status]}
                              </span>
                            </td>

                            {/* Quantidade de Questões */}
                            <td className="px-5 py-4 whitespace-nowrap text-neutral-300 font-mono text-xs">
                              {sim.totalQuestions} questões
                            </td>

                            {/* Tempo Limite */}
                            <td className="px-5 py-4 whitespace-nowrap text-neutral-300 text-xs">
                              <span className="inline-flex items-center gap-1 font-mono">
                                <Clock className="h-3.5 w-3.5 text-neutral-500" />
                                {formatTimeLimit(sim.timeLimitSeconds)}
                              </span>
                            </td>

                            {/* Desempenho / Resultado */}
                            <td className="px-5 py-4 whitespace-nowrap text-xs">
                              {isFinished && sim.scorePercentage !== null ? (
                                <div className="space-y-0.5">
                                  <div className="font-semibold text-white flex items-center gap-1.5 font-mono">
                                    <Award className="h-3.5 w-3.5 text-emerald-400" />
                                    {sim.scorePercentage.toFixed(1)}% de aproveitamento
                                  </div>
                                  <div className="text-xs font-mono text-neutral-400">
                                    {sim.correctCount ?? 0} acertos · {sim.wrongCount ?? 0} erros ·{' '}
                                    {sim.unansweredCount ?? 0} em branco
                                  </div>
                                </div>
                              ) : sim.status === 'IN_PROGRESS' ? (
                                <span className="text-xs text-amber-400/90 font-mono inline-flex items-center gap-1">
                                  <Activity className="h-3 w-3" />
                                  Prova em andamento
                                </span>
                              ) : (
                                <span className="text-xs text-neutral-500 font-mono">—</span>
                              )}
                            </td>

                            {/* Data de Criação */}
                            <td className="px-5 py-4 whitespace-nowrap text-xs text-neutral-400 font-mono">
                              {formatDate(sim.createdAt)}
                            </td>

                            {/* Ações Seguras por Status */}
                            <td className="px-5 py-4 whitespace-nowrap text-right text-xs">
                              {isConfirming ? (
                                <div
                                  role="group"
                                  aria-label={`Confirmação de exclusão do simulado: ${sim.title?.trim() ? sim.title : 'sem título'}`}
                                  className="inline-flex items-center gap-2"
                                >
                                  <span className="text-xs text-neutral-400" aria-hidden="true">
                                    Excluir?
                                  </span>
                                  <button
                                    type="button"
                                    disabled={isDeleting}
                                    onClick={() => handleConfirmDelete(sim.id)}
                                    title="Confirmar exclusão permanente"
                                    className="rounded bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-red-400"
                                  >
                                    {isDeleting ? 'Excluindo...' : 'Confirmar'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isDeleting}
                                    onClick={() => setConfirmDeleteId(null)}
                                    title="Cancelar exclusão"
                                    className="rounded border border-neutral-800 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-900 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              ) : (
                                <div className="inline-flex items-center justify-end gap-2">
                                  {/* Indicador de status informativo (rotas de execução e resultado serão implementadas em 6.7-C e 6.7-D) */}
                                  {sim.status === 'CREATED' && (
                                    <span
                                      title="A execução do simulado será habilitada na etapa seguinte"
                                      className="rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-400 cursor-not-allowed"
                                    >
                                      Pronto para iniciar
                                    </span>
                                  )}

                                  {sim.status === 'IN_PROGRESS' && (
                                    <span
                                      title="A retomada do simulado em andamento será habilitada na etapa seguinte"
                                      className="rounded-md border border-amber-900/60 bg-amber-950/20 px-2.5 py-1 text-xs text-amber-300 cursor-not-allowed"
                                    >
                                      Continuar (Em breve)
                                    </span>
                                  )}

                                  {isFinished && (
                                    <Link
                                      to={`/simulations/${sim.id}/results`}
                                      title="Consultar resultados e gabarito oficial com revisão"
                                      className="rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs font-semibold text-blue-400 hover:border-neutral-700 hover:text-blue-300 transition-colors"
                                    >
                                      Ver Resultado
                                    </Link>
                                  )}

                                  {/* Botão de Exclusão Segura */}
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(sim.id)}
                                    title="Excluir simulado permanentemente"
                                    aria-label={`Excluir simulado permanentemente: ${sim.title?.trim() ? sim.title : 'sem título'}`}
                                    className="inline-flex items-center gap-1 rounded-md border border-neutral-800 bg-neutral-950 p-1.5 text-neutral-400 hover:border-red-900/60 hover:text-red-400 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    <span className="sr-only">Excluir</span>
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Paginação */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-neutral-800 px-5 py-3 text-xs text-neutral-400">
                    <div>
                      Mostrando página <span className="font-semibold text-white">{currentPage}</span> de{' '}
                      <span className="font-semibold text-white">{totalPages}</span> ({totalSimulations} simulados no total)
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!hasPreviousPage || isLoading}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="inline-flex items-center gap-1 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Anterior
                      </button>

                      <button
                        type="button"
                        disabled={!hasNextPage || isLoading}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="inline-flex items-center gap-1 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                      >
                        Próxima
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
