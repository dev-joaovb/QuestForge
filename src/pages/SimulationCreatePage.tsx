import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Navbar } from '../components/Navbar.tsx';
import { Footer } from '../components/Footer.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import { ApiHttpError, createSimulation } from '../services/api.ts';
import type {
  CreateSimulationPayload,
  QuestionDifficulty,
  QuestionType,
  SimulationDetailDTO,
  SimulationQuestionCriteria,
} from '../types/index.ts';

const DIFFICULTY_OPTIONS: { label: string; value: '' | QuestionDifficulty }[] = [
  { label: 'Todas as dificuldades', value: '' },
  { label: 'Fácil (EASY)', value: 'EASY' },
  { label: 'Média (MEDIUM)', value: 'MEDIUM' },
  { label: 'Difícil (HARD)', value: 'HARD' },
];

const TYPE_OPTIONS: { label: string; value: '' | QuestionType }[] = [
  { label: 'Todos os formatos', value: '' },
  { label: 'Múltipla Escolha', value: 'MULTIPLE_CHOICE' },
  { label: 'Certo ou Errado', value: 'TRUE_FALSE' },
];

const QUESTION_COUNT_PRESETS = [10, 20, 50, 100];
const TIME_LIMIT_PRESETS = [30, 60, 90, 120, 240];

