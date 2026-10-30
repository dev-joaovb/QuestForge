import { Award, CheckCircle2, Clock, HelpCircle } from 'lucide-react';
import type { DashboardSummaryDTO } from '../../types/index.ts';

interface DashboardMetricCardsProps {
  summary: DashboardSummaryDTO;
}

export function formatDurationHoursMinutes(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) {
    return '0h 00m';
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
}

export function DashboardMetricCards({ summary }: DashboardMetricCardsProps) {
  const cards = [
    {
      id: 'completed-simulations',
      label: 'Simulados Concluídos',
      value: summary.completedSimulationsCount.toLocaleString('pt-BR'),
      helperText: 'Provas finalizadas',
      icon: CheckCircle2,
      accentColor: 'text-blue-500',
    },
    {
      id: 'total-questions',
      label: 'Questões Respondidas',
      value: summary.totalAnsweredQuestions.toLocaleString('pt-BR'),
      helperText: 'Em simulados concluídos',
      icon: HelpCircle,
      accentColor: 'text-neutral-400',
    },
    {
      id: 'accuracy-percentage',
      label: 'Precisão Global',
      value: `${summary.accuracyPercentage.toLocaleString('pt-BR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}%`,
      helperText: `${summary.totalCorrectAnswers.toLocaleString('pt-BR')} acertos de ${summary.totalAnsweredQuestions.toLocaleString('pt-BR')}`,
      icon: Award,
      accentColor: 'text-emerald-500',
    },
    {
      id: 'total-duration',
      label: 'Tempo Dedicado',
      value: formatDurationHoursMinutes(summary.totalDurationSeconds),
      helperText: 'Em simulados concluídos',
      icon: Clock,
      accentColor: 'text-amber-500',
    },
  ];

  return (
    <section aria-labelledby="metrics-heading" className="w-full">
      <h2 id="metrics-heading" className="sr-only">
        Métricas Principais de Desempenho
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const IconComponent = card.icon;
          return (
            <div
              key={card.id}
              data-testid={`metric-card-${card.id}`}
              className="flex flex-col justify-between rounded-lg border border-neutral-800 bg-neutral-900/40 p-5 transition-colors hover:border-neutral-700"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">
                  {card.label}
                </span>
                <IconComponent className={`h-4 w-4 ${card.accentColor}`} aria-hidden="true" />
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold tracking-tight text-white tabular-nums sm:text-3xl">
                  {card.value}
                </div>
                <p className="mt-1 text-xs text-neutral-400 tabular-nums">
                  {card.helperText}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
