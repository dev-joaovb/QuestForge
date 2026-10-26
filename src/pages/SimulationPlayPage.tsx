import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eraser,
  Flag,
  Layers,
  LogOut,
  Play,
  RotateCcw,
} from 'lucide-react';
import { Navbar } from '../components/Navbar.tsx';
import { Footer } from '../components/Footer.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import {
  abandonSimulation,
  ApiHttpError,
  finishSimulation,
  getSimulation,
  startSimulation,
  submitSimulationAnswer,
} from '../services/api.ts';
import type {
  SimulationDetailDTO,
  SimulationPublicQuestionDTO,
  SimulationResultDTO,
} from '../types/index.ts';
import { SimulationTimer } from '../components/simulations/SimulationTimer.tsx';
import { QuestionPalette } from '../components/simulations/QuestionPalette.tsx';
import { FinishConfirmModal } from '../components/simulations/FinishConfirmModal.tsx';
import { AbandonConfirmModal } from '../components/simulations/AbandonConfirmModal.tsx';

export function SimulationPlayPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { status: authStatus, sessionCheckError } = useAuth();

  // Dados do simulado
  const [simulation, setSimulation] = useState<SimulationDetailDTO | null>(null);
  const [finishResult, setFinishResult] = useState<SimulationResultDTO | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // Estados de carregamento e erro inicial
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Estados de ações
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [startError, setStartError] = useState<string | null>(null);

  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  // Modais
  const [finishModalOpen, setFinishModalOpen] = useState<boolean>(false);
  const [isFinishing, setIsFinishing] = useState<boolean>(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const [abandonModalOpen, setAbandonModalOpen] = useState<boolean>(false);
  const [isAbandoning, setIsAbandoning] = useState<boolean>(false);
  const [abandonError, setAbandonError] = useState<string | null>(null);

  // Carrega os dados do simulado
  const loadSimulationData = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await getSimulation(id);
      setSimulation(data);
    } catch (err) {
      if (err instanceof ApiHttpError) {
        setLoadError(err.message || 'Erro ao carregar dados do simulado.');
      } else {
        setLoadError('Não foi possível se comunicar com o servidor.');
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

  // Iniciar Simulado (quando status === 'CREATED')
  const handleStartSimulation = async () => {
    if (!id || isStarting) return;
    setIsStarting(true);
    setStartError(null);

    try {
      const updated = await startSimulation(id);
      setSimulation(updated);
      setCurrentIndex(0);
    } catch (err) {
      if (err instanceof ApiHttpError) {
        setStartError(err.message || 'Não foi possível iniciar o simulado.');
      } else {
        setStartError('Falha de conexão ao tentar iniciar o simulado.');
      }
    } finally {
      setIsStarting(false);
    }
  };

  // Submeter ou limpar resposta
  const handleSelectAlternative = async (
    questionId: string,
    targetAlternativeId: string | null
  ) => {
    if (!simulation || simulation.status !== 'IN_PROGRESS' || isFinishing) return;

    // Encontra a questão correspondente
    const questions = simulation.questions as SimulationPublicQuestionDTO[];
    const qIndex = questions.findIndex((q) => q.questionId === questionId);
    if (qIndex === -1) return;

    const currentQuestion = questions[qIndex];
    const previousAttempt = currentQuestion.currentAttempt;

    // Se clicou na alternativa já selecionada, desmarca (resposta em branco)
    const effectiveAlternativeId =
      previousAttempt?.selectedAlternativeId === targetAlternativeId && targetAlternativeId !== null
        ? null
        : targetAlternativeId;

    const selectedAlt = currentQuestion.alternatives.find((a) => a.id === effectiveAlternativeId);

    // Atualização otimista
    const optimisticQuestions = [...questions];
    optimisticQuestions[qIndex] = {
      ...currentQuestion,
      currentAttempt: effectiveAlternativeId
        ? {
            selectedAlternativeId: effectiveAlternativeId,
            selectedLetter: selectedAlt?.letter ?? null,
            answeredAt: new Date().toISOString(),
            timeSpentSeconds: null,
          }
        : null,
    };

    setSimulation({
      ...simulation,
      questions: optimisticQuestions,
    });

    setSavingStatus('saving');
    setSavingQuestionId(questionId);
    setSaveErrorMessage(null);

    try {
      const attempt = await submitSimulationAnswer(
        simulation.id,
        questionId,
        effectiveAlternativeId
      );

      // Atualiza com os dados do servidor
      setSimulation((prev) => {
        if (!prev) return prev;
        const updatedQs = [...(prev.questions as SimulationPublicQuestionDTO[])];
        const idx = updatedQs.findIndex((q) => q.questionId === questionId);
        if (idx !== -1) {
          updatedQs[idx] = {
            ...updatedQs[idx],
            currentAttempt: attempt.selectedAlternativeId
              ? {
                  selectedAlternativeId: attempt.selectedAlternativeId,
                  selectedLetter: attempt.selectedLetter,
                  answeredAt: attempt.answeredAt,
                  timeSpentSeconds: attempt.timeSpentSeconds,
                }
              : null,
          };
        }
        return {
          ...prev,
          questions: updatedQs,
        };
      });

      setSavingStatus('saved');
      setTimeout(() => {
        setSavingStatus((curr) => (curr === 'saved' ? 'idle' : curr));
        setSavingQuestionId(null);
      }, 2000);
    } catch (err) {
      // Reversão em caso de erro
      setSimulation((prev) => {
        if (!prev) return prev;
        const revertedQs = [...(prev.questions as SimulationPublicQuestionDTO[])];
        const idx = revertedQs.findIndex((q) => q.questionId === questionId);
        if (idx !== -1) {
          revertedQs[idx] = {
            ...revertedQs[idx],
            currentAttempt: previousAttempt,
          };
        }
        return {
          ...prev,
          questions: revertedQs,
        };
      });

      setSavingStatus('error');
      if (err instanceof ApiHttpError) {
        if (err.code === 'SIMULATION_EXPIRED' || err.status === 410) {
          setSaveErrorMessage('O tempo limite do simulado expirou.');
          // Atualiza o simulado para expirado
          loadSimulationData();
        } else {
          setSaveErrorMessage(err.message || 'Erro ao registrar resposta no servidor.');
        }
      } else {
        setSaveErrorMessage('Falha de comunicação ao salvar resposta.');
      }
    }
  };

  // Expirar timer
  const handleTimerExpired = async () => {
    if (!simulation || simulation.status !== 'IN_PROGRESS') return;
    try {
      await loadSimulationData();
    } catch {
      // Se falhar o reload, apenas marca localmente como expirado
      setSimulation((prev) => (prev ? { ...prev, isExpired: true, status: 'EXPIRED' } : null));
    }
  };

  // Finalizar Simulado
  const handleConfirmFinish = async () => {
    if (!simulation || isFinishing) return;
    setIsFinishing(true);
    setFinishError(null);

    try {
      const result = await finishSimulation(simulation.id);
      setFinishResult(result);
      setSimulation(result);
      setFinishModalOpen(false);
    } catch (err) {
      if (err instanceof ApiHttpError) {
        setFinishError(err.message || 'Não foi possível finalizar o simulado.');
      } else {
        setFinishError('Erro ao comunicar com o servidor para finalizar.');
      }
    } finally {
      setIsFinishing(false);
    }
  };

  // Abandonar Simulado
  const handleConfirmAbandon = async () => {
    if (!simulation || isAbandoning) return;
    setIsAbandoning(true);
    setAbandonError(null);

    try {
      await abandonSimulation(simulation.id);
      setAbandonModalOpen(false);
      navigate('/simulations');
    } catch (err) {
      if (err instanceof ApiHttpError) {
        setAbandonError(err.message || 'Não foi possível abandonar o simulado.');
      } else {
        setAbandonError('Erro ao comunicar com o servidor.');
      }
    } finally {
      setIsAbandoning(false);
    }
  };

  // 1. Estado de autenticação não resolvido
  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] flex flex-col justify-between">
        <Navbar />
        <main className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6 lg:px-8 flex-1">
          <div
            role="status"
            className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-6 text-sm font-mono text-neutral-400"
          >
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <span>Verificando sessão ativa...</span>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // 2. Não autenticado
  if (authStatus === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] flex flex-col justify-between">
        <Navbar />
        <main className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6 lg:px-8 flex-1">
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-6 sm:p-8">
            <p className="text-xs font-mono text-neutral-400">
              Acesso Restrito · Motor de Simulados
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
              Autenticação necessária para resolver simulados
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              A resolução e o registro de respostas requerem login no QuestForge.
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
                className="rounded-md bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1D4ED8]"
              >
                Ir para o Login
              </Link>
              <Link
                to="/simulations"
                className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-neutral-200 transition-colors hover:bg-neutral-900"
              >
                Voltar aos Simulados
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // 3. Carregando dados do simulado
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] flex flex-col justify-between">
        <Navbar />
        <main className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6 lg:px-8 flex-1">
          <div
            role="status"
            className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-8 text-sm font-mono text-neutral-400"
          >
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <span>Carregando caderno de questões do simulado...</span>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // 4. Erro ao carregar simulado
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
                  Não foi possível carregar o simulado
                </h1>
                <p className="mt-1 text-xs text-red-300">
                  {loadError || 'O simulado solicitado não foi encontrado ou você não possui permissão.'}
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
                    Voltar para Simulados
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

  const questions = (simulation.questions || []) as SimulationPublicQuestionDTO[];
  const totalQuestions = questions.length;
  const answeredCount = questions.filter(
    (q) => q.currentAttempt?.selectedAlternativeId != null && q.currentAttempt.selectedAlternativeId !== ''
  ).length;
  const unansweredCount = totalQuestions - answeredCount;

  // 5. Estado CREATED: Briefing pré-prova
  if (simulation.status === 'CREATED') {
    const timeLimitMinutes = simulation.timeLimitSeconds
      ? Math.round(simulation.timeLimitSeconds / 60)
      : null;

    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] flex flex-col justify-between">
        <Navbar />
        <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8 flex-1">
          <div className="mb-6 flex items-center justify-between">
            <Link
              to="/simulations"
              className="inline-flex items-center gap-2 text-xs font-mono text-neutral-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar aos Simulados
            </Link>
            <span className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs font-mono text-neutral-400">
              Status: Não Iniciado
            </span>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-6 sm:p-8">
            <p className="text-xs font-mono font-semibold uppercase tracking-wider text-blue-400">
              Caderno de Questões Preparado
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {simulation.title || 'Simulado QuestForge'}
            </h1>

            {/* Metadados resumidos */}
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-lg border border-neutral-800/80 bg-neutral-900/40 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-950/60 border border-blue-800/60 text-blue-400">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-mono text-neutral-400">Total de Questões</p>
                  <p className="text-base font-bold text-white">
                    {simulation.totalQuestions} questões
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg border border-neutral-800/80 bg-neutral-900/40 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-950/60 border border-amber-800/60 text-amber-400">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-mono text-neutral-400">Limite de Tempo</p>
                  <p className="text-base font-bold text-white">
                    {timeLimitMinutes ? `${timeLimitMinutes} minutos` : 'Sem limite de tempo'}
                  </p>
                </div>
              </div>
            </div>

            {/* Instruções */}
            <div className="mt-6 rounded-lg border border-neutral-800/80 bg-neutral-900/30 p-5 text-xs text-neutral-300 space-y-2">
              <h2 className="font-mono font-semibold uppercase tracking-wider text-neutral-200">
                Instruções Importantes
              </h2>
              <ul className="list-disc pl-4 space-y-1.5 text-neutral-400">
                <li>Você pode navegar livremente entre as questões pelo mapa lateral.</li>
                <li>Suas respostas são salvas automaticamente a cada seleção.</li>
                <li>Você pode alterar ou desmarcar alternativas a qualquer momento antes de finalizar.</li>
                {timeLimitMinutes && (
                  <li>
                    A contagem regressiva oficial do servidor inicia assim que você clicar em{' '}
                    <strong>Iniciar Prova</strong>.
                  </li>
                )}
                <li>Ao término ou ao esgotar o tempo, a prova será encerrada.</li>
              </ul>
            </div>

            {startError && (
              <div
                role="alert"
                className="mt-6 flex items-start gap-2.5 rounded-md border border-red-900/60 bg-red-950/20 p-3.5 text-xs text-red-200"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <span>{startError}</span>
              </div>
            )}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <Link
                to="/simulations"
                className="rounded-md border border-neutral-800 bg-neutral-900 px-5 py-2.5 text-center text-xs font-semibold text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
              >
                Voltar à Listagem
              </Link>
              <button
                type="button"
                disabled={isStarting}
                onClick={handleStartSimulation}
                className="flex items-center justify-center gap-2 rounded-md bg-blue-600 px-6 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50"
              >
                {isStarting ? (
                  <>
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Iniciando prova...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    <span>Iniciar Prova Agora</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // 6. Estado FINALIZADO, EXPIRADO ou ABANDONADO
  if (
    simulation.status === 'COMPLETED' ||
    simulation.status === 'EXPIRED' ||
    simulation.status === 'ABANDONED'
  ) {
    const isCompleted = simulation.status === 'COMPLETED';
    const isExpired = simulation.status === 'EXPIRED';

    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] flex flex-col justify-between">
        <Navbar />
        <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8 flex-1">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border ${
                  isCompleted
                    ? 'border-emerald-800 bg-emerald-950/60 text-emerald-400'
                    : isExpired
                      ? 'border-red-800 bg-red-950/60 text-red-400'
                      : 'border-neutral-700 bg-neutral-900 text-neutral-400'
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-6 w-6" />
                ) : isExpired ? (
                  <Clock className="h-6 w-6" />
                ) : (
                  <LogOut className="h-6 w-6" />
                )}
              </div>
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-neutral-400">
                  {isCompleted
                    ? 'Simulado Concluído'
                    : isExpired
                      ? 'Tempo Esgotado'
                      : 'Simulado Abandonado'}
                </span>
                <h1 className="text-xl font-bold text-white sm:text-2xl">
                  {simulation.title || 'Simulado QuestForge'}
                </h1>
              </div>
            </div>

            <p className="mt-4 text-xs text-neutral-400">
              {isCompleted
                ? 'Suas respostas foram consolidadas com sucesso pelo motor de simulados do QuestForge no PostgreSQL.'
                : isExpired
                  ? 'O limite de tempo deste simulado encerrou. As respostas registradas antes da expiração foram salvas.'
                  : 'Este simulado foi abandonado pelo candidato e não aceita mais novas respostas.'}
            </p>

            {/* Resumo das métricas */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs font-mono">
              <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
                <span className="text-neutral-500">Questões</span>
                <p className="mt-1 text-base font-bold text-white">{simulation.totalQuestions}</p>
              </div>

              {simulation.scorePercentage !== null && simulation.scorePercentage !== undefined && (
                <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
                  <span className="text-neutral-500">Aproveitamento</span>
                  <p className="mt-1 text-base font-bold text-blue-400">
                    {simulation.scorePercentage}%
                  </p>
                </div>
              )}

              {simulation.correctCount !== null && simulation.correctCount !== undefined && (
                <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
                  <span className="text-neutral-500">Acertos</span>
                  <p className="mt-1 text-base font-bold text-emerald-400">
                    {simulation.correctCount}
                  </p>
                </div>
              )}

              {simulation.wrongCount !== null && simulation.wrongCount !== undefined && (
                <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
                  <span className="text-neutral-500">Erros</span>
                  <p className="mt-1 text-base font-bold text-red-400">
                    {simulation.wrongCount}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-8 flex flex-wrap justify-end gap-3">
              <Link
                to={`/simulations/${simulation.id}/results`}
                className="rounded-md bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors shadow-sm"
              >
                Ver Gabarito e Revisão Detalhada
              </Link>
              <Link
                to="/simulations"
                className="rounded-md border border-neutral-800 bg-neutral-900 px-5 py-2.5 text-xs font-semibold text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
              >
                Voltar para Meus Simulados
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // 7. Estado IN_PROGRESS: Execução ativa da prova
  const currentQuestion = questions[currentIndex];
  const currentSelectedAltId = currentQuestion?.currentAttempt?.selectedAlternativeId ?? null;
  const isSavingThis = savingQuestionId === currentQuestion?.questionId && savingStatus === 'saving';

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] flex flex-col justify-between">
      <Navbar />

      {/* Barra superior de controle da prova */}
      <div className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-xs sticky top-0 z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs font-mono font-medium text-neutral-300">
              Questão {currentIndex + 1} de {totalQuestions}
            </span>
            <span className="hidden sm:inline-block text-xs font-medium text-neutral-400 truncate max-w-xs md:max-w-md">
              {simulation.title || 'Simulado'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Timer */}
            <SimulationTimer
              initialSeconds={simulation.timeRemainingSeconds}
              onExpire={handleTimerExpired}
            />

            {/* Botões de Ação */}
            <button
              type="button"
              onClick={() => setAbandonModalOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:border-red-900 hover:text-red-300 transition-colors"
              title="Abandonar simulado em andamento"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Abandonar</span>
            </button>

            <button
              type="button"
              onClick={() => setFinishModalOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors shadow-sm"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Finalizar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Conteúdo principal */}
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 flex-1">
        {finishError && (
          <div
            role="alert"
            className="mb-4 flex items-center justify-between rounded-md border border-red-900/60 bg-red-950/20 p-3 text-xs text-red-200"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{finishError}</span>
            </div>
            <button
              type="button"
              onClick={() => setFinishError(null)}
              className="text-red-400 hover:text-white"
            >
              Fechar
            </button>
          </div>
        )}

        {abandonError && (
          <div
            role="alert"
            className="mb-4 flex items-center justify-between rounded-md border border-red-900/60 bg-red-950/20 p-3 text-xs text-red-200"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{abandonError}</span>
            </div>
            <button
              type="button"
              onClick={() => setAbandonError(null)}
              className="text-red-400 hover:text-white"
            >
              Fechar
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Painel da Questão (3 colunas no desktop) */}
          <div className="lg:col-span-3 flex flex-col justify-between rounded-xl border border-neutral-800 bg-neutral-950 p-6 sm:p-8 min-h-[500px]">
            {currentQuestion ? (
              <div>
                {/* Metadados da questão */}
                <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-neutral-800/80 text-xs font-mono">
                  <span className="rounded bg-blue-950/60 border border-blue-800/60 px-2 py-0.5 text-blue-300 font-semibold">
                    Questão #{currentQuestion.position}
                  </span>
                  <span className="rounded bg-neutral-900 border border-neutral-800 px-2 py-0.5 text-neutral-300">
                    {currentQuestion.subject}
                  </span>
                  {currentQuestion.topic && (
                    <span className="rounded bg-neutral-900 border border-neutral-800 px-2 py-0.5 text-neutral-400">
                      {currentQuestion.topic}
                    </span>
                  )}
                  {currentQuestion.difficulty && (
                    <span className="rounded bg-neutral-900 border border-neutral-800 px-2 py-0.5 text-neutral-400">
                      {currentQuestion.difficulty === 'EASY'
                        ? 'Fácil'
                        : currentQuestion.difficulty === 'MEDIUM'
                          ? 'Média'
                          : 'Difícil'}
                    </span>
                  )}
                  {currentQuestion.board && (
                    <span className="text-neutral-500">
                      · {currentQuestion.board} {currentQuestion.year ? `(${currentQuestion.year})` : ''}
                    </span>
                  )}
                </div>

                {/* Enunciado */}
                <div className="mt-6 text-sm text-neutral-100 sm:text-base leading-relaxed whitespace-pre-wrap font-sans">
                  {currentQuestion.statement}
                </div>

                {/* Feedback de salvamento */}
                <div className="mt-6 flex items-center justify-between text-xs font-mono min-h-[24px]">
                  <span className="text-neutral-400 font-semibold uppercase tracking-wider">
                    Selecione a alternativa correta:
                  </span>
                  <div>
                    {isSavingThis && (
                      <span className="flex items-center gap-1.5 text-blue-400">
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border border-blue-400 border-t-transparent" />
                        Salvando...
                      </span>
                    )}
                    {savingStatus === 'saved' && savingQuestionId === currentQuestion.questionId && (
                      <span className="flex items-center gap-1.5 text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Salvo no servidor
                      </span>
                    )}
                    {savingStatus === 'error' && saveErrorMessage && (
                      <span className="flex items-center gap-1.5 text-red-400">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {saveErrorMessage}
                      </span>
                    )}
                  </div>
                </div>

                {/* Lista de Alternativas */}
                <div
                  role="radiogroup"
                  aria-label={`Alternativas da questão ${currentIndex + 1}`}
                  className="mt-3 space-y-3"
                >
                  {currentQuestion.alternatives.map((alt) => {
                    const isSelected = alt.id === currentSelectedAltId;

                    return (
                      <button
                        key={alt.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        disabled={isSavingThis}
                        onClick={() => handleSelectAlternative(currentQuestion.questionId, alt.id)}
                        className={`w-full flex items-start gap-3.5 rounded-lg border p-4 text-left transition-all focus-visible:outline-2 focus-visible:outline-blue-500 ${
                          isSelected
                            ? 'border-blue-600 bg-blue-950/30 text-white shadow-sm'
                            : 'border-neutral-800 bg-neutral-900/40 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900/70'
                        } disabled:opacity-60 disabled:cursor-not-allowed`}
                      >
                        <div
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-mono font-bold transition-colors ${
                            isSelected
                              ? 'border-blue-500 bg-blue-600 text-white'
                              : 'border-neutral-700 bg-neutral-800 text-neutral-400'
                          }`}
                        >
                          {alt.letter}
                        </div>
                        <div className="text-xs sm:text-sm leading-normal text-neutral-200 mt-0.5">
                          {alt.text}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-xs font-mono text-neutral-400">
                Questão não disponível.
              </div>
            )}

            {/* Rodapé de Navegação da Questão */}
            <div className="mt-8 pt-6 border-t border-neutral-800/80 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                className="flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2 text-xs font-semibold text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Anterior</span>
              </button>

              <div className="flex items-center gap-2">
                {currentSelectedAltId && (
                  <button
                    type="button"
                    disabled={isSavingThis}
                    onClick={() => handleSelectAlternative(currentQuestion.questionId, null)}
                    className="flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-xs font-mono text-neutral-400 hover:border-neutral-700 hover:text-neutral-200 transition-colors disabled:opacity-40"
                    title="Limpar alternativa selecionada nesta questão"
                  >
                    <Eraser className="h-3.5 w-3.5" />
                    <span>Limpar Resposta</span>
                  </button>
                )}

                {currentIndex < totalQuestions - 1 ? (
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
                    className="flex items-center gap-1.5 rounded-md bg-neutral-800 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-700 transition-colors"
                  >
                    <span>Próxima</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setFinishModalOpen(true)}
                    className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors shadow-sm"
                  >
                    <Flag className="h-3.5 w-3.5" />
                    <span>Revisar e Finalizar</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Painel Lateral do Mapa de Questões (1 coluna no desktop) */}
          <div className="lg:col-span-1">
            <QuestionPalette
              questions={questions}
              currentIndex={currentIndex}
              onSelectIndex={(newIdx) => setCurrentIndex(newIdx)}
              disabled={isSavingThis}
            />
          </div>
        </div>
      </main>

      <Footer />

      {/* Modal de confirmação de finalização */}
      <FinishConfirmModal
        isOpen={finishModalOpen}
        totalQuestions={totalQuestions}
        answeredCount={answeredCount}
        unansweredCount={unansweredCount}
        isSubmitting={isFinishing}
        onConfirm={handleConfirmFinish}
        onCancel={() => setFinishModalOpen(false)}
      />

      {/* Modal de confirmação de abandono */}
      <AbandonConfirmModal
        isOpen={abandonModalOpen}
        isSubmitting={isAbandoning}
        onConfirm={handleConfirmAbandon}
        onCancel={() => setAbandonModalOpen(false)}
      />
    </div>
  );
}
