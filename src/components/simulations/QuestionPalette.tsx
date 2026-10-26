import { CheckCircle2 } from 'lucide-react';
import type { SimulationPublicQuestionDTO } from '../../types/index.ts';

interface QuestionPaletteProps {
  questions: SimulationPublicQuestionDTO[];
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  disabled?: boolean;
}

export function QuestionPalette({
  questions,
  currentIndex,
  onSelectIndex,
  disabled = false,
}: QuestionPaletteProps) {
  const total = questions.length;
  const answeredCount = questions.filter(
    (q) => q.currentAttempt?.selectedAlternativeId != null && q.currentAttempt.selectedAlternativeId !== ''
  ).length;
  const percentage = total > 0 ? Math.round((answeredCount / total) * 100) : 0;

  return (
    <aside
      aria-label="Navegador de questões"
      className="flex flex-col rounded-lg border border-neutral-800 bg-neutral-950 p-4"
    >
      <div className="flex items-center justify-between pb-3 border-b border-neutral-800/80">
        <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-neutral-400">
          Mapa de Questões
        </h2>
        <span className="text-xs font-mono font-medium text-neutral-300">
          {answeredCount}/{total} <span className="text-neutral-500">({percentage}%)</span>
        </span>
      </div>

      {/* Barra de progresso */}
      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-900"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progresso do simulado: ${percentage}% respondido`}
      >
        <div
          className="h-full bg-blue-600 transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Grid de botões */}
      <div
        className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-6 md:grid-cols-5 lg:grid-cols-5 xl:grid-cols-6 max-h-72 overflow-y-auto pr-1"
        role="group"
        aria-label="Lista de questões para navegação direta"
      >
        {questions.map((q, idx) => {
          const isCurrent = idx === currentIndex;
          const isAnswered =
            q.currentAttempt?.selectedAlternativeId != null &&
            q.currentAttempt.selectedAlternativeId !== '';
          const selectedLetter = q.currentAttempt?.selectedLetter;

          let stateStyle = 'border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200';
          if (isAnswered) {
            stateStyle = 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300 hover:border-emerald-700';
          }
          if (isCurrent) {
            stateStyle = isAnswered
              ? 'border-emerald-500 ring-2 ring-emerald-500/40 bg-emerald-900/50 text-white font-bold'
              : 'border-blue-500 ring-2 ring-blue-500/40 bg-blue-950/60 text-white font-bold';
          }

          const label = `Questão ${idx + 1}: ${
            isAnswered
              ? `respondida com alternativa ${selectedLetter || ''}`
              : 'não respondida'
          }${isCurrent ? ' (atual)' : ''}`;

          return (
            <button
              key={q.id || q.questionId || idx}
              type="button"
              disabled={disabled}
              onClick={() => onSelectIndex(idx)}
              aria-label={label}
              aria-current={isCurrent ? 'true' : undefined}
              className={`relative flex h-10 w-full flex-col items-center justify-center rounded-md border text-xs font-mono transition-all focus-visible:outline-2 focus-visible:outline-blue-500 ${stateStyle} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span>{idx + 1}</span>
              {isAnswered && (
                <span className="text-[10px] leading-none opacity-80 font-sans">
                  {selectedLetter || '✓'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legenda */}
      <div className="mt-4 pt-3 border-t border-neutral-800/80 flex flex-col gap-1.5 text-[11px] font-mono text-neutral-400">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded border border-neutral-700 bg-neutral-900" />
          <span>Não respondida</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded border border-emerald-800 bg-emerald-950/40 text-emerald-400" />
          <span>Respondida</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded border-2 border-blue-500 bg-blue-950/60" />
          <span>Questão em foco</span>
        </div>
      </div>
    </aside>
  );
}
