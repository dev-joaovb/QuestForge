import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Edit3,
  Eye,
  EyeOff,
  Lock,
  Trash2,
} from 'lucide-react';
import { Navbar } from '../components/Navbar.tsx';
import { Footer } from '../components/Footer.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import {
  ApiHttpError,
  deleteQuestion,
  fetchQuestionById,
} from '../services/api.ts';
import type {
  QuestionDifficulty,
  QuestionResponseDTO,
  QuestionStatus,
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

const STATUS_LABELS: Record<QuestionStatus, string> = {
  ACTIVE: 'Ativa',
  DRAFT: 'Rascunho',
  NEEDS_REVIEW: 'Requer Revisão',
  ARCHIVED: 'Arquivada',
};

export function QuestionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { status, sessionCheckError, refreshSession } = useAuth();

  const [question, setQuestion] = useState<QuestionResponseDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isRevealing, setIsRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadQuestionPublicView = useCallback(
    async (signal?: AbortSignal) => {
      if (status !== 'authenticated' || !id) return;
      setIsLoading(true);
      setLoadError(null);
      setRevealError(null);

      try {
        const result = await fetchQuestionById(id, {
          includeAnswer: false,
          signal,
        });
        if (signal?.aborted) return;
        setQuestion(result);
      } catch (error) {
        if (signal?.aborted) return;
        if (error instanceof ApiHttpError && error.status === 401) {
          await refreshSession();
          return;
        }
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar os detalhes da questão.'
        );
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [status, id, refreshSession]
  );

  useEffect(() => {
    if (status !== 'authenticated') return;
    const controller = new AbortController();
    loadQuestionPublicView(controller.signal);
    return () => controller.abort();
  }, [status, loadQuestionPublicView]);

  const handleRevealAnswer = async () => {
    if (!id || !question) return;
    setIsRevealing(true);
    setRevealError(null);

    try {
      const revealed = await fetchQuestionById(id, { includeAnswer: true });
      if (!revealed.answerKeyRevealed) {
        setRevealError('O servidor não autorizou a revelação do gabarito para esta sessão.');
        return;
      }
      setQuestion(revealed);
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 401) {
        await refreshSession();
        return;
      }
      setRevealError(
        error instanceof Error
          ? error.message
          : 'Não foi possível revelar o gabarito desta questão.'
      );
    } finally {
      setIsRevealing(false);
    }
  };

  const handleHideAnswer = () => {
    if (!question) return;
    setRevealError(null);
    // Remove os campos sensíveis da memória local do componente voltando para o DTO público
    const {
      id: qId,
      userId,
      examId,
      originalNumber,
      statement,
      type,
      subject,
      topic,
      subtopic,
      board,
      examTitle,
      year,
      difficulty,
      sourcePage,
      status: qStatus,
      hasAnswerKey,
      hasExplanation,
      alternatives,
      createdAt,
      updatedAt,
    } = question;

    setQuestion({
      id: qId,
      userId,
      examId,
      originalNumber,
      statement,
      type,
      subject,
      topic,
      subtopic,
      board,
      examTitle,
      year,
      difficulty,
      sourcePage,
      status: qStatus,
      hasAnswerKey,
      hasExplanation,
      alternatives,
      createdAt,
      updatedAt,
      answerKeyRevealed: false,
    });
  };

  const handleConfirmDelete = async () => {
    if (!id) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteQuestion(id);
      navigate('/questions');
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 401) {
        await refreshSession();
        return;
      }
      setDeleteError(
        error instanceof Error
          ? error.message
          : 'Não foi possível excluir a questão no momento.'
      );
    } finally {
      setIsDeleting(false);
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
              Acesso Restrito · Detalhes da Questão
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
              Autenticação necessária
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              Realize o login para visualizar os detalhes desta questão.
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
                  to="/questions"
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-neutral-400 hover:text-white focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Voltar para o Banco de Questões
                </Link>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
                  Detalhes da Questão
                </h1>
              </div>

              {question && (
                <div className="flex flex-wrap items-center gap-2.5">
                  <Link
                    to={`/questions/${question.id}/edit`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs font-medium text-neutral-200 hover:bg-neutral-900 hover:text-white focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Editar questão
                  </Link>

                  {!confirmDelete ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs font-medium text-neutral-300 hover:border-red-900/60 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Excluir
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-1.5">
                      <span className="text-xs text-neutral-300">Confirmar exclusão?</span>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={handleConfirmDelete}
                        className="rounded bg-[#2563EB] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-50"
                      >
                        {isDeleting ? 'Excluindo...' : 'Confirmar exclusão'}
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => setConfirmDelete(false)}
                        className="rounded border border-neutral-800 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-900"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {deleteError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-md border border-red-900/60 bg-red-950/20 p-4 text-xs text-red-200"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <span>{deleteError}</span>
              </div>
            )}

            {isLoading && (
              <div
                role="status"
                className="rounded-lg border border-neutral-800 bg-neutral-950 p-8 text-sm font-mono text-neutral-400"
              >
                Carregando detalhes da questão...
              </div>
            )}

            {!isLoading && loadError && (
              <div
                role="alert"
                className="rounded-lg border border-red-900/60 bg-red-950/20 p-6 text-sm text-red-200"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                  <div className="space-y-2">
                    <p className="font-semibold text-white">
                      Não foi possível exibir a questão solicitada
                    </p>
                    <p className="text-xs">{loadError}</p>
                    <Link
                      to="/questions"
                      className="mt-2 inline-block rounded-md border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-900"
                    >
                      Voltar ao Banco de Questões
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {!isLoading && !loadError && question && (
              <div className="space-y-6">
                {/* Card Principal da Questão */}
                <article className="rounded-lg border border-neutral-800 bg-neutral-950 p-6 sm:p-8">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-900 pb-4 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">{question.subject}</span>
                      {question.topic && (
                        <span className="text-neutral-400">· {question.topic}</span>
                      )}
                      {question.subtopic && (
                        <span className="text-neutral-500">· {question.subtopic}</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 font-mono text-neutral-400">
                      <span>{TYPE_LABELS[question.type]}</span>
                      {question.difficulty && (
                        <span>· Dificuldade: {DIFFICULTY_LABELS[question.difficulty]}</span>
                      )}
                      <span>· Status: {STATUS_LABELS[question.status]}</span>
                    </div>
                  </div>

                  {(question.board || question.examTitle || question.year) && (
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-mono text-neutral-400">
                      {question.board && <span>Banca: {question.board}</span>}
                      {question.examTitle && <span>Prova: {question.examTitle}</span>}
                      {question.year && <span>Ano: {question.year}</span>}
                    </div>
                  )}

                  <div className="mt-5 whitespace-pre-line text-base leading-relaxed text-neutral-100">
                    {question.statement}
                  </div>

                  {question.alternatives.length > 0 && (
                    <div className="mt-6 space-y-2.5 border-t border-neutral-900 pt-5">
                      <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-400">
                        Alternativas
                      </h2>
                      <ol className="space-y-2" aria-label="Alternativas da questão">
                        {question.alternatives.map((alt) => {
                          const isCorrectRevealed =
                            question.answerKeyRevealed &&
                            question.correctAnswer === alt.letter;

                          return (
                            <li
                              key={alt.id}
                              className={`flex items-start gap-3 rounded-md border p-3.5 text-sm ${
                                isCorrectRevealed
                                  ? 'border-[#2563EB] bg-[#2563EB]/10 text-white'
                                  : 'border-neutral-800 bg-[#0A0A0A] text-neutral-200'
                              }`}
                            >
                              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-neutral-700 bg-neutral-900 font-mono text-xs font-bold text-white">
                                {alt.letter}
                              </span>
                              <span className="leading-relaxed">{alt.text}</span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  )}
                </article>

                {/* Seção de Proteção e Revelação Explícita do Gabarito */}
                <section
                  aria-label="Gabarito e comentário da questão"
                  className="rounded-lg border border-neutral-800 bg-neutral-950 p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                      <Lock className="h-4 w-4 text-[#2563EB]" />
                      <div>
                        <h2 className="text-sm font-semibold text-white">
                          Política de Proteção do Gabarito
                        </h2>
                        <p className="text-xs text-neutral-400">
                          O gabarito e a fundamentação ficam ocultos por padrão para preservar o
                          estudo ativo.
                        </p>
                      </div>
                    </div>

                    {!question.answerKeyRevealed ? (
                      <button
                        type="button"
                        disabled={isRevealing}
                        onClick={handleRevealAnswer}
                        className="inline-flex items-center gap-2 rounded-md bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {isRevealing ? 'Consultando gabarito...' : 'Revelar gabarito'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleHideAnswer}
                        className="inline-flex items-center gap-2 rounded-md border border-neutral-800 bg-[#0A0A0A] px-4 py-2 text-xs font-medium text-neutral-200 hover:bg-neutral-900 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                        Ocultar gabarito
                      </button>
                    )}
                  </div>

                  {revealError && (
                    <div
                      role="alert"
                      className="mt-4 flex items-start gap-2.5 rounded-md border border-red-900/60 bg-red-950/20 p-3.5 text-xs text-red-200"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                      <span>{revealError}</span>
                    </div>
                  )}

                  {question.answerKeyRevealed && (
                    <div className="mt-5 space-y-3 border-t border-neutral-900 pt-4 text-sm">
                      <div className="rounded border border-neutral-800 bg-[#0A0A0A] p-4">
                        <span className="text-xs font-mono uppercase text-neutral-400">
                          Resposta Correta Confirmada pelo Servidor
                        </span>
                        <p className="mt-1 font-mono text-base font-bold text-white">
                          {question.correctAnswer ?? 'Gabarito não cadastrado nesta questão.'}
                        </p>
                      </div>

                      {question.explanation && (
                        <div className="rounded border border-neutral-800 bg-[#0A0A0A] p-4">
                          <span className="text-xs font-mono uppercase text-neutral-400">
                            Fundamentação / Comentário
                          </span>
                          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-neutral-200">
                            {question.explanation}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
