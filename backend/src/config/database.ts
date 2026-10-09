import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.ts';

declare global {
  // eslint-disable-next-line no-var
  var __questforgePrisma: PrismaClient | undefined;
}

export interface DatabaseHealthStatus {
  status: 'up' | 'down' | 'unconfigured';
  latencyMs: number | null;
  message: string;
}

/**
 * Retorna a instância singleton do PrismaClient quando DATABASE_URL está configurada.
 * Não realiza conexão ansiosa (eager connect) na importação do módulo.
 */
export function getPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    throw new Error('DATABASE_URL não está configurada no ambiente.');
  }

  if (!globalThis.__questforgePrisma) {
    globalThis.__questforgePrisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  return globalThis.__questforgePrisma;
}

/**
 * Verifica a conectividade real com o PostgreSQL executando `SELECT 1`.
 * Nunca expõe strings de conexão, hosts internos ou credenciais em mensagens de erro.
 */
export async function checkDatabaseHealth(
  customClient?: Pick<PrismaClient, '$queryRaw'>
): Promise<DatabaseHealthStatus> {
  if (!customClient && (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '')) {
    return {
      status: 'unconfigured',
      latencyMs: null,
      message: 'Variável DATABASE_URL ausente. Configure a conexão PostgreSQL no arquivo .env.',
    };
  }

  const startedAt = Date.now();
  try {
    const client = customClient ?? getPrismaClient();
    await client.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - startedAt;

    return {
      status: 'up',
      latencyMs,
      message: 'Conectividade com PostgreSQL verificada com sucesso.',
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    logger.error('database_health_check_failed', {
      latencyMs,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });

    return {
      status: 'down',
      latencyMs,
      message: 'Não foi possível estabelecer conexão com o PostgreSQL.',
    };
  }
}
