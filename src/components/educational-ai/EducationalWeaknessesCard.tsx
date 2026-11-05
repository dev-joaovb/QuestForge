import { Target } from 'lucide-react';
import type { WeaknessItemDTO } from '../../types/index.ts';

interface EducationalWeaknessesCardProps {
  weaknesses: WeaknessItemDTO[];
}

export function EducationalWeaknessesCard({ weaknesses }: EducationalWeaknessesCardProps) {
  return (
    <div
      data-testid="educational-weaknesses-card"
      className="flex flex-col justify-between rounded-lg border border-neutral-800 bg-neutral-950 p-6"
    >
      <div>
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-md border border-amber-900/50 bg-amber-950/30 text-amber-400"
            aria-hidden="true"
          >
            <Target className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Pontos de Atenção</h3>
            <p className="text-xs text-neutral-400">
              Disciplinas que merecem revisão e reforço direcionado
            </p>
          </div>
        </div>

        {weaknesses.length === 0 ? (
          <div className="mt-5 rounded-md border border-neutral-800/80 bg-neutral-900/20 p-4 text-xs text-neutral-400">
            Nenhuma disciplina em zona crítica identificada. Continue respondendo questões
            para manter o monitoramento de desempenho.
          </div>
        ) : (
          <ul
            data-testid="weaknesses-list"
            className="mt-5 space-y-3.5 divide-y divide-neutral-800/60"
          >
            {weaknesses.map((item, index) => (
              <li
                key={`${item.subject}-${index}`}
                className={index > 0 ? 'pt-3.5' : ''}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-neutral-100">
                    {item.subject}
                  </span>
                  <span
                    data-testid="weakness-accuracy"
                    className="font-mono text-xs font-semibold text-amber-400"
                  >
                    {item.accuracyPercentage.toLocaleString('pt-BR', {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                    % acertos
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-neutral-400">
                  {item.description}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
