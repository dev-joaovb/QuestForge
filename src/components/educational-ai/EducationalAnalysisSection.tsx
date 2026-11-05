import { AlertCircle, BrainCircuit, RefreshCw } from 'lucide-react';
import { useEducationalAnalysis } from '../../hooks/useEducationalAnalysis.ts';
import { EducationalSummaryCard } from './EducationalSummaryCard.tsx';
import { EducationalStrengthsCard } from './EducationalStrengthsCard.tsx';
import { EducationalWeaknessesCard } from './EducationalWeaknessesCard.tsx';
import { EducationalTrendCard } from './EducationalTrendCard.tsx';
import { EducationalRecommendationsCard } from './EducationalRecommendationsCard.tsx';
import { EducationalPrioritiesCard } from './EducationalPrioritiesCard.tsx';

interface EducationalAnalysisSectionProps {
  enabled?: boolean;
}

export function EducationalAnalysisSection({
  enabled = true,
}: EducationalAnalysisSectionProps) {
  const { analysis, isLoading, errorMessage, refetch } = useEducationalAnalysis(enabled);

  return (
    <section
      aria-labelledby="educational-analysis-heading"
      data-testid="educational-analysis-section"
      className="space-y-6 pt-2"
    >
      {/* Cabeçalho da Seção */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-neutral-800/80 pt-6">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
            <h2
              id="educational-analysis-heading"
              className="text-lg font-bold tracking-tight text-white sm:text-xl"
            >
              Diagnóstico Pedagógico & Recomendações
            </h2>
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            Avaliação orientativa de desempenho e sugestões práticas de evolução nos estudos.
          </p>
        </div>

        {analysis && !isLoading && (
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            <span>Atualizar Análise</span>
          </button>
        )}
      </div>

      {/* 1. Estado de Carregamento (Skeleton Acessível) */}
      {isLoading && (
        <div
          role="status"
          aria-live="polite"
          aria-label="Carregando análise educacional"
          data-testid="educational-analysis-loading"
          className="space-y-4"
        >
          {/* Skeleton do Resumo */}
          <div className="h-36 motion-safe:animate-pulse rounded-lg border border-neutral-800 bg-neutral-900/30" />

          {/* Skeleton de Pontos Fortes e Atenção */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="h-56 motion-safe:animate-pulse rounded-lg border border-neutral-800 bg-neutral-900/30" />
            <div className="h-56 motion-safe:animate-pulse rounded-lg border border-neutral-800 bg-neutral-900/30" />
          </div>

          {/* Skeleton de Tendência e Prioridades */}
          <div className="h-40 motion-safe:animate-pulse rounded-lg border border-neutral-800 bg-neutral-900/30" />
          <span className="sr-only">Carregando análise educacional...</span>
        </div>
      )}

      {/* 2. Estado de Erro com Botão de Retry */}
      {!isLoading && errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          data-testid="educational-analysis-error"
          className="flex flex-col gap-4 rounded-lg border border-red-900/60 bg-red-950/20 p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-semibold text-red-200">
                Não foi possível carregar a análise educacional
              </h3>
              <p className="mt-0.5 text-xs text-red-300/90">{errorMessage}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex items-center gap-2 rounded-md border border-red-800 bg-red-950/40 px-3.5 py-2 text-xs font-medium text-red-200 transition-colors hover:bg-red-900/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Tentar novamente</span>
          </button>
        </div>
      )}

      {/* 3. Conteúdo Carregado com Sucesso */}
      {!isLoading && !errorMessage && analysis && (
        <div
          data-testid="educational-analysis-content"
          className="space-y-6"
        >
          {/* Card de Resumo Principal e Transparência */}
          <EducationalSummaryCard
            summary={analysis.summary}
            source={analysis.source}
            confidenceLevel={analysis.confidenceLevel}
            generatedAt={analysis.generatedAt}
            insufficientDataNotice={analysis.insufficientDataNotice}
          />

          {/* Grid de Pontos Fortes e Pontos de Atenção */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <EducationalStrengthsCard strengths={analysis.strengths} />
            <EducationalWeaknessesCard weaknesses={analysis.weaknesses} />
          </div>

          {/* Evolução Temporal */}
          <EducationalTrendCard trend={analysis.trend} />

          {/* Recomendações Práticas */}
          <EducationalRecommendationsCard
            recommendations={analysis.recommendations}
          />

          {/* Prioridades por Disciplina */}
          <EducationalPrioritiesCard priorities={analysis.priorities} />
        </div>
      )}
    </section>
  );
}
