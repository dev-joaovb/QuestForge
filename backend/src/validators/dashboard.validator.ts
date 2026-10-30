import { z } from 'zod';
import { DashboardDomainError } from '../types/dashboard.types.ts';

/**
 * Esquema estrito para a consulta do resumo do dashboard.
 * Não aceita nenhum parâmetro na query string (ex: userId ou outros),
 * prevenindo tentativas de spoofing ou ambiguidades de filtro.
 */
export const dashboardSummaryQuerySchema = z.object({}).strict();

/**
 * Valida que a query string da requisição não contém parâmetros não autorizados.
 */
export function validateDashboardSummaryQuery(rawQuery: unknown): void {
  const result = dashboardSummaryQuerySchema.safeParse(rawQuery);
  if (!result.success) {
    throw new DashboardDomainError(
      'DASHBOARD_INVALID_INPUT',
      'O endpoint de resumo do dashboard não aceita parâmetros de consulta.',
      400,
      result.error.issues
    );
  }
}
