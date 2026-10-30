import { Link } from 'react-router-dom';
import { Award, CheckSquare, Clock, ExternalLink, HelpCircle, History } from 'lucide-react';
import type { StudyActivityDTO, StudyActivityType } from '../../types/index.ts';
import { formatDurationHoursMinutes } from './DashboardMetricCards.tsx';

interface RecentActivitiesListProps {
  activities: StudyActivityDTO[];
}

const TYPE_CONFIG: Record<
  StudyActivityType,
  { label: string; icon: typeof CheckSquare; badgeClass: string }
> = {
  SIMULATION: {
    label: 'Simulado',
    icon: CheckSquare,
    badgeClass: 'border-blue-900/60 bg-blue-950/40 text-blue-300',
  },
  QUESTION: {
    label: 'Questão',
    icon: HelpCircle,
    badgeClass: 'border-emerald-900/60 bg-emerald-950/40 text-emerald-300',
  },
  EXAM: {
    label: 'Prova Oficial',
    icon: Award,
    badgeClass: 'border-amber-900/60 bg-amber-950/40 text-amber-300',
  },
};

export function formatActivityDate(isoString: string): string {
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
}

export function RecentActivitiesList({ activities }: RecentActivitiesListProps) {
  // Exibir no máximo cinco atividades reais
  const displayActivities = activities.slice(0, 5);

  return (
    <section
      aria-labelledby="recent-activities-heading"
      data-testid="recent-activities-list"
      className="flex flex-col justify-between rounded-lg border border-neutral-800 bg-neutral-900/40 p-5 transition-colors hover:border-neutral-700"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
          <h2
            id="recent-activities-heading"
            className="text-xs font-medium uppercase tracking-wider text-neutral-400"
          >
            Atividades Recentes
          </h2>
        </div>
        <span className="text-xs text-neutral-400 tabular-nums">
          {displayActivities.length}{' '}
          {displayActivities.length === 1 ? 'registro' : 'últimos registros'}
        </span>
      </div>

      {displayActivities.length === 0 ? (
        <div
          data-testid="recent-activities-empty"
          className="my-10 flex flex-col items-center justify-center text-center"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-800 bg-neutral-950 text-neutral-500">
            <History className="h-5 w-5" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-neutral-200">
            Nenhuma atividade recente registrada
          </h3>
          <p className="mt-1 max-w-sm text-xs text-neutral-400">
            Suas resoluções de questões avulsas e provas de simulados realizadas aparecerão aqui.
          </p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-neutral-800/80">
          {displayActivities.map((act) => {
            const config = TYPE_CONFIG[act.type] || TYPE_CONFIG.SIMULATION;
            const IconComponent = config.icon;
            const formattedDate = formatActivityDate(act.completedAt);

            // Determina se há link para rota real do sistema
            let actionLink: { to: string; label: string } | null = null;
            if (act.type === 'SIMULATION' && act.simulationId) {
              actionLink = {
                to: `/simulations/${act.simulationId}/results`,
                label: 'Ver resultado',
              };
            } else if (act.type === 'QUESTION' && act.questionId) {
              actionLink = {
                to: `/questions/${act.questionId}`,
                label: 'Ver questão',
              };
            }

            return (
              <li
                key={act.id}
                data-testid={`activity-item-${act.id}`}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-800 bg-neutral-950 text-neutral-400">
                    <IconComponent className="h-3.5 w-3.5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${config.badgeClass}`}
                      >
                        {config.label}
                      </span>
                      <span className="text-xs text-neutral-400 tabular-nums">
                        {formattedDate}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-300 tabular-nums">
                      {act.scorePercentage !== null && (
                        <span>
                          Aproveitamento:{' '}
                          <strong className="text-white">
                            {act.scorePercentage.toLocaleString('pt-BR', {
                              minimumFractionDigits: 1,
                              maximumFractionDigits: 1,
                            })}
                            %
                          </strong>
                        </span>
                      )}

                      {act.correctCount !== null && act.wrongCount !== null && (
                        <span className="text-neutral-400">
                          ({act.correctCount} acertos, {act.wrongCount} erros)
                        </span>
                      )}

                      {act.durationSeconds !== null && act.durationSeconds > 0 && (
                        <span className="flex items-center gap-1 text-neutral-400">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          <span>{formatDurationHoursMinutes(act.durationSeconds)}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {actionLink && (
                  <div className="sm:self-center">
                    <Link
                      to={actionLink.to}
                      className="inline-flex items-center gap-1.5 rounded border border-neutral-800 bg-neutral-950 px-2.5 py-1 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-900 hover:text-white focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                    >
                      <span>{actionLink.label}</span>
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
