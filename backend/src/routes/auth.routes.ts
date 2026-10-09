import { Router } from 'express';
import {
  createAuthController,
  type AuthControllerDependencies,
} from '../controllers/auth.controller.ts';
import { createRequireAuthMiddleware } from '../middlewares/auth.middleware.ts';
import {
  createAuthRateLimiter,
  type AuthRateLimitOptions,
} from '../middlewares/rate-limit.middleware.ts';

export interface AuthRouterDependencies extends AuthControllerDependencies {
  rateLimit?: AuthRateLimitOptions;
}

export function createAuthRouter(deps: AuthRouterDependencies = {}): Router {
  const router = Router();
  const controller = createAuthController(deps);
  const requireAuth = createRequireAuthMiddleware(deps.authService);
  const sensitiveAuthLimiter = createAuthRateLimiter(deps.rateLimit);

  router.post('/register', sensitiveAuthLimiter, controller.register);
  router.post('/login', sensitiveAuthLimiter, controller.login);
  router.post('/logout', controller.logout);
  router.get('/me', requireAuth, controller.me);

  return router;
}

export const authRouter = createAuthRouter();