export function SimulationCreatePage() {
  const { status: authStatus, sessionCheckError } = useAuth();
  const navigate = useNavigate();

  // Estados do formulário
  const [title, setTitle] = useState('');
  const [totalQuestions, setTotalQuestions] = useState<number>(20);
  const [hasTimeLimit, setHasTimeLimit] = useState<boolean>(true);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(60);

  // Critérios de filtro opcionais
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [subtopic, setSubtopic] = useState('');
  const [board, setBoard] = useState('');
  const [examTitle, setExamTitle] = useState('');
  const [year, setYear] = useState<string>('');
  const [difficulty, setDifficulty] = useState<'' | QuestionDifficulty>('');
  const [questionType, setQuestionType] = useState<'' | QuestionType>('');

  // Estados de requisição e resultado
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<{
    code?: string;
    message: string;
    details?: unknown;
  } | null>(null);
  const [createdSimulation, setCreatedSimulation] = useState<SimulationDetailDTO | null>(null);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!totalQuestions || totalQuestions < 1) {
      errors.totalQuestions = 'A quantidade de questões deve ser no mínimo 1.';
    } else if (totalQuestions > 200) {
      errors.totalQuestions = 'A quantidade de questões não pode exceder 200.';
    }

    if (hasTimeLimit) {
      if (!timeLimitMinutes || timeLimitMinutes < 1) {
        errors.timeLimitMinutes = 'O limite de tempo deve ser de pelo menos 1 minuto.';
      } else if (timeLimitMinutes > 1440) {
        errors.timeLimitMinutes = 'O tempo máximo permitido é de 24 horas (1440 minutos).';
      }
    }

    if (year.trim()) {
      const parsedYear = parseInt(year.trim(), 10);
      if (isNaN(parsedYear) || parsedYear < 1990 || parsedYear > 2100) {
        errors.year = 'O ano deve ser um valor numérico entre 1990 e 2100.';
      }
    }

    if (title.trim().length > 200) {
      errors.title = 'O título pode ter no máximo 200 caracteres.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (isSubmitting) return;

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Monta os critérios opcionais somente com campos preenchidos
      const criteria: SimulationQuestionCriteria = {};
      if (subject.trim()) criteria.subject = subject.trim();
      if (topic.trim()) criteria.topic = topic.trim();
      if (subtopic.trim()) criteria.subtopic = subtopic.trim();
      if (board.trim()) criteria.board = board.trim();
      if (examTitle.trim()) criteria.examTitle = examTitle.trim();
      if (year.trim()) criteria.year = parseInt(year.trim(), 10);
      if (difficulty) criteria.difficulty = difficulty;
      if (questionType) criteria.type = questionType;

      const hasAnyCriteria = Object.keys(criteria).length > 0;

      const payload: CreateSimulationPayload = {
        title: title.trim() ? title.trim() : null,
        totalQuestions,
        timeLimitSeconds: hasTimeLimit ? timeLimitMinutes * 60 : null,
        criteria: hasAnyCriteria ? criteria : undefined,
      };

      const result = await createSimulation(payload);
      setCreatedSimulation(result);
    } catch (error) {
      if (error instanceof ApiHttpError) {
        if (error.code === 'SIMULATION_INSUFFICIENT_QUESTIONS' || error.status === 422) {
          setSubmitError({
            code: 'SIMULATION_INSUFFICIENT_QUESTIONS',
            message:
              error.message ||
              'Quantidade insuficiente de questões elegíveis com gabarito válido para os critérios informados.',
          });
        } else {
          setSubmitError({
            code: error.code,
            message: error.message || 'Erro ao comunicar com o servidor.',
          });
        }
      } else {
        setSubmitError({
          code: 'UNEXPECTED_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Ocorreu um erro inesperado ao criar o simulado.',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setCreatedSimulation(null);
    setSubmitError(null);
    setFormErrors({});
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] flex flex-col justify-between">
      <Navbar />

      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8 flex-1">
        {authStatus === 'loading' && (
          <div
            role="status"
            className="rounded-lg border border-neutral-800 bg-neutral-950 p-8 text-sm font-mono text-neutral-400"
          >
            Verificando sessão ativa junto ao servidor...
          </div>
        )}

        {authStatus === 'unauthenticated' && (
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-6 sm:p-8 qf-animate-in">
            <p className="text-xs font-mono text-neutral-400">
              Acesso Restrito · Motor de Simulados
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
              Autenticação necessária para criar simulados
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              A montagem e a resolução de simulados utilizam o motor isolado por usuário no
              PostgreSQL. Realize login para prosseguir.
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
            {/* Navegação de topo / Breadcrumbs */}
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <Link
                to="/simulations"
                className="inline-flex items-center gap-1.5 transition-colors hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Meus Simulados
              </Link>
              <span aria-hidden="true" className="text-neutral-600">
                /
              </span>
              <span className="text-neutral-300 font-medium">Novo Simulado</span>
            </div>

            {/* Banner de Sucesso pós-criação */}
            {createdSimulation ? (
              <div
                role="region"
                aria-label="Simulado criado com sucesso"
                className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-6 sm:p-8 space-y-6"
              >
                <div className="flex items-start gap-4">
                  <div className="rounded-full bg-emerald-900/40 p-2 text-emerald-400">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-xl font-bold text-white">
                      Simulado criado com sucesso!
                    </h2>
                    <p className="text-sm text-neutral-300">
                      O motor selecionou e randomizou as questões no servidor com seus respectivos
                      snapshots de gabarito garantidos.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-md border border-neutral-800 bg-neutral-950 p-4 text-xs font-mono">
                  <div>
                    <span className="text-neutral-500">Título:</span>{' '}
                    <span className="text-white font-semibold">
                      {createdSimulation.title || 'Simulado sem título'}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Identificador (ID):</span>{' '}
                    <span className="text-neutral-300">{createdSimulation.id}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Status:</span>{' '}
                    <span className="text-blue-300 font-semibold">
                      {createdSimulation.status === 'CREATED' ? 'Não iniciado' : createdSimulation.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Total de questões:</span>{' '}
                    <span className="text-white font-semibold">
                      {createdSimulation.totalQuestions} questões
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Tempo limite:</span>{' '}
                    <span className="text-white">
                      {createdSimulation.timeLimitSeconds
                        ? `${Math.round(createdSimulation.timeLimitSeconds / 60)} minutos`
                        : 'Sem limite'}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Criado em:</span>{' '}
                    <span className="text-neutral-400">
                      {new Date(createdSimulation.createdAt).toLocaleString('pt-BR')}
                    </span>
                  </div>
                </div>

                <div className="rounded-md border border-neutral-800/80 bg-neutral-900/40 p-4 text-xs text-neutral-400">
                  <p>
                    <strong className="text-neutral-200">Próximo passo:</strong> A interface de
                    execução do simulado e submissão de respostas com cronômetro será implementada na
                    etapa seguinte. O simulado já está salvo no seu histórico e disponível na listagem.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => navigate('/simulations')}
                    className="inline-flex items-center gap-2 rounded-md bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                  >
                    Ver na Lista de Simulados
                  </button>
                  <button
                    type="button"
                    onClick={handleResetForm}
                    className="inline-flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm font-medium text-neutral-300 hover:bg-neutral-900 hover:text-white focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                  >
                    Configurar Outro Simulado
                  </button>
                </div>
              </div>
            ) : (
              /* Formulário de Criação */
              <form onSubmit={handleSubmit} noValidate className="space-y-6">
                <div className="border-b border-neutral-800 pb-4">
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                    Configurar Novo Simulado
                  </h1>
                  <p className="mt-1 text-sm text-neutral-400">
                    Defina o tamanho da prova, limite de tempo e filtros opcionais por disciplina,
                    tópico ou banca.
                  </p>
                </div>

                {/* Banner de Erro Global */}
                {submitError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-900/60 bg-red-950/20 p-4 text-sm text-red-200 space-y-2"
                  >
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-semibold text-white">
                          {submitError.code === 'SIMULATION_INSUFFICIENT_QUESTIONS'
                            ? 'Questões insuficientes no banco de dados'
                            : 'Não foi possível gerar o simulado'}
                        </p>
                        <p className="text-xs text-red-300">{submitError.message}</p>
                        {submitError.code === 'SIMULATION_INSUFFICIENT_QUESTIONS' && (
                          <p className="text-xs text-neutral-300 pt-1">
                            Sugestão: Reduza a quantidade de questões solicitada ou amplie os
                            critérios de busca (removendo filtros restritivos de tópico, banca ou
                            ano).
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Seção 1: Configurações Gerais */}
                <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-6 space-y-6">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Layers className="h-4 w-4 text-[#2563EB]" />
                    <span>Configurações Básicas</span>
                  </div>

                  {/* Título opcional */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="simulation-title"
                      className="block text-xs font-medium text-neutral-300"
                    >
                      Título do Simulado <span className="text-neutral-500">(Opcional)</span>
                    </label>
                    <input
                      id="simulation-title"
                      type="text"
                      maxLength={200}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ex: Simulado PF 2026 - Conhecimentos Básicos"
                      className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                    />
                    {formErrors.title && (
                      <p className="text-xs text-red-400">{formErrors.title}</p>
                    )}
                  </div>

                  {/* Quantidade de Questões */}
                  <div className="space-y-2">
                    <label
                      htmlFor="simulation-questions-count"
                      className="block text-xs font-medium text-neutral-300"
                    >
                      Quantidade de Questões <span className="text-red-400">*</span>
                    </label>

                    {/* Presets de Quantidade */}
                    <div className="flex flex-wrap items-center gap-2">
                      {QUESTION_COUNT_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setTotalQuestions(preset)}
                          className={`rounded-md px-3 py-1.5 text-xs font-mono font-medium transition-colors ${
                            totalQuestions === preset
                              ? 'bg-[#2563EB] text-white'
                              : 'border border-neutral-800 bg-neutral-900/60 text-neutral-300 hover:bg-neutral-900 hover:text-white'
                          }`}
                        >
                          {preset} questões
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <input
                        id="simulation-questions-count"
                        type="number"
                        min={1}
                        max={200}
                        required
                        value={totalQuestions}
                        onChange={(e) => setTotalQuestions(parseInt(e.target.value, 10) || 0)}
                        className="w-32 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-mono text-white focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                      />
                      <span className="text-xs text-neutral-400">
                        Mínimo de 1 e máximo de 200 questões.
                      </span>
                    </div>
                    {formErrors.totalQuestions && (
                      <p className="text-xs text-red-400">{formErrors.totalQuestions}</p>
                    )}
                  </div>

                  {/* Limite de Tempo */}
                  <div className="space-y-3 pt-2 border-t border-neutral-800/80">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="toggle-time-limit"
                        className="flex items-center gap-2 text-xs font-medium text-neutral-300 cursor-pointer"
                      >
                        <Clock className="h-4 w-4 text-neutral-400" />
                        Definir tempo limite oficial
                      </label>
                      <input
                        id="toggle-time-limit"
                        type="checkbox"
                        checked={hasTimeLimit}
                        onChange={(e) => setHasTimeLimit(e.target.checked)}
                        className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-[#2563EB] focus:ring-[#2563EB]"
                      />
                    </div>

                    {hasTimeLimit ? (
                      <div className="space-y-2 pl-6">
                        <div className="flex flex-wrap items-center gap-2">
                          {TIME_LIMIT_PRESETS.map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setTimeLimitMinutes(preset)}
                              className={`rounded-md px-3 py-1.5 text-xs font-mono font-medium transition-colors ${
                                timeLimitMinutes === preset
                                  ? 'bg-[#2563EB] text-white'
                                  : 'border border-neutral-800 bg-neutral-900/60 text-neutral-300 hover:bg-neutral-900 hover:text-white'
                              }`}
                            >
                              {preset} min
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center gap-3 pt-1">
                          <input
                            id="simulation-time-limit"
                            type="number"
                            min={1}
                            max={1440}
                            value={timeLimitMinutes}
                            onChange={(e) =>
                              setTimeLimitMinutes(parseInt(e.target.value, 10) || 0)
                            }
                            aria-label="Tempo limite em minutos"
                            className="w-32 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-mono text-white focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                          />
                          <span className="text-xs text-neutral-400">
                            minutos (equivale a {timeLimitMinutes * 60} segundos).
                          </span>
                        </div>
                        {formErrors.timeLimitMinutes && (
                          <p className="text-xs text-red-400">{formErrors.timeLimitMinutes}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-500 pl-6">
                        Simulado livre sem cronômetro de expiração.
                      </p>
                    )}
                  </div>
                </div>

                {/* Seção 2: Critérios de Conteúdo (Filtros Reais) */}
                <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-6 space-y-6">
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <Sparkles className="h-4 w-4 text-[#2563EB]" />
                      <span>Critérios de Seleção (Opcional)</span>
                    </div>
                    <span className="text-xs text-neutral-500">
                      Deixe em branco para sortear do banco completo
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Disciplina */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="criteria-subject"
                        className="block text-xs font-medium text-neutral-300"
                      >
                        Disciplina
                      </label>
                      <input
                        id="criteria-subject"
                        type="text"
                        maxLength={100}
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Ex: Direito Constitucional"
                        className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                      />
                    </div>

                    {/* Tópico */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="criteria-topic"
                        className="block text-xs font-medium text-neutral-300"
                      >
                        Tópico
                      </label>
                      <input
                        id="criteria-topic"
                        type="text"
                        maxLength={100}
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        placeholder="Ex: Direitos e Garantias Fundamentais"
                        className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                      />
                    </div>

                    {/* Subtópico */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="criteria-subtopic"
                        className="block text-xs font-medium text-neutral-300"
                      >
                        Subtópico
                      </label>
                      <input
                        id="criteria-subtopic"
                        type="text"
                        maxLength={100}
                        value={subtopic}
                        onChange={(e) => setSubtopic(e.target.value)}
                        placeholder="Ex: Remédios Constitucionais"
                        className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                      />
                    </div>

                    {/* Banca */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="criteria-board"
                        className="block text-xs font-medium text-neutral-300"
                      >
                        Banca Examinadora
                      </label>
                      <input
                        id="criteria-board"
                        type="text"
                        maxLength={100}
                        value={board}
                        onChange={(e) => setBoard(e.target.value)}
                        placeholder="Ex: Cebraspe, FGV, FCC"
                        className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                      />
                    </div>

                    {/* Título da Prova */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="criteria-exam-title"
                        className="block text-xs font-medium text-neutral-300"
                      >
                        Concurso / Prova
                      </label>
                      <input
                        id="criteria-exam-title"
                        type="text"
                        maxLength={150}
                        value={examTitle}
                        onChange={(e) => setExamTitle(e.target.value)}
                        placeholder="Ex: Polícia Federal - Agente"
                        className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                      />
                    </div>

                    {/* Ano */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="criteria-year"
                        className="block text-xs font-medium text-neutral-300"
                      >
                        Ano do Concurso
                      </label>
                      <input
                        id="criteria-year"
                        type="number"
                        min={1990}
                        max={2100}
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        placeholder="Ex: 2024"
                        className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-mono text-white placeholder-neutral-500 focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                      />
                      {formErrors.year && (
                        <p className="text-xs text-red-400">{formErrors.year}</p>
                      )}
                    </div>

                    {/* Dificuldade */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="criteria-difficulty"
                        className="block text-xs font-medium text-neutral-300"
                      >
                        Nível de Dificuldade
                      </label>
                      <select
                        id="criteria-difficulty"
                        value={difficulty}
                        onChange={(e) =>
                          setDifficulty(e.target.value as '' | QuestionDifficulty)
                        }
                        className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                      >
                        {DIFFICULTY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Tipo / Formato */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="criteria-type"
                        className="block text-xs font-medium text-neutral-300"
                      >
                        Formato da Questão
                      </label>
                      <select
                        id="criteria-type"
                        value={questionType}
                        onChange={(e) => setQuestionType(e.target.value as '' | QuestionType)}
                        className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                      >
                        {TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Barra de Ações do Formulário */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-800">
                  <Link
                    to="/simulations"
                    className="rounded-md border border-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-white focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                  >
                    Cancelar
                  </Link>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 rounded-md bg-[#2563EB] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1D4ED8] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                  >
                    {isSubmitting ? 'Gerando simulado...' : 'Criar Simulado'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
