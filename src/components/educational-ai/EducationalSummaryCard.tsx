import { AlertTriangle, Bot, Calculator, CheckCircle2, ShieldCheck } from 'lucide-react';
import type { ConfidenceLevel } from '../../types/index.ts';

interface EducationalSummaryCardProps {
  summary: string;
  source: 'AI_INFERENCE' | 'DETERMINISTIC_FALLBACK';
  confidenceLevel: ConfidenceLevel;
  generatedAt: string;
  insufficientDataNotice: string | null;
}

export function formatGeneratedDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return dateStr;
  }
}

export function formatConfidenceLabel(level: ConfidenceLevel): string {
  switch (level) {
    case 'HIGH':
      return 'Confiança Alta · Amostra Significativa';
    case 'MEDIUM':
      return 'Confiança Média · Amostra Preliminar';
    case 'LOW':
    default:
      return 'Confiança Inicial · Dados em Construção';
  }
}

export function EducationalSummaryCard({
  summary,
  source,
  confidenceLevel,
  generatedAt,
  insufficientDataNotice,
}: EducationalSummaryCardProps) {
  const isAi = source === 'AI_INFERENCE';
  const formattedDate = formatGeneratedDate(generatedAt);
  const confidenceLabel = formatConfidenceLabel(confidenceLevel);

  return (
    <div
      data-testid="educational-summary-card"
      className="rounded-lg border border-neutral-800 bg-neutral-950 p-6 sm:p-7"
    >
      {/* Metadados Superiores: Fonte e Data */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800/80 pb-4">
        <div className="flex items-center gap-2.5">
          {isAi ? (
            <div className="flex items-center gap-1.5 text-xs font-mono text-blue-400">
              <Bot className="h-4 w-4" aria-hidden="true" />
              <span data-testid="analysis-source-label">Análise com IA Educacional</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs font-mono text-amber-400">
              <Calculator className="h-4 w-4" aria-hidden="true" />
              <span data-testid="analysis-source-label">Análise Estatística Base (Regras)</span>
            </div>
          )}
          <span className="text-neutral-600" aria-hidden="true">·</span>
          <span
            data-testid="analysis-confidence-badge"
            className="text-xs font-mono text-neutral-400"
          >
            {confidenceLabel}
          </span>
        </div>

        <time
          dateTime={generatedAt}
          className="text-xs font-mono text-neutral-400"
        >
          Atualizado em {formattedDate}
        </time>
      </div>

      {/* Diagnóstico Principal */}
      <div className="mt-5">
        <h3 className="text-xs font-mono uppercase tracking-wider text-neutral-400">
          Diagnóstico Pedagógico
        </h3>
        <p
          data-testid="educational-summary-text"
          className="mt-2 text-base leading-relaxed text-neutral-200"
        >
          {summary}
        </p>
      </div>

      {/* Aviso de Dados Insuficientes (se houver) */}
      {insufficientDataNotice && (
        <div
          data-testid="insufficient-data-alert"
          role="note"
          className="mt-4 flex items-start gap-2.5 rounded-md border border-amber-900/40 bg-amber-950/20 p-3 text-xs text-amber-200/90"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
          <span>{insufficientDataNotice}</span>
        </div>
      )}

      {/* Rodapé Orientativo e Transparência */}
      <div className="mt-5 flex items-center gap-2 text-xs text-neutral-400">
        <ShieldCheck className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
        <span>
          Recomendações exclusivamente consultivas baseadas no seu histórico real.
          Questões anuladas de concursos públicos atribuem pontuação oficial por edital.
        </span>
      </div>
    </div>
  );
}
