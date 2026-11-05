import { AlertCircle, Check, Flag } from 'lucide-react';
import type { StudyPriorityDTO, StudyPriorityLevel } from '../../types/index.ts';

interface EducationalPrioritiesCardProps {
  priorities: StudyPriorityDTO[];
}

export function formatPriorityMeta(level: StudyPriorityLevel): {
  label: string;
  badgeClass: string;
  dotClass: string;
} {
  switch (level) {
    case 'HIGH':
      return {
        label: 'Prioridade Alta',
        badgeClass: 'text-red-400 border-red-900/50 bg-red-950/20',
        dotClass: 'bg-red-400',
      };
    case 'MEDIUM':
      return {
        label: 'Prioridade Média',
        badgeClass: 'text-amber-400 border-amber-900/50 bg-amber-950/20',
        dotClass: 'bg-amber-400',
      };
    case 'LOW':
    default:
      return {
        label: 'Manutenção / Baixa',
        badgeClass: 'text-neutral-400 border-neutral-800 bg-neutral-900/20',
        dotClass: 'bg-neutral-400',
      };
  }
}

export function EducationalPrioritiesCard({ priorities }: EducationalPrioritiesCardProps) {
  return (
    <div
      data-testid="educational-priorities-card"
      className="rounded-lg border border-neutral-800 bg-neutral-950 p-6"
    >
      <div className="flex items-center gap-2">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-md border border-purple-900/50 bg-purple-950/30 text-purple-400"
          aria-hidden="true"
        >
          <Flag className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Prioridades por Disciplina</h3>
          <p className="text-xs text-neutral-400">
            Foco recomendado de acordo com a margem de crescimento e impacto no edital
          </p>
        </div>
      </div>

      {priorities.length === 0 ? (
        <div className="mt-5 rounded-md border border-neutral-800/80 bg-neutral-900/20 p-4 text-xs text-neutral-400">
          Nenhuma prioridade urgente identificada. Mantenha o cronograma de estudos balanceado.
        </div>
      ) : (
        <div
          data-testid="priorities-list"
          className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {priorities.map((item, index) => {
            const { label, badgeClass, dotClass } = formatPriorityMeta(item.priority);
            return (
              <div
                key={`${item.subject}-${index}`}
                data-testid={`priority-item-${item.priority.toLowerCase()}`}
                className="flex flex-col justify-between rounded-md border border-neutral-800/80 bg-neutral-900/20 p-4 transition-colors hover:border-neutral-700/80"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-white">
                      {item.subject}
                    </span>
                    <span
                      data-testid="priority-level-badge"
                      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-mono font-medium ${badgeClass}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
                      {label}
                    </span>
                  </div>

                  <p className="mt-2 text-xs leading-relaxed text-neutral-400">
                    {item.reason}
                  </p>
                </div>

                {item.targetAccuracyPercentage !== undefined && (
                  <div className="mt-4 flex items-center justify-between border-t border-neutral-800/60 pt-2.5 text-xs">
                    <span className="text-neutral-400">Meta Sugerida</span>
                    <span
                      data-testid="priority-target-accuracy"
                      className="font-mono font-semibold text-neutral-200"
                    >
                      {item.targetAccuracyPercentage}%
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
