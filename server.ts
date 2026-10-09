import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createApp } from './backend/src/app.ts';
import { validateEnv } from './backend/src/config/env.ts';
import { logger } from './backend/src/utils/logger.ts';

async function startServer() {
  const envCheck = validateEnv();
  if (!envCheck.isValid) {
    logger.warn('server_starting_with_incomplete_env', {
      missingCount: envCheck.missingOrInvalidVars.length,
      issues: envCheck.missingOrInvalidVars,
    });
  }

  const app = createApp();
  const port = envCheck.config.PORT ?? 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(import.meta.dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    logger.info('questforge_server_started', {
      port,
      environment: process.env.NODE_ENV ?? 'development',
      envConfigured: envCheck.isValid,
    });
  });
}

startServer().catch((error) => {
  logger.error('questforge_server_fatal_startup_error', {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
