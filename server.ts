import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createApp } from './backend/src/app.ts';
import { validateEnv } from './backend/src/config/env.ts';
import { logger } from './backend/src/utils/logger.ts';

/**
 * Valida se um valor representa uma porta TCP válida (inteiro estrito entre 1 e 65535).
 * Rejeita 0, números negativos, valores > 65535, decimais/floats, NaN, Infinity e textos inválidos.
 */
export function isValidTcpPort(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 1 && value <= 65535;
  }
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return false;
  }
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535;
}

/**
 * Determina a porta TCP para inicialização do servidor com a seguinte precedência:
 * 1. Argumentos de linha de comando: `--port <val>`, `-p <val>` ou `--port=<val>`
 * 2. Variável de ambiente `PORT` (respeitada se válida, diferente de 8080 que é reservada pelo proxy Nginx)
 * 3. Fallback seguro: porta 3000
 *
 * Rejeita valores não inteiros, fora da faixa [1, 65535], decimais ou strings inválidas.
 */
export function parsePort(
  args: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env
): number {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' || arg === '-p') {
      const nextArg = args[i + 1];
      if (nextArg && isValidTcpPort(nextArg)) {
        return Number(nextArg.trim());
      }
    }
    if (arg.startsWith('--port=')) {
      const val = arg.slice(7);
      if (isValidTcpPort(val)) {
        return Number(val.trim());
      }
    }
  }

  // Port 8080 is reserved by the container reverse proxy/nginx.
  // The dev server MUST run on port 3000.
  const envPortStr = env.PORT;
  if (envPortStr && isValidTcpPort(envPortStr)) {
    const envPort = Number(envPortStr.trim());
    if (envPort !== 8080) {
      return envPort;
    }
  }

  return 3000;
}

/**
 * Determina o host de inicialização do servidor com suporte a `--host <val>` e `--host=<val>`.
 */
export function parseHost(args: string[] = process.argv): string {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--host' || arg === '-h') {
      const nextArg = args[i + 1];
      if (nextArg && nextArg.trim()) return nextArg.trim();
    }
    if (arg.startsWith('--host=')) {
      const val = arg.slice(7).trim();
      if (val) return val;
    }
  }
  return '0.0.0.0';
}

async function startServer() {
  const envCheck = validateEnv();
  if (!envCheck.isValid) {
    logger.warn('server_starting_with_incomplete_env', {
      missingCount: envCheck.missingOrInvalidVars.length,
      issues: envCheck.missingOrInvalidVars,
    });
  }

  const app = createApp();
  const port = parsePort();
  const host = parseHost();
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

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(port, host, () => {
      logger.info('questforge_server_started', {
        port,
        host,
        environment: process.env.NODE_ENV ?? 'development',
        envConfigured: envCheck.isValid,
      });
      resolve();
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      logger.error('questforge_server_listen_error', {
        code: error.code,
        message: error.message,
        port,
        host,
      });
      reject(error);
    });
  });
}

// Inicia o servidor automaticamente apenas quando executado diretamente como script principal
const isDirectExecution = Boolean(
  process.argv[1]?.endsWith('server.ts') && !process.env.VITEST
);

if (isDirectExecution) {
  startServer().catch((error) => {
    logger.error('questforge_server_fatal_startup_error', {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}
