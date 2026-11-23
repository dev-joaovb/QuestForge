import { createApp } from './app.ts';
import { validateEnv } from './config/env.ts';
import { logger } from './utils/logger.ts';

/**
 * Entrypoint exclusivo da API do QuestForge.
 * Não inicializa o Vite nem serve arquivos estáticos do frontend.
 */
async function startApiServer(): Promise<void> {
  const envCheck = validateEnv();

  if (!envCheck.isValid) {
    logger.warn('api_starting_with_incomplete_env', {
      missingCount: envCheck.missingOrInvalidVars.length,
      issues: envCheck.missingOrInvalidVars,
    });
  }

  const portValue = process.env.PORT ?? '3333';
  const port = Number(portValue);
  const host = '0.0.0.0';

  if (
    !/^\d+$/.test(portValue.trim()) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error('Invalid API port configuration');
  }

  const app = createApp();

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(port, host, () => {
      logger.info('questforge_api_started', {
        port,
        host,
        environment: process.env.NODE_ENV ?? 'development',
        envConfigured: envCheck.isValid,
      });
      resolve();
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      logger.error('questforge_api_listen_error', {
        code: error.code,
        message: error.message,
        port,
        host,
      });
      reject(error);
    });
  });
}

startApiServer().catch((error) => {
  logger.error('questforge_api_fatal_startup_error', {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
