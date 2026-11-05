import { ArrowRight, Compass } from 'lucide-react';
import type { RecommendationItemDTO } from '../../types/index.ts';

interface EducationalRecommendationsCardProps {
  recommendations: RecommendationItemDTO[];
}

export function EducationalRecommendationsCard({
  recommendations,
}: EducationalRecommendationsCardProps) {
  return (
    <div
      data-testid="educational-recommendations-card"
      className="rounded-lg border border-neutral-800 bg-neutral-950 p-6"
    >
      <div className="flex items-center gap-2">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-md border border-blue-900/50 bg-blue-950/30 text-blue-400"
          aria-hidden="true"
        >
          <Compass className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Recomendações Práticas de Estudo</h3>
          <p className="text-xs text-neutral-400">
            Ações sugeridas para otimizar suas próximas sessões de preparação
          </p>
        </div>
      </div>

      {recommendations.length === 0 ? (
        <div className="mt-5 rounded-md border border-neutral-800/80 bg-neutral-900/20 p-4 text-xs text-neutral-400">
          Nenhuma recomendação específica no momento. Continue resolvendo questões regularmente.
        </div>
      ) : (
        <div
          data-testid="recommendations-list"
          className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          {recommendations.map((item, index) => (
            <div
              key={`${item.title}-${index}`}
              className="flex flex-col justify-between rounded-md border border-neutral-800/90 bg-neutral-900/30 p-4 transition-colors hover:border-neutral-700/80"
            >
              <div>
                <h4 className="text-sm font-semibold text-neutral-100">
                  {item.title}
                </h4>
                <p className="mt-1.5 text-xs leading-relaxed text-neutral-300">
                  {item.description}
                </p>
              </div>

              <div className="mt-4 flex items-start gap-2 border-t border-neutral-800/60 pt-3 text-xs text-blue-400">
                <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span data-testid="recommendation-action-step" className="font-medium text-neutral-200">
                  {item.actionableStep}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
