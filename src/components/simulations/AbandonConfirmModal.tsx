import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

interface AbandonConfirmModalProps {
  isOpen: boolean;
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AbandonConfirmModal({
  isOpen,
  isSubmitting,
  onConfirm,
  onCancel,
}: AbandonConfirmModalProps) {
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
      aria-labelledby="abandon-dialog-title"
      aria-describedby="abandon-dialog-desc"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-xl border border-red-900/60 bg-neutral-950 p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-950/60 border border-red-800 text-red-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 id="abandon-dialog-title" className="text-lg font-bold text-white">
              Abandonar Simulado?
            </h2>
            <p id="abandon-dialog-desc" className="mt-1 text-xs text-neutral-400">
              Esta ação é definitiva. Seu progresso será interrompido e você não poderá retomar este simulado posteriormente.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            className="w-full sm:w-auto rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-xs font-semibold text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50"
          >
            Continuar Simulado
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onConfirm}
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-red-500 transition-colors focus-visible:outline-2 focus-visible:outline-red-500 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Abandonando...</span>
              </>
            ) : (
              'Sim, Abandonar Simulado'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
