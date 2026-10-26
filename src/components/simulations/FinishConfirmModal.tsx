import { useEffect } from 'react';
import { AlertCircle, CheckCircle2, HelpCircle } from 'lucide-react';

interface FinishConfirmModalProps {
  isOpen: boolean;
  totalQuestions: number;
  answeredCount: number;
  unansweredCount: number;
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function FinishConfirmModal({
  isOpen,
  totalQuestions,
  answeredCount,
  unansweredCount,
  isSubmitting,
  onConfirm,
  onCancel,
}: FinishConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="finish-dialog-title"
      aria-describedby="finish-dialog-desc"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-950/60 border border-blue-800 text-blue-400">
            <HelpCircle className="h-5 w-5" />
          </div>
          <div>
            <h2 id="finish-dialog-title" className="text-lg font-bold text-white">
              Finalizar Simulado?
            </h2>
            <p id="finish-dialog-desc" className="mt-1 text-xs text-neutral-400">
              Ao confirmar a finalização, suas respostas serão consolidadas e você não poderá mais alterá-las.
            </p>
          </div>
        </div>

        {/* Resumo de respostas */}
        <div className="mt-5 space-y-3 rounded-lg border border-neutral-800/80 bg-neutral-900/50 p-4 text-xs font-mono">
          <div className="flex justify-between text-neutral-300">
            <span>Total de questões:</span>
            <span className="font-semibold text-white">{totalQuestions}</span>
          </div>
          <div className="flex justify-between text-emerald-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Respondidas:
            </span>
            <span className="font-semibold">{answeredCount}</span>
          </div>
          <div className="flex justify-between text-amber-400">
            <span className="flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> Em branco:
            </span>
            <span className="font-semibold">{unansweredCount}</span>
          </div>
        </div>

        {unansweredCount > 0 ? (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-amber-900/60 bg-amber-950/20 p-3 text-xs text-amber-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>
              Atenção: você ainda possui <strong>{unansweredCount}</strong> {unansweredCount === 1 ? 'questão' : 'questões'} sem resposta.
            </span>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-emerald-900/60 bg-emerald-950/20 p-3 text-xs text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>Excelente! Todas as {totalQuestions} questões foram preenchidas.</span>
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            className="w-full sm:w-auto rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-xs font-semibold text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50"
          >
            Voltar à Prova
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onConfirm}
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Finalizando...</span>
              </>
            ) : (
              'Confirmar e Finalizar'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
