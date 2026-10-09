import type { Request, Response } from 'express';
import { checkDatabaseHealth, type DatabaseHealthStatus } from '../config/database.ts';
import { validateEnv } from '../config/env.ts';

export interface HealthCheckDependencies {
  checkDb?: () => Promise<DatabaseHealthStatus>;
  rawEnv?: NodeJS.ProcessEnv;
}

/**
 * Factory para o controller de Health Check.
 * Permite injeção controlada em testes unitários mantendo verificação real por padrão.
 * Distingue claramente o estado da aplicação HTTP (`app`) do estado das dependências (`dependencies`).
 */
export function createHealthController(deps: HealthCheckDependencies = {}) {
  const runDbCheck = deps.checkDb ?? (() => checkDatabaseHealth());

  return async function getHealth(_req: Request, res: Response): Promise<void> {
    const envResult = validateEnv(deps.rawEnv ?? process.env);
    const dbHealth = await runDbCheck();

    const isHealthy = dbHealth.status === 'up' && envResult.isValid;
    const overallStatus = isHealthy ? 'healthy' : 'degraded';
    const httpStatus = dbHealth.status === 'up' ? 200 : 503;

    res.status(httpStatus).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      app: {
        name: 'QuestForge API',
        status: 'up',
        environment: envResult.config.NODE_ENV ?? 'development',
      },
      dependencies: {
        database: {
          provider: 'postgresql',
          status: dbHealth.status,
          latencyMs: dbHealth.latencyMs,
          message: dbHealth.message,
        },
        environment: {
          status: envResult.isValid ? 'configured' : 'incomplete',
          missingOrInvalidCount: envResult.missingOrInvalidVars.length,
          issues: envResult.missingOrInvalidVars,
        },
      },
    });
  };
}

export const getHealth = createHealthController();
