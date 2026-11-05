import { HelpCircle, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import type { EducationalTrendAnalysisDTO, TrendDirection } from '../../types/index.ts';

interface EducationalTrendCardProps {
  trend: EducationalTrendAnalysisDTO;
}

export function formatTrendDirection(direction: TrendDirection): {
  label: string;
  icon: typeof TrendingUp;
  badgeClass: string;
} {
  switch (direction) {
    case 'IMPROVING':
      return {
        label: 'Evolução Positiva (Alta)',
        icon: TrendingUp,
        badgeClass: 'text-emerald-400 border-emerald-900/40 bg-emerald-950/20',
      };
    case 'DECLINING':
      return {
        label: 'Atenção ao Ritmo (Queda)',
        icon: TrendingDown,
        badgeClass: 'text-red-400 border-red-900/40 bg-red-950/20',
      };
    case 'STABLE':
      return {
        label: 'Desempenho Estável',
        icon: Minus,
        badgeClass: 'text-blue-400 border-blue-900/40 bg-blue-950/20',
      };
    case 'INSUFFICIENT_DATA':
    default:
      return {
        label: 'Amostra em Construção',
        icon: HelpCircle,
        badgeClass: 'text-neutral-400 border-neutral-800 bg-neutral-900/20',
      };
  }
}

export function EducationalTrendCard({ trend }: EducationalTrendCardProps) {
  const { label, icon: Icon, badgeClass } = formatTrendDirection(trend.direction);

  const formattedDelta =
    trend.deltaPercentage !== null
      ? `${trend.deltaPercentage > 0 ? '+' : ''}${trend.deltaPercentage.toLocaleString('pt-BR', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}%`
      : null;

  return (
    <div
      data-testid="educational-trend-card"
      className="flex flex-col justify-between rounded-lg border border-neutral-800 bg-neutral-950 p-6"
    >
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-md border ${badgeClass}`}
              aria-hidden="true"
            >
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Evolução Temporal</h3>
              <p className="text-xs text-neutral-400">
                Tendência comparada entre simulados recentes e histórico anterior
              </p>
            </div>
          </div>

          {formattedDelta && (
            <span
              data-testid="trend-delta-value"
              className="font-mono text-sm font-bold text-white"
            >
              {formattedDelta}
            </span>
          )}
        </div>

        <div className="mt-5">
          <span
            data-testid="trend-direction-badge"
            className="text-xs font-mono font-medium text-neutral-300"
          >
            {label}
          </span>
          <p
            data-testid="trend-description"
            className="mt-2 text-xs leading-relaxed text-neutral-300"
          >
            {trend.description}
          </p>
        </div>
      </div>
    </div>
  );
}
