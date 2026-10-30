import { Calendar, Flame, Trophy } from 'lucide-react';

interface DashboardStreakBannerProps {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
}

export function formatStreakDateUtc(dateStr: string | null): string {
  if (!dateStr) return 'Nenhuma atividade registrada ainda';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return `${day}/${month}/${year}`;
  }
  return dateStr;
}

export function DashboardStreakBanner({
  currentStreak,
  longestStreak,
  lastActivityDate,
}: DashboardStreakBannerProps) {
  const streakText = currentStreak === 1 ? '1 dia consecutivo' : `${currentStreak} dias consecutivos`;
  const formattedLastDate = formatStreakDateUtc(lastActivityDate);

  return (
    <section
      aria-labelledby="streak-heading"
      data-testid="dashboard-streak-banner"
      className="flex flex-col gap-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-4">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border ${
            currentStreak > 0
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
              : 'border-neutral-800 bg-neutral-950 text-neutral-500'
          }`}
          aria-hidden="true"
        >
          <Flame className="h-6 w-6" />
        </div>
        <div>
          <h2 id="streak-heading" className="text-xs font-medium uppercase tracking-wider text-neutral-400">
            Sequência de Estudos (Streak)
          </h2>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span
              data-testid="current-streak-value"
              className="text-xl font-bold tracking-tight text-white tabular-nums sm:text-2xl"
            >
              {streakText}
            </span>
            {currentStreak === 0 && (
              <span className="text-xs text-neutral-400">
                (Realize um simulado para iniciar sua sequência)
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6 border-t border-neutral-800/80 pt-3 text-xs text-neutral-400 sm:border-t-0 sm:pt-0">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-neutral-400" aria-hidden="true" />
          <span>
            Recorde:{' '}
            <strong
              data-testid="longest-streak-value"
              className="font-semibold text-neutral-200 tabular-nums"
            >
              {longestStreak} {longestStreak === 1 ? 'dia' : 'dias'}
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-neutral-400" aria-hidden="true" />
          <span>
            Última atividade:{' '}
            <span
              data-testid="last-activity-date-value"
              className="text-neutral-300 tabular-nums"
            >
              {formattedLastDate}
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
