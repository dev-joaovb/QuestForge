/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Award,
  AlertCircle,
  RotateCcw,
  ArrowLeft,
  BookOpen,
  Filter,
  Plus,
  PlayCircle,
  AlertTriangle,
  FileCheck,
  Check,
  X,
  MinusCircle,
} from 'lucide-react';
import { Navbar } from '../components/Navbar.tsx';
import { Footer } from '../components/Footer.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import { getSimulation, ApiHttpError } from '../services/api.ts';
import type {
  SimulationDetailDTO,
  SimulationReviewQuestionDTO,
  SimulationPublicQuestionDTO,
} from '../types/index.ts';

type FilterType = 'all' | 'correct' | 'wrong' | 'unanswered' | 'annulled';

export function SimulationResultPage() {
  const { id } = useParams<{ id: string }>();
  const { status: authStatus } = useAuth();

  const [simulation, setSimulation] = useState<SimulationDetailDTO | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  const loadSimulationData = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await getSimulation(id);
      setSimulation(data);
    } catch (err) {
      if (err instanceof ApiHttpError) {
        if (err.status === 404) {
          setLoadError('Simulado não encontrado.');
        } else if (err.status === 403) {
          setLoadError('Você não tem permissão para visualizar este simulado.');
        } else {
          setLoadError(err.message || 'Erro ao carregar os resultados do simulado.');
        }
      } else {
        setLoadError('Falha de conexão com o servidor.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (authStatus === 'authenticated' && id) {
      loadSimulationData();
    } else if (authStatus === 'unauthenticated') {
      setIsLoading(false);
    }
  }, [authStatus, id, loadSimulationData]);

  // Formatação de data
  const formatDate = (isoString: string | null | undefined): string => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  // Formatação de duração
  const formatDuration = (totalSeconds: number | null | undefined): string => {
    if (totalSeconds === null || totalSeconds === undefined || totalSeconds < 0) {
      return '—';
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
    }
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  };

  // Type guard para questão com revisão
  const isReviewQuestion = (
    q: SimulationPublicQuestionDTO | SimulationReviewQuestionDTO
  ): q is SimulationReviewQuestionDTO => {
    return 'answerKeySnapshot' in q;
  };

  // Cálculos de contagem para abas de filtro
  const questionsList = useMemo(() => {
    return simulation?.questions ?? [];
  }, [simulation]);

  const counts = useMemo(() => {
    let correct = 0;
    let wrong = 0;
    let unanswered = 0;
    let annulled = 0;

    questionsList.forEach((q) => {
      if (isReviewQuestion(q)) {
        if (q.isAnnulledSnapshot) {
          annulled++;
        }
        if (q.isCorrect === true) {
          correct++;
        } else if (
          q.isCorrect === false &&
          !q.isAnnulledSnapshot &&
          (q.currentAttempt?.selectedAlternativeId || q.currentAttempt?.selectedLetter)
        ) {
          wrong++;
        } else if (
          !q.isAnnulledSnapshot &&
          !q.currentAttempt?.selectedAlternativeId &&
          !q.currentAttempt?.selectedLetter
        ) {
          unanswered++;
        }
      }
    });

    return { correct, wrong, unanswered, annulled };
  }, [questionsList]);

  // Lista filtrada de questões
  const filteredQuestions = useMemo(() => {
    if (activeFilter === 'all') return questionsList;

    return questionsList.filter((q) => {
      if (!isReviewQuestion(q)) return false;

      if (activeFilter === 'correct') {
        return q.isCorrect === true;
      }
      if (activeFilter === 'wrong') {
        return (
          q.isCorrect === false &&
          !q.isAnnulledSnapshot &&
          (q.currentAttempt?.selectedAlternativeId || q.currentAttempt?.selectedLetter)
        );
      }
      if (activeFilter === 'unanswered') {
        return (
          !q.isAnnulledSnapshot &&
          !q.currentAttempt?.selectedAlternativeId &&
          !q.currentAttempt?.selectedLetter
        );
      }
      if (activeFilter === 'annulled') {
        return q.isAnnulledSnapshot === true;
      }
      return true;
    });
  }, [questionsList, activeFilter]);

  // 1. Estado não autenticado
  if (authStatus === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] flex flex-col justify-between">
        <Navbar />
        <main className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6 lg:px-8 flex-1">
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-6 sm:p-8">
            <p className="text-xs font-mono text-neutral-400">
              Acesso Restrito · Motor de Simulados
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
              Autenticação necessária para consultar os resultados
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              Os resultados oficiais, notas e gabaritos pedagógicos são vinculados à
              sua conta no QuestForge e protegidos contra acessos não autorizados.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                to="/login"
                className="rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Ir para o Login
              </Link>
              <Link
                to="/register"
                className="rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-neutral-200 transition-colors hover:bg-neutral-800"
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

  // 2. Estado de carregamento
  if (isLoading || authStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] flex flex-col justify-between">
        <Navbar />
        <main className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 lg:px-8 flex-1 flex flex-col items-center justify-center">
          <div
            role="status"
            className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-6 py-4 text-sm font-mono text-neutral-300"
          >
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <span>Carregando resultados e gabarito oficial...</span>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // 3. Estado de erro no carregamento
  if (loadError || !simulation) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] flex flex-col justify-between">
        <Navbar />
        <main className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6 lg:px-8 flex-1">
          <div
            role="alert"
            className="rounded-lg border border-red-900/60 bg-red-950/20 p-6 text-red-200"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
              <div>
                <h1 className="text-base font-bold text-red-100">
                  Não foi possível carregar os resultados
                </h1>
                <p className="mt-1 text-xs text-red-300">
                  {loadError || 'O simulado solicitado não foi encontrado.'}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={loadSimulationData}
                    className="flex items-center gap-1.5 rounded-md bg-red-900/60 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-800/80 transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Tentar Novamente
                  </button>
                  <Link
                    to="/simulations"
                    className="rounded-md border border-neutral-800 bg-neutral-900 px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
                  >
                    Voltar para Meus Simulados
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // 4. Proteção contra vazamento de gabarito para simulados em andamento ou não iniciados
  const isSimulationInProgressOrCreated =
    simulation.status === 'IN_PROGRESS' || simulation.status === 'CREATED';

  if (isSimulationInProgressOrCreated) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] flex flex-col justify-between">
        <Navbar />
        <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 lg:px-8 flex-1">
          <div
            role="alert"
            className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-8 text-amber-200"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <h1 className="text-lg font-bold text-amber-100">
                  Simulado ainda não concluído
                </h1>
                <p className="mt-2 text-sm text-amber-300/90 leading-relaxed">
                  Este simulado está em andamento (ou ainda não foi iniciado). As
                  notas oficiais e a revisão pedagógica questão a questão
                  ficam disponíveis apenas após o encerramento da prova,
                  garantindo a integridade do seu teste.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link
                    to={`/simulations/${simulation.id}`}
                    className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-amber-500 transition-colors shadow-sm"
                  >
                    <PlayCircle className="h-4 w-4" />
                    Ir para o Simulado em Andamento
                  </Link>
                  <Link
                    to="/simulations"
                    className="rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-xs font-semibold text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
                  >
                    Voltar para Meus Simulados
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // 5. Estado Abandonado
  if (simulation.status === 'ABANDONED') {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] flex flex-col justify-between">
        <Navbar />
        <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 lg:px-8 flex-1">
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-8 text-neutral-300">
            <div className="flex items-start gap-3">
              <MinusCircle className="h-6 w-6 shrink-0 text-neutral-400 mt-0.5" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs font-semibold text-neutral-300">
                    Abandonado
                  </span>
                </div>
                <h1 className="mt-3 text-xl font-bold text-white">
                  {simulation.title || 'Simulado sem título'}
                </h1>
                <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
                  Este simulado foi abandonado antes da sua conclusão. Por essa razão, a
                  pontuação oficial não foi computada e o gabarito pedagógico não foi
                  gerado para esta tentativa.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link
                    to="/simulations/new"
                    className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Criar Novo Simulado
                  </Link>
                  <Link
                    to="/simulations"
                    className="rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2 text-xs font-semibold text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
                  >
                    Voltar para Meus Simulados
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // 6. Estado Concluído ou Expirado: Exibição completa de Resultados e Revisão
  const isExpired = simulation.status === 'EXPIRED';

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] flex flex-col justify-between">
      <Navbar />

      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8 flex-1 space-y-8">
        {/* Breadcrumb e Ações Superiores */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-2 text-xs font-mono text-neutral-400">
            <Link
              to="/simulations"
              className="inline-flex items-center gap-1 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Meus Simulados</span>
            </Link>
            <span>/</span>
            <span className="text-neutral-200">Resultado e Gabarito</span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/simulations/new"
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo Simulado
            </Link>
            <Link
              to="/simulations"
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
            >
              Voltar
            </Link>
          </div>
        </div>

        {/* Cabeçalho do Resultado */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-6 sm:p-8">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    isExpired
                      ? 'bg-amber-950/80 border border-amber-800 text-amber-300'
                      : 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
                  }`}
                >
                  <FileCheck className="h-3 w-3" />
                  {isExpired ? 'Tempo Expirado' : 'Concluído'}
                </span>
                <span className="text-xs font-mono text-neutral-400">
                  ID: {simulation.id.slice(0, 8)}...
                </span>
              </div>

              <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-white">
                {simulation.title || 'Simulado sem título'}
              </h1>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-400 font-mono">
                <span>Iniciado: {formatDate(simulation.startedAt)}</span>
                <span>•</span>
                <span>Finalizado: {formatDate(simulation.finishedAt)}</span>
              </div>
            </div>

            {/* Score Principal */}
            <div className="flex flex-col items-start md:items-end justify-center rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 min-w-[160px]">
              <span className="text-xs uppercase font-mono tracking-wider text-neutral-400">
                Aproveitamento Oficial
              </span>
              <p className="mt-1 text-3xl font-extrabold text-blue-400">
                {simulation.scorePercentage !== null && simulation.scorePercentage !== undefined
                  ? `${simulation.scorePercentage.toFixed(1)}%`
                  : '—'}
              </p>
            </div>
          </div>

          {/* Cards de Métricas Oficiais */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-3 pt-6 border-t border-neutral-800/80">
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
              <span className="text-xs font-medium text-neutral-400 flex items-center gap-1">
                <Award className="h-3.5 w-3.5 text-blue-400" />
                Questões
              </span>
              <p className="mt-1 text-lg font-bold text-white">
                {simulation.totalQuestions}
              </p>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
              <span className="text-xs font-medium text-neutral-400 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                Acertos
              </span>
              <p className="mt-1 text-lg font-bold text-emerald-400">
                {simulation.correctCount ?? 0}
              </p>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
              <span className="text-xs font-medium text-neutral-400 flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5 text-red-400" />
                Erros
              </span>
              <p className="mt-1 text-lg font-bold text-red-400">
                {simulation.wrongCount ?? 0}
              </p>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
              <span className="text-xs font-medium text-neutral-400 flex items-center gap-1">
                <HelpCircle className="h-3.5 w-3.5 text-amber-400" />
                Em branco
              </span>
              <p className="mt-1 text-lg font-bold text-amber-400">
                {simulation.unansweredCount ?? 0}
              </p>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3 col-span-2 sm:col-span-1">
              <span className="text-xs font-medium text-neutral-400 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-neutral-400" />
                Tempo Gasto
              </span>
              <p className="mt-1 text-lg font-bold text-neutral-200">
                {formatDuration(simulation.durationSeconds)}
              </p>
            </div>
          </div>
        </div>

        {/* Seção de Revisão Pedagógica com Filtros */}
        <section aria-labelledby="review-heading" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 id="review-heading" className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-400" />
              Revisão Pedagógica das Questões
            </h2>

            {/* Barra de Filtros */}
            <div
              role="tablist"
              aria-label="Filtro de questões por resultado"
              className="flex flex-wrap items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-950 p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeFilter === 'all'}
                onClick={() => setActiveFilter('all')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeFilter === 'all'
                    ? 'bg-neutral-800 text-white font-semibold'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
                }`}
              >
                Todas ({questionsList.length})
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeFilter === 'correct'}
                onClick={() => setActiveFilter('correct')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeFilter === 'correct'
                    ? 'bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 font-semibold'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
                }`}
              >
                Acertos ({counts.correct})
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeFilter === 'wrong'}
                onClick={() => setActiveFilter('wrong')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeFilter === 'wrong'
                    ? 'bg-red-950/80 border border-red-800/80 text-red-300 font-semibold'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
                }`}
              >
                Erros ({counts.wrong})
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeFilter === 'unanswered'}
                onClick={() => setActiveFilter('unanswered')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeFilter === 'unanswered'
                    ? 'bg-amber-950/80 border border-amber-800/80 text-amber-300 font-semibold'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
                }`}
              >
                Em branco ({counts.unanswered})
              </button>

              {counts.annulled > 0 && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeFilter === 'annulled'}
                  onClick={() => setActiveFilter('annulled')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeFilter === 'annulled'
                      ? 'bg-purple-950/80 border border-purple-800/80 text-purple-300 font-semibold'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
                  }`}
                >
                  Anuladas ({counts.annulled})
                </button>
              )}
            </div>
          </div>

          {/* Lista de Questões Filtradas */}
          {filteredQuestions.length === 0 ? (
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-8 text-center text-neutral-400">
              <Filter className="mx-auto h-6 w-6 text-neutral-500 mb-2" />
              <p className="text-sm font-medium text-neutral-300">
                Nenhuma questão encontrada para este filtro.
              </p>
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className="mt-3 text-xs text-blue-400 hover:underline"
              >
                Ver todas as questões ({questionsList.length})
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredQuestions.map((q) => {
                const isReview = isReviewQuestion(q);
                const isAnnulled = isReview && q.isAnnulledSnapshot;
                const isCorrect = isReview && q.isCorrect === true;
                const studentAttempt = q.currentAttempt;
                const studentLetter = studentAttempt?.selectedLetter ?? null;
                const studentAltId = studentAttempt?.selectedAlternativeId ?? null;
                const hasAnswered = !!(studentLetter || studentAltId);
                const isWrong = isReview && !isAnnulled && q.isCorrect === false && hasAnswered;
                const isBlank = !isAnnulled && !hasAnswered;

                return (
                  <article
                    key={q.id || q.questionId}
                    aria-label={`Questão ${q.position}`}
                    className="rounded-xl border border-neutral-800 bg-neutral-950 p-6 sm:p-7 shadow-sm transition-colors"
                  >
                    {/* Cabeçalho da Questão */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-neutral-900 border border-neutral-800 px-2.5 py-1 text-xs font-mono font-bold text-neutral-200">
                          Questão {q.position}
                        </span>

                        {q.subject && (
                          <span className="rounded bg-neutral-900 px-2 py-0.5 text-xs font-medium text-neutral-400">
                            {q.subject}
                          </span>
                        )}

                        {q.topic && (
                          <span className="rounded bg-neutral-900 px-2 py-0.5 text-xs text-neutral-400">
                            {q.topic}
                          </span>
                        )}

                        {q.board && (
                          <span className="rounded bg-neutral-900 px-2 py-0.5 text-xs text-neutral-400 font-mono">
                            {q.board}
                          </span>
                        )}

                        {q.year && (
                          <span className="rounded bg-neutral-900 px-2 py-0.5 text-xs text-neutral-400 font-mono">
                            {q.year}
                          </span>
                        )}

                        {q.difficulty && (
                          <span className="rounded bg-neutral-900 px-2 py-0.5 text-xs text-neutral-400">
                            {q.difficulty}
                          </span>
                        )}
                      </div>

                      {/* Status de Acerto/Erro/Anulada */}
                      <div>
                        {isAnnulled ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-950/80 border border-purple-800/80 px-3 py-1 text-xs font-semibold text-purple-300">
                            <AlertCircle className="h-3.5 w-3.5" />
                            Questão Anulada
                          </span>
                        ) : isCorrect ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/80 border border-emerald-800/80 px-3 py-1 text-xs font-semibold text-emerald-300">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Acertou
                          </span>
                        ) : isWrong ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-950/80 border border-red-800/80 px-3 py-1 text-xs font-semibold text-red-300">
                            <XCircle className="h-3.5 w-3.5" />
                            Errou
                          </span>
                        ) : isBlank ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-950/80 border border-amber-800/80 px-3 py-1 text-xs font-semibold text-amber-300">
                            <HelpCircle className="h-3.5 w-3.5" />
                            Não Respondida
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Aviso de Questão Anulada */}
                    {isAnnulled && (
                      <div className="mt-4 rounded-lg border border-purple-900/60 bg-purple-950/20 p-3.5 text-xs text-purple-200 flex items-start gap-2.5">
                        <AlertCircle className="h-4 w-4 shrink-0 text-purple-400 mt-0.5" />
                        <div>
                          <p className="font-semibold text-purple-100">
                            Questão oficialmente anulada pela banca examinadora
                          </p>
                          <p className="mt-0.5 text-purple-300">
                            A pontuação desta questão foi atribuída a todos os
                            candidatos, de acordo com o gabarito oficial publicado
                            {isReview && q.officialAnswerKeyVersion !== null && q.officialAnswerKeyVersion !== undefined
                              ? ` (Versão ${q.officialAnswerKeyVersion})`
                              : ''}
                            .
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Enunciado */}
                    <div className="mt-5 text-sm sm:text-base leading-relaxed text-neutral-100 whitespace-pre-line">
                      {q.statement}
                    </div>

                    {/* Alternativas com Marcação Visual */}
                    <div className="mt-6 space-y-3">
                      {q.alternatives.map((alt) => {
                        const isStudentChoice =
                          (studentAltId && alt.id === studentAltId) ||
                          (studentLetter && alt.letter.toUpperCase() === studentLetter.toUpperCase());

                        const isOfficialKey =
                          isReview &&
                          q.answerKeySnapshot !== null &&
                          q.answerKeySnapshot.toUpperCase() === alt.letter.toUpperCase();

                        let itemStyle = 'border-neutral-800 bg-neutral-900/30 text-neutral-300';
                        let letterBadgeStyle = 'border-neutral-800 bg-neutral-800 text-neutral-300';

                        if (isAnnulled) {
                          if (isStudentChoice) {
                            itemStyle = 'border-purple-600/70 bg-purple-950/20 text-purple-200';
                            letterBadgeStyle = 'border-purple-600 bg-purple-900/60 text-purple-300';
                          } else if (isOfficialKey) {
                            itemStyle = 'border-purple-600/40 bg-purple-950/10 text-purple-200/80';
                            letterBadgeStyle = 'border-purple-700 bg-purple-950 text-purple-300';
                          }
                        } else if (isOfficialKey && isStudentChoice) {
                          // Acerto do aluno
                          itemStyle =
                            'border-emerald-600/80 bg-emerald-950/20 text-emerald-100 ring-1 ring-emerald-500/30';
                          letterBadgeStyle = 'border-emerald-600 bg-emerald-600 text-white';
                        } else if (isOfficialKey && !isStudentChoice) {
                          // Gabarito oficial que o aluno não marcou
                          itemStyle =
                            'border-emerald-600/60 bg-emerald-950/15 text-emerald-200';
                          letterBadgeStyle =
                            'border-emerald-600 bg-emerald-900/60 text-emerald-300';
                        } else if (!isOfficialKey && isStudentChoice) {
                          // Erro do aluno
                          itemStyle =
                            'border-red-600/80 bg-red-950/20 text-red-200 ring-1 ring-red-500/30';
                          letterBadgeStyle = 'border-red-600 bg-red-600 text-white';
                        }

                        return (
                          <div
                            key={alt.id}
                            className={`flex items-start gap-3 rounded-lg border p-3.5 transition-colors ${itemStyle}`}
                          >
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${letterBadgeStyle}`}
                            >
                              {alt.letter}
                            </span>

                            <div className="flex-1 text-sm leading-relaxed">
                              <span>{alt.text}</span>
                            </div>

                            {/* Tags de status na alternativa */}
                            <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 shrink-0 text-[11px] font-semibold">
                              {isAnnulled ? (
                                <>
                                  {isStudentChoice && (
                                    <span className="inline-flex items-center gap-1 rounded bg-purple-500/20 px-2 py-0.5 text-purple-300">
                                      <Check className="h-3 w-3" />
                                      Sua resposta (Anulada)
                                    </span>
                                  )}
                                  {isOfficialKey && (
                                    <span className="inline-flex items-center gap-1 rounded bg-purple-500/20 px-2 py-0.5 text-purple-300">
                                      Gabarito Original
                                    </span>
                                  )}
                                </>
                              ) : (
                                <>
                                  {isStudentChoice && isOfficialKey && (
                                    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-300">
                                      <Check className="h-3 w-3" />
                                      Sua resposta (Correta)
                                    </span>
                                  )}

                                  {isStudentChoice && !isOfficialKey && (
                                    <span className="inline-flex items-center gap-1 rounded bg-red-500/20 px-2 py-0.5 text-red-300">
                                      <X className="h-3 w-3" />
                                      Sua resposta (Incorreta)
                                    </span>
                                  )}

                                  {isOfficialKey && !isStudentChoice && (
                                    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-300">
                                      <Check className="h-3 w-3" />
                                      Gabarito Oficial
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Explicação Pedagógica (se existir) */}
                    {isReview && q.explanation && q.explanation.trim() !== '' && (
                      <div className="mt-5 rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-400">
                          <BookOpen className="h-4 w-4" />
                          <span>Comentário e Justificativa Pedagógica</span>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-neutral-300 whitespace-pre-line">
                          {q.explanation}
                        </p>
                      </div>
                    )}

                    {/* Metadados de Tempo de Resposta */}
                    {studentAttempt?.timeSpentSeconds !== null &&
                      studentAttempt?.timeSpentSeconds !== undefined &&
                      studentAttempt.timeSpentSeconds > 0 && (
                        <div className="mt-3 text-right text-xs text-neutral-500 font-mono">
                          Tempo gasto nesta questão: {studentAttempt.timeSpentSeconds}s
                        </div>
                      )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Rodapé com Navegação */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-neutral-800 pt-6 pb-4">
          <Link
            to="/simulations"
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2 text-xs font-semibold text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar para Meus Simulados
          </Link>

          <Link
            to="/simulations/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            Criar Novo Simulado
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
