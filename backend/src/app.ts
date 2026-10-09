import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createApiRouter, type ApiRouterDependencies } from './routes/index.ts';
import { errorHandler } from './middlewares/error.middleware.ts';
import {
  createCsrfProtection,
  getAllowedOrigins,
  type CsrfProtectionOptions,
} from './middlewares/csrf.middleware.ts';

export interface AppDependencies extends ApiRouterDependencies {
  csrf?: CsrfProtectionOptions;
  trustProxy?: boolean | number;
}

/**
 * Cria e configura a instância Express do backend do QuestForge.
 * Mantém todas as rotas sob `/api` estritamente isoladas das rotas do frontend SPA.
 */
export function createApp(deps?: AppDependencies): Express {
  const app = express();

  // Não confia em cabeçalhos X-Forwarded-For por padrão a menos que explicitamente configurado
  app.set('trust proxy', deps?.trustProxy ?? false);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  const allowedOrigins = getAllowedOrigins(deps?.csrf?.allowedOrigins);

  app.use(
    cors({
      origin(requestOrigin, callback) {
        // Permite requisições same-origin / sem cabeçalho Origin (ex.: GET direto) ou origens na allowlist
        if (!requestOrigin || allowedOrigins.has(requestOrigin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Accept', 'X-Requested-With'],
    })
  );

  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));

  app.use('/api', createCsrfProtection(deps?.csrf), createApiRouter(deps));

  app.use(errorHandler);

  return app;
}

export const app = createApp();
