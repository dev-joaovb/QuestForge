import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Plus, RefreshCw } from 'lucide-react';
import { Navbar } from '../components/Navbar.tsx';
import { Footer } from '../components/Footer.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import { ApiHttpError, getDashboardSummary } from '../services/api.ts';
import type { DashboardSummaryDTO } from '../types/index.ts';
import { DashboardMetricCards } from '../components/dashboard/DashboardMetricCards.tsx';
import { DashboardStreakBanner } from '../components/dashboard/DashboardStreakBanner.tsx';
import { PerformanceTrendChart } from '../components/dashboard/PerformanceTrendChart.tsx';
import { RecentActivitiesList } from '../components/dashboard/RecentActivitiesList.tsx';

export function DashboardPage() {
  const { status: authStatus, user, refreshSession } = useAuth();
  const [summary, setSummary] = useState<DashboardSummaryDTO | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await getDashboardSummary();
      setSummary(data);
    } catch (err) {
      if (err instanceof ApiHttpError && err.status === 401) {
        await refreshSession();
        setErrorMessage('Sua sessão expirou. Por favor, autentique-se novamente.');
      } else if (err instanceof Error) {
        setErrorMessage(err.message || 'Erro ao carregar dados do dashboard.');
      } else {
        setErrorMessage('Erro inesperado ao consultar indicadores do dashboard.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [refreshSession]);

  useEffect(() => {
    if (authStatus === 'authenticated') {
      void fetchDashboardData();
    } else if (authStatus === 'unauthenticated') {
      setIsLoading(false);
    }
  }, [authStatus, fetchDashboardData]);

  const firstName = user?.name ? user.name.split(' ')[0] : 'Estudante';

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#0A0A0A] text-[#FAFAFA]">
      <Navbar />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {authStatus === 'loading' && (
          <div
            role="status"
            className="rounded-lg border border-neutral-800 bg-neutral-950 p-8 text-sm font-mono text-neutral-400"
          >
            Verificando sessão ativa junto ao servidor...
          </div>
        )}

        {authStatus === 'unauthenticated' && (
          <div className="mx-auto max-w-2xl rounded-lg border border-neutral-800 bg-neutral-950 p-6 sm:p-8">
            <p className="text-xs font-mono text-neutral-400">
              Acesso Restrito · Painel do Estudante
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
              Autenticação necessária para acessar o Dashboard
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              Seus indicadores de desempenho, métricas de precisão e sequência de estudos (streak)
              são calculados e persistidos no banco de dados. Realize o login para consultar seu progresso.
            </p>

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
          <div className="space-y-6">
            {/* Header com boas-vindas e CTA Novo Simulado */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-neutral-400">
                  Visão Geral do Aluno
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Dashboard de Estudos
                </h1>
                <p className="mt-1 text-sm text-neutral-400">
                  Bem-vindo, {firstName}. Acompanhe seu volume de simulados, consistência e taxa de acertos.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  to="/simulations/new"
                  className="inline-flex items-center gap-2 rounded-md bg-[#2563EB] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Novo Simulado</span>
                </Link>
              </div>
            </div>

            {/* Estado de Carregamento (Skeleton com suporte a prefers-reduced-motion: ACH-03) */}
            {isLoading && (
              <div role="status" aria-label="Carregando dados do dashboard" className="space-y-6">
                {/* Skeleton Métricas */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-28 motion-safe:animate-pulse rounded-lg border border-neutral-800 bg-neutral-900/30"
                    />
                  ))}
                </div>

                {/* Skeleton Streak */}
                <div className="h-24 w-full motion-safe:animate-pulse rounded-lg border border-neutral-800 bg-neutral-900/30" />

                {/* Skeleton Gráfico e Atividades */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div className="h-72 motion-safe:animate-pulse rounded-lg border border-neutral-800 bg-neutral-900/30" />
                  <div className="h-72 motion-safe:animate-pulse rounded-lg border border-neutral-800 bg-neutral-900/30" />
                </div>
              </div>
            )}

            {/* Estado de Erro */}
            {!isLoading && errorMessage && (
              <div
                role="alert"
                className="flex flex-col gap-4 rounded-lg border border-red-900/60 bg-red-950/20 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                  <div>
                    <h3 className="text-sm font-semibold text-red-200">
                      Não foi possível carregar os dados do dashboard
                    </h3>
                    <p className="mt-0.5 text-xs text-red-300/90">{errorMessage}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchDashboardData()}
                  className="inline-flex items-center gap-2 rounded-md border border-red-800 bg-red-950/40 px-3.5 py-2 text-xs font-medium text-red-200 transition-colors hover:bg-red-900/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Tentar novamente</span>
                </button>
              </div>
            )}

            {/* Conteúdo Carregado com Sucesso */}
            {!isLoading && !errorMessage && summary && (
              <>
                {/* 1. Cards de Métricas Principais */}
                <DashboardMetricCards summary={summary} />

                {/* 2. Banner de Streak */}
                <DashboardStreakBanner
                  currentStreak={summary.currentStreak}
                  longestStreak={summary.longestStreak}
                  lastActivityDate={summary.lastActivityDate}
                />

                {/* 3. Seção em Grid: Gráfico de Evolução + Atividades Recentes */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <PerformanceTrendChart evolution={summary.recentSimulationsEvolution} />
                  <RecentActivitiesList activities={summary.recentActivities} />
                </div>

                {/* 4. Orientação quando não há simulados concluídos (sem invalidar streak ou atividades existentes) */}
                {summary.completedSimulationsCount === 0 && (
                  <div
                    data-testid="dashboard-empty-state"
                    className="rounded-lg border border-neutral-800 bg-neutral-900/20 p-6 sm:p-8 text-center"
                  >
                    <p className="text-xs font-mono uppercase tracking-wider text-neutral-400">
                      Primeiros Passos com Simulados
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-white">
                      Nenhum simulado concluído ainda
                    </h3>
                    <p className="mx-auto mt-2 max-w-xl text-sm text-neutral-400">
                      Seu histórico de atividades avulsas e sequência de dias continuam ativos. Assim que você
                      concluir seu primeiro simulado completo, o gráfico de evolução consolidará sua curva de aproveitamento.
                    </p>
                    <div className="mt-5">
                      <Link
                        to="/simulations/new"
                        className="inline-flex items-center gap-2 rounded-md bg-[#2563EB] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Criar Primeiro Simulado</span>
                      </Link>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
