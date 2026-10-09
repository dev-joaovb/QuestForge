import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import { Navbar } from '../components/Navbar.tsx';
import { Footer } from '../components/Footer.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import {
  ApiHttpError,
  createQuestion,
  fetchQuestionById,
  updateQuestion,
} from '../services/api.ts';
import type {
  CreateOrUpdateQuestionPayload,
  QuestionAlternativeInput,
  QuestionDifficulty,
  QuestionStatus,
  QuestionType,
} from '../types/index.ts';

interface QuestionFormPageProps {
  mode: 'create' | 'edit';
}

const DEFAULT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

export function QuestionFormPage({ mode }: QuestionFormPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { status, sessionCheckError, refreshSession } = useAuth();

  const [isLoadingInitial, setIsLoadingInitial] = useState(mode === 'edit');
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);

  const [statement, setStatement] = useState('');
  const [type, setType] = useState<QuestionType>('MULTIPLE_CHOICE');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [subtopic, setSubtopic] = useState('');
  const [board, setBoard] = useState('');
  const [examTitle, setExamTitle] = useState('');
  const [year, setYear] = useState('');
  const [originalNumber, setOriginalNumber] = useState('');
  const [sourcePage, setSourcePage] = useState('');
  const [difficulty, setDifficulty] = useState<QuestionDifficulty | ''>('');
  const [questionStatus, setQuestionStatus] = useState<QuestionStatus>('ACTIVE');
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [explanation, setExplanation] = useState('');
  const [alternatives, setAlternatives] = useState<QuestionAlternativeInput[]>([
    { letter: 'A', text: '' },
    { letter: 'B', text: '' },
  ]);

  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (mode !== 'edit' || status !== 'authenticated' || !id) return;

    const controller = new AbortController();
    setIsLoadingInitial(true);
    setInitialLoadError(null);

    fetchQuestionById(id, { includeAnswer: true, signal: controller.signal })
      .then((question) => {
        if (controller.signal.aborted) return;
        setStatement(question.statement);
        setType(question.type);
        setSubject(question.subject);
        setTopic(question.topic ?? '');
        setSubtopic(question.subtopic ?? '');
        setBoard(question.board ?? '');
        setExamTitle(question.examTitle ?? '');
        setYear(question.year !== null ? String(question.year) : '');
        setOriginalNumber(
          question.originalNumber !== null ? String(question.originalNumber) : ''
        );
        setSourcePage(question.sourcePage !== null ? String(question.sourcePage) : '');
        setDifficulty(question.difficulty ?? '');
        setQuestionStatus(question.status);
        setAlternatives(
          question.alternatives.map((alt) => ({
            letter: alt.letter,
            text: alt.text,
          }))
        );

        if (question.answerKeyRevealed) {
          setCorrectAnswer(question.correctAnswer ?? '');
          setExplanation(question.explanation ?? '');
        }
      })
      .catch(async (error) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiHttpError && error.status === 401) {
          await refreshSession();
          return;
        }
        setInitialLoadError(
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar os dados da questão para edição.'
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingInitial(false);
        }
      });

    return () => controller.abort();
  }, [mode, id, status, refreshSession]);

  const handleAddAlternative = () => {
    if (alternatives.length >= 10) return;
    const usedLetters = new Set(alternatives.map((a) => a.letter.toUpperCase()));
    const nextLetter =
      DEFAULT_LETTERS.find((l) => !usedLetters.has(l)) ??
      String(alternatives.length + 1);
    setAlternatives((prev) => [...prev, { letter: nextLetter, text: '' }]);
  };

  const handleRemoveAlternative = (index: number) => {
    setAlternatives((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAlternativeChange = (
    index: number,
    field: 'letter' | 'text',
    value: string
  ) => {
    setAlternatives((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? {
              ...item,
              [field]: field === 'letter' ? value.toUpperCase() : value,
            }
          : item
      )
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError(null);
    setSubmitError(null);

    const trimmedStatement = statement.trim();
    const trimmedSubject = subject.trim();
    const normalizedCorrectAnswer = correctAnswer.trim().toUpperCase();

    if (trimmedStatement.length < 5) {
      setValidationError('O enunciado deve possuir pelo menos 5 caracteres.');
      return;
    }

    if (trimmedSubject.length < 2) {
      setValidationError('A disciplina deve possuir pelo menos 2 caracteres.');
      return;
    }

    const activeAlternatives = alternatives.filter(
      (alt) => alt.letter.trim() !== '' || alt.text.trim() !== ''
    );

    if (activeAlternatives.length > 0) {
      if (activeAlternatives.length < 2) {
        setValidationError(
          'Quando informadas, a questão deve possuir pelo menos 2 alternativas.'
        );
        return;
      }

      const seenLetters = new Set<string>();
      for (const alt of activeAlternatives) {
        const cleanLetter = alt.letter.trim().toUpperCase();
        const cleanText = alt.text.trim();
        if (!cleanLetter || !cleanText) {
          setValidationError(
            'Todas as alternativas adicionadas devem possuir letra e texto preenchidos.'
          );
          return;
        }
        if (seenLetters.has(cleanLetter)) {
          setValidationError(
            `Alternativa duplicada encontrada para a letra "${cleanLetter}".`
          );
          return;
        }
        seenLetters.add(cleanLetter);
      }

      if (normalizedCorrectAnswer && !seenLetters.has(normalizedCorrectAnswer)) {
        setValidationError(
          `A resposta correta "${normalizedCorrectAnswer}" não corresponde a nenhuma das alternativas fornecidas.`
        );
        return;
      }
    }

    const parsedYear = year.trim() ? Number(year.trim()) : null;
    if (
      parsedYear !== null &&
      (!Number.isInteger(parsedYear) || parsedYear < 1950 || parsedYear > 2100)
    ) {
      setValidationError('O ano deve ser um número inteiro entre 1950 e 2100.');
      return;
    }

    const parsedOriginalNumber = originalNumber.trim()
      ? Number(originalNumber.trim())
      : null;
    if (
      parsedOriginalNumber !== null &&
      (!Number.isInteger(parsedOriginalNumber) || parsedOriginalNumber <= 0)
    ) {
      setValidationError('O número original da questão deve ser um inteiro positivo.');
      return;
    }

    const parsedSourcePage = sourcePage.trim() ? Number(sourcePage.trim()) : null;
    if (
      parsedSourcePage !== null &&
      (!Number.isInteger(parsedSourcePage) || parsedSourcePage <= 0)
    ) {
      setValidationError('A página de origem deve ser um inteiro positivo.');
      return;
    }

    const payload: CreateOrUpdateQuestionPayload = {
      statement: trimmedStatement,
      type,
      subject: trimmedSubject,
      topic: topic.trim() ? topic.trim() : null,
      subtopic: subtopic.trim() ? subtopic.trim() : null,
      board: board.trim() ? board.trim() : null,
      examTitle: examTitle.trim() ? examTitle.trim() : null,
      year: parsedYear,
      originalNumber: parsedOriginalNumber,
      sourcePage: parsedSourcePage,
      difficulty: difficulty === '' ? null : difficulty,
      status: questionStatus,
      correctAnswer: normalizedCorrectAnswer ? normalizedCorrectAnswer : null,
      explanation: explanation.trim() ? explanation.trim() : null,
      alternatives: activeAlternatives.map((alt) => ({
        letter: alt.letter.trim().toUpperCase(),
        text: alt.text.trim(),
      })),
    };

    setIsSubmitting(true);
    try {
      if (mode === 'create') {
        const created = await createQuestion(payload);
        navigate(`/questions/${created.id}`);
      } else if (id) {
        const updated = await updateQuestion(id, payload);
        navigate(`/questions/${updated.id}`);
      }
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 401) {
        await refreshSession();
        return;
      }
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar a questão no servidor.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] flex flex-col justify-between">
      <Navbar />

      <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 lg:px-8 flex-1">
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
              Acesso Restrito · {mode === 'create' ? 'Cadastro de Questão' : 'Edição de Questão'}
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
              Autenticação necessária
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              Realize o login para cadastrar ou editar questões no seu banco de estudo.
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
          <div className="space-y-6 qf-animate-in">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-5">
              <div>
                <Link
                  to={mode === 'edit' && id ? `/questions/${id}` : '/questions'}
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-neutral-400 hover:text-white focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Voltar para {mode === 'edit' ? 'detalhes da questão' : 'o Banco de Questões'}
                </Link>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
                  {mode === 'create' ? 'Cadastrar Nova Questão' : 'Editar Questão'}
                </h1>
              </div>
            </div>

            {mode === 'edit' && isLoadingInitial && (
              <div
                role="status"
                className="rounded-lg border border-neutral-800 bg-neutral-950 p-8 text-sm font-mono text-neutral-400"
              >
                Carregando dados reais da questão para edição...
              </div>
            )}

            {mode === 'edit' && !isLoadingInitial && initialLoadError && (
              <div
                role="alert"
                className="rounded-lg border border-red-900/60 bg-red-950/20 p-6 text-sm text-red-200"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                  <div className="space-y-2">
                    <p className="font-semibold text-white">
                      Não foi possível carregar a questão para edição
                    </p>
                    <p className="text-xs">{initialLoadError}</p>
                    <Link
                      to="/questions"
                      className="mt-2 inline-block rounded-md border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-900"
                    >
                      Retornar ao Banco de Questões
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {(mode === 'create' || (!isLoadingInitial && !initialLoadError)) && (
              <form
                onSubmit={handleSubmit}
                noValidate
                className="space-y-6 rounded-lg border border-neutral-800 bg-neutral-950 p-6 sm:p-8"
              >
                {(validationError || submitError) && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-md border border-red-900/60 bg-red-950/20 p-4 text-xs text-red-200"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                    <span>{validationError ?? submitError}</span>
                  </div>
                )}

                {/* Seção 1: Enunciado e Classificação Principal */}
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="question-statement"
                      className="block text-xs font-semibold uppercase tracking-wider text-neutral-300"
                    >
                      Enunciado da questão *
                    </label>
                    <textarea
                      id="question-statement"
                      rows={5}
                      required
                      value={statement}
                      onChange={(e) => setStatement(e.target.value)}
                      placeholder="Digite o texto integral do enunciado da questão..."
                      className="mt-1.5 w-full rounded-md border border-neutral-800 bg-[#0A0A0A] p-3 text-sm text-white placeholder-neutral-500 focus:border-[#2563EB] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label
                        htmlFor="question-subject"
                        className="block text-xs font-medium text-neutral-300"
                      >
                        Disciplina *
                      </label>
                      <input
                        id="question-subject"
                        type="text"
                        required
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Ex.: Direito Constitucional"
                        className="mt-1.5 w-full rounded-md border border-neutral-800 bg-[#0A0A0A] px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-[#2563EB] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="question-topic"
                        className="block text-xs font-medium text-neutral-300"
                      >
                        Assunto (opcional)
                      </label>
                      <input
                        id="question-topic"
                        type="text"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        placeholder="Ex.: Direitos e Garantias Fundamentais"
                        className="mt-1.5 w-full rounded-md border border-neutral-800 bg-[#0A0A0A] px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-[#2563EB] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="question-subtopic"
                        className="block text-xs font-medium text-neutral-300"
                      >
                        Subtópico (opcional)
                      </label>
                      <input
                        id="question-subtopic"
                        type="text"
                        value={subtopic}
                        onChange={(e) => setSubtopic(e.target.value)}
                        placeholder="Ex.: Remédios Constitucionais"
                        className="mt-1.5 w-full rounded-md border border-neutral-800 bg-[#0A0A0A] px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-[#2563EB] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label
                        htmlFor="question-type"
                        className="block text-xs font-medium text-neutral-300"
                      >
                        Formato da questão
                      </label>
                      <select
                        id="question-type"
                        value={type}
                        onChange={(e) => setType(e.target.value as QuestionType)}
                        className="mt-1.5 w-full rounded-md border border-neutral-800 bg-[#0A0A0A] px-3 py-2 text-sm text-white focus:border-[#2563EB] focus:outline-none"
                      >
                        <option value="MULTIPLE_CHOICE">Múltipla Escolha</option>
                        <option value="TRUE_FALSE">Certo / Errado</option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="question-difficulty"
                        className="block text-xs font-medium text-neutral-300"
                      >
                        Dificuldade (opcional)
                      </label>
                      <select
                        id="question-difficulty"
                        value={difficulty}
                        onChange={(e) =>
                          setDifficulty(e.target.value as QuestionDifficulty | '')
                        }
                        className="mt-1.5 w-full rounded-md border border-neutral-800 bg-[#0A0A0A] px-3 py-2 text-sm text-white focus:border-[#2563EB] focus:outline-none"
                      >
                        <option value="">Não informada (null)</option>
                        <option value="EASY">Fácil</option>
                        <option value="MEDIUM">Média</option>
                        <option value="HARD">Difícil</option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="question-status"
                        className="block text-xs font-medium text-neutral-300"
                      >
                        Status do registro
                      </label>
                      <select
                        id="question-status"
                        value={questionStatus}
                        onChange={(e) => setQuestionStatus(e.target.value as QuestionStatus)}
                        className="mt-1.5 w-full rounded-md border border-neutral-800 bg-[#0A0A0A] px-3 py-2 text-sm text-white focus:border-[#2563EB] focus:outline-none"
                      >
                        <option value="ACTIVE">Ativa</option>
                        <option value="DRAFT">Rascunho</option>
                        <option value="NEEDS_REVIEW">Requer Revisão</option>
                        <option value="ARCHIVED">Arquivada</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Seção 2: Metadados da Prova / Origem (Opcionais) */}
                <div className="border-t border-neutral-900 pt-5">
                  <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-400">
                    Origem / Metadados da Prova (Opcional)
                  </h2>
                  <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-4">
                    <div>
                      <label
                        htmlFor="question-board"
                        className="block text-xs font-medium text-neutral-300"
                      >
                        Banca
                      </label>
                      <input
                        id="question-board"
                        type="text"
                        value={board}
                        onChange={(e) => setBoard(e.target.value)}
                        placeholder="Ex.: CEBRASPE"
                        className="mt-1.5 w-full rounded-md border border-neutral-800 bg-[#0A0A0A] px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-[#2563EB] focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label
                        htmlFor="question-examTitle"
                        className="block text-xs font-medium text-neutral-300"
                      >
                        Concurso / Prova
                      </label>
                      <input
                        id="question-examTitle"
                        type="text"
                        value={examTitle}
                        onChange={(e) => setExamTitle(e.target.value)}
                        placeholder="Ex.: TCU - Auditor Federal 2025"
                        className="mt-1.5 w-full rounded-md border border-neutral-800 bg-[#0A0A0A] px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-[#2563EB] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="question-year"
                        className="block text-xs font-medium text-neutral-300"
                      >
                        Ano
                      </label>
                      <input
                        id="question-year"
                        type="number"
                        min={1950}
                        max={2100}
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        placeholder="Ex.: 2025"
                        className="mt-1.5 w-full rounded-md border border-neutral-800 bg-[#0A0A0A] px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-[#2563EB] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Seção 3: Alternativas Dinâmicas */}
                <div className="border-t border-neutral-900 pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-400">
                        Alternativas da Questão
                      </h2>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        Adicione as opções da questão. Quando informadas, são necessárias pelo menos
                        2 alternativas com letras distintas.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddAlternative}
                      disabled={alternatives.length >= 10}
                      className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-[#0A0A0A] px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-900 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                    >
                      <Plus className="h-3.5 w-3.5 text-[#2563EB]" />
                      Adicionar alternativa
                    </button>
                  </div>

                  {alternatives.length === 0 ? (
                    <p className="mt-3 rounded border border-neutral-900 bg-[#0A0A0A] p-3 text-xs text-neutral-500">
                      Nenhuma alternativa adicionada (ex.: item de julgamento sem opções listadas).
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2.5">
                      {alternatives.map((alt, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-2.5 rounded-md border border-neutral-900 bg-[#0A0A0A] p-2.5"
                        >
                          <div className="w-20 shrink-0">
                            <label
                              htmlFor={`alt-letter-${index}`}
                              className="sr-only"
                            >
                              Letra da alternativa {index + 1}
                            </label>
                            <input
                              id={`alt-letter-${index}`}
                              type="text"
                              maxLength={8}
                              value={alt.letter}
                              onChange={(e) =>
                                handleAlternativeChange(index, 'letter', e.target.value)
                              }
                              aria-label={`Letra da alternativa ${index + 1}`}
                              className="w-full rounded border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-center font-mono text-xs font-bold text-white focus:border-[#2563EB] focus:outline-none"
                            />
                          </div>

                          <div className="flex-1">
                            <label htmlFor={`alt-text-${index}`} className="sr-only">
                              Texto da alternativa {index + 1}
                            </label>
                            <input
                              id={`alt-text-${index}`}
                              type="text"
                              value={alt.text}
                              onChange={(e) =>
                                handleAlternativeChange(index, 'text', e.target.value)
                              }
                              aria-label={`Texto da alternativa ${index + 1}`}
                              placeholder={`Texto da alternativa ${alt.letter || index + 1}...`}
                              className="w-full rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-sm text-white placeholder-neutral-500 focus:border-[#2563EB] focus:outline-none"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveAlternative(index)}
                            aria-label={`Remover alternativa ${alt.letter || index + 1}`}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-neutral-800 text-neutral-400 hover:border-red-900/60 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Seção 4: Gabarito e Explicação (Protegidos por padrão na visualização) */}
                <div className="border-t border-neutral-900 pt-5 space-y-4">
                  <div>
                    <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-400">
                      Gabarito e Comentário de Resolução (Opcional)
                    </h2>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Estes campos permanecem ocultos por padrão durante a listagem e visualização
                      de estudo.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label
                        htmlFor="question-correctAnswer"
                        className="block text-xs font-medium text-neutral-300"
                      >
                        Resposta correta (ex.: A, B, C, CERTO)
                      </label>
                      <input
                        id="question-correctAnswer"
                        type="text"
                        maxLength={8}
                        value={correctAnswer}
                        onChange={(e) => setCorrectAnswer(e.target.value.toUpperCase())}
                        placeholder="Ex.: A"
                        className="mt-1.5 w-full rounded-md border border-neutral-800 bg-[#0A0A0A] px-3 py-2 font-mono text-sm text-white placeholder-neutral-500 focus:border-[#2563EB] focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label
                        htmlFor="question-explanation"
                        className="block text-xs font-medium text-neutral-300"
                      >
                        Explicação / Fundamentação (opcional)
                      </label>
                      <textarea
                        id="question-explanation"
                        rows={3}
                        value={explanation}
                        onChange={(e) => setExplanation(e.target.value)}
                        placeholder="Fundamentação teórica ou comentário do gabarito..."
                        className="mt-1.5 w-full rounded-md border border-neutral-800 bg-[#0A0A0A] p-3 text-sm text-white placeholder-neutral-500 focus:border-[#2563EB] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-neutral-800 pt-5">
                  <Link
                    to={mode === 'edit' && id ? `/questions/${id}` : '/questions'}
                    className="rounded-md border border-neutral-800 px-4 py-2.5 text-xs font-medium text-neutral-300 hover:bg-neutral-900 hover:text-white focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                  >
                    Cancelar
                  </Link>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 rounded-md bg-[#2563EB] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                  >
                    <Save className="h-4 w-4" />
                    {isSubmitting
                      ? 'Salvando...'
                      : mode === 'create'
                        ? 'Cadastrar questão'
                        : 'Salvar alterações'}
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
