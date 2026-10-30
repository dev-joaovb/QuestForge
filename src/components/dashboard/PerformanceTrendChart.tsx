import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { SimulationEvolutionPointDTO } from '../../types/index.ts';

interface PerformanceTrendChartProps {
  evolution: SimulationEvolutionPointDTO[];
}

export function formatEvolutionDate(isoString: string | null): string {
  if (!isoString) return 'Data não registrada';
  try {
    const match = isoString.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, , month, day] = match;
      return `${day}/${month}`;
    }
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  } catch {
    return isoString;
  }
}

export function PerformanceTrendChart({ evolution }: PerformanceTrendChartProps) {
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);

  // Considera até os últimos 10 simulados na ordem cronológica recebida do backend
  const data = evolution.slice(-10);

  if (data.length === 0) {
    return (
      <section
        aria-labelledby="performance-trend-heading"
        data-testid="performance-trend-chart-empty"
        className="flex h-full flex-col justify-between rounded-lg border border-neutral-800 bg-neutral-900/40 p-5"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-neutral-400" aria-hidden="true" />
            <h2
              id="performance-trend-heading"
              className="text-xs font-medium uppercase tracking-wider text-neutral-400"
            >
              Evolução de Desempenho
            </h2>
          </div>
        </div>

        <div className="my-10 flex flex-col items-center justify-center text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-800 bg-neutral-950 text-neutral-500">
            <TrendingUp className="h-5 w-5" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-neutral-200">
            Nenhum simulado concluído para exibir evolução
          </h3>
          <p className="mt-1 max-w-sm text-xs text-neutral-400">
            Assim que você finalizar seus primeiros simulados, a curva histórica de aproveitamento
            será traçada aqui automaticamente.
          </p>
        </div>
        <div className="h-4" />
      </section>
    );
  }

  // Dimensões do gráfico SVG
  const width = 600;
  const height = 240;
  const paddingLeft = 45;
  const paddingRight = 25;
  const paddingTop = 25;
  const paddingBottom = 40;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Função para mapear percentual de pontuação (0 a 100) para coordenada Y
  const getY = (percentage: number): number => {
    const clamped = Math.max(0, Math.min(100, percentage));
    return paddingTop + chartHeight - (clamped / 100) * chartHeight;
  };

  // Função para mapear índice do simulado para coordenada X
  const getX = (index: number): number => {
    if (data.length === 1) {
      return paddingLeft + chartWidth / 2;
    }
    return paddingLeft + (index / (data.length - 1)) * chartWidth;
  };

  // Grade horizontal: 0%, 25%, 50%, 75%, 100%
  const gridLevels = [0, 25, 50, 75, 100];

  // Construção dos segmentos de linha conectando apenas pontos válidos
  // Não conectar visualmente pontos sem scorePercentage para evitar interpretação enganosa
  const lineSegments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  let previousValidPoint: { x: number; y: number } | null = null;

  data.forEach((point, i) => {
    if (point.scorePercentage !== null && typeof point.scorePercentage === 'number') {
      const currentPoint = { x: getX(i), y: getY(point.scorePercentage) };
      if (previousValidPoint) {
        lineSegments.push({
          x1: previousValidPoint.x,
          y1: previousValidPoint.y,
          x2: currentPoint.x,
          y2: currentPoint.y,
        });
      }
      previousValidPoint = currentPoint;
    } else {
      // Ponto nulo quebra a linha
      previousValidPoint = null;
    }
  });

  return (
    <section
      aria-labelledby="performance-trend-heading"
      data-testid="performance-trend-chart"
      className="flex flex-col justify-between rounded-lg border border-neutral-800 bg-neutral-900/40 p-5 transition-colors hover:border-neutral-700"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
          <h2
            id="performance-trend-heading"
            className="text-xs font-medium uppercase tracking-wider text-neutral-400"
          >
            Evolução de Desempenho
          </h2>
        </div>
        <span className="text-xs text-neutral-400 tabular-nums">
          {data.length} {data.length === 1 ? 'simulado avaliado' : 'últimos simulados'}
        </span>
      </div>

      {/* Tabela acessível para leitores de tela */}
      <table className="sr-only">
        <caption>Evolução cronológica de aproveitamento nos últimos simulados</caption>
        <thead>
          <tr>
            <th scope="col">Simulado</th>
            <th scope="col">Título</th>
            <th scope="col">Aproveitamento</th>
            <th scope="col">Acertos/Erros</th>
            <th scope="col">Data</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item, idx) => (
            <tr key={item.id}>
              <td>{idx + 1}</td>
              <td>{item.title || 'Simulado'}</td>
              <td>
                {item.scorePercentage !== null
                  ? `${item.scorePercentage.toLocaleString('pt-BR', {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}%`
                  : 'Nota não apurada'}
              </td>
              <td>
                {item.correctCount} acertos de {item.totalQuestions} questões
              </td>
              <td>{formatEvolutionDate(item.finishedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Gráfico SVG nativo */}
      <div className="relative mt-4 w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full select-none"
          role="img"
          aria-label={`Gráfico de linha mostrando a evolução de pontuação dos últimos ${data.length} simulados`}
        >
          {/* Linhas da grade e rótulos do eixo Y */}
          {gridLevels.map((level) => {
            const y = getY(level);
            return (
              <g key={level} className="text-neutral-600">
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity={level === 0 || level === 100 ? '0.3' : '0.15'}
                  strokeDasharray={level === 0 || level === 100 ? undefined : '3 3'}
                  strokeWidth="1"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-neutral-400 text-[10px] tabular-nums"
                >
                  {level}%
                </text>
              </g>
            );
          })}

          {/* Segmentos de linha de evolução */}
          {lineSegments.map((seg, idx) => (
            <line
              key={`seg-${idx}`}
              x1={seg.x1}
              y1={seg.y1}
              x2={seg.x2}
              y2={seg.y2}
              stroke="#2563EB"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          ))}

          {/* Pontos de dados e rótulos do eixo X */}
          {data.map((item, idx) => {
            const cx = getX(idx);
            const hasScore = item.scorePercentage !== null && typeof item.scorePercentage === 'number';
            const cy = hasScore ? getY(item.scorePercentage as number) : paddingTop + chartHeight;
            const dateLabel = formatEvolutionDate(item.finishedAt);
            const scoreLabel = hasScore
              ? `${(item.scorePercentage as number).toLocaleString('pt-BR', {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}%`
              : 'Sem nota';
            const isActive = activePointIndex === idx;

            return (
              <g key={item.id} className="group">
                {/* Linha vertical pontilhada guia quando ativo */}
                {isActive && (
                  <line
                    x1={cx}
                    y1={paddingTop}
                    x2={cx}
                    y2={paddingTop + chartHeight}
                    stroke="#2563EB"
                    strokeOpacity="0.4"
                    strokeDasharray="2 2"
                    strokeWidth="1"
                  />
                )}

                {/* Ponto SVG no gráfico */}
                {hasScore ? (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isActive ? 6 : 4}
                    fill="#2563EB"
                    stroke="#0A0A0A"
                    strokeWidth="2"
                    tabIndex={0}
                    data-testid={`chart-point-${idx}`}
                    aria-label={`Simulado ${idx + 1}: ${item.title || 'Simulado'}, ${scoreLabel}, data: ${dateLabel}`}
                    onMouseEnter={() => setActivePointIndex(idx)}
                    onMouseLeave={() => setActivePointIndex(null)}
                    onFocus={() => setActivePointIndex(idx)}
                    onBlur={() => setActivePointIndex(null)}
                    className="cursor-pointer transition-all duration-150 focus:outline-none focus:stroke-white"
                  >
                    <title>{`Simulado ${idx + 1}: ${scoreLabel} (${dateLabel})`}</title>
                  </circle>
                ) : (
                  // Indicador discreto para ponto sem nota
                  <circle
                    cx={cx}
                    cy={cy}
                    r={3}
                    fill="transparent"
                    stroke="#737373"
                    strokeDasharray="2 2"
                    strokeWidth="1.5"
                    tabIndex={0}
                    data-testid={`chart-point-${idx}`}
                    aria-label={`Simulado ${idx + 1}: sem nota registrada, data: ${dateLabel}`}
                    className="cursor-pointer focus:outline-none"
                  >
                    <title>{`Simulado ${idx + 1}: sem nota (${dateLabel})`}</title>
                  </circle>
                )}

                {/* Rótulo do eixo X com data abreviada */}
                <text
                  x={cx}
                  y={height - 12}
                  textAnchor="middle"
                  className="fill-neutral-400 text-[10px] tabular-nums"
                >
                  {dateLabel}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Detalhe interativo / Tooltip acessível do ponto selecionado */}
        {activePointIndex !== null && data[activePointIndex] && (
          <div
            data-testid="chart-active-tooltip"
            className="mt-2 flex items-center justify-between rounded border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-300"
          >
            <span className="font-medium text-white truncate max-w-[200px]">
              {data[activePointIndex].title || `Simulado #${activePointIndex + 1}`}
            </span>
            <div className="flex items-center gap-3 tabular-nums">
              <span>
                Nota:{' '}
                <strong className="text-white">
                  {data[activePointIndex].scorePercentage !== null
                    ? `${(data[activePointIndex].scorePercentage as number).toLocaleString('pt-BR', {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}%`
                    : 'Não avaliado'}
                </strong>
              </span>
              <span className="text-neutral-400">
                {data[activePointIndex].correctCount}/{data[activePointIndex].totalQuestions} acertos
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
