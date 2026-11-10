import { Router } from 'express';
import { createHealthRouter, type HealthCheckDependencies } from './health.routes.ts';
import { createReadyController, createLiveController } from '../controllers/health.controller.ts';
import { createAuthRouter, type AuthRouterDependencies } from './auth.routes.ts';
import {
  createQuestionRouter,
  type QuestionRouterDependencies,
} from './question.routes.ts';
import {
  createPdfDocumentRouter,
  type PdfDocumentRouterDependencies,
} from './pdf-document.routes.ts';
import {
  createOfficialAnswerKeyRouter,
  type OfficialAnswerKeyRouterDependencies,
} from './official-answer-key.routes.ts';
import {
  createSimulationRouter,
  type SimulationRouterDependencies,
} from './simulation.routes.ts';
import {
  createStudyActivityRouter,
  type StudyActivityRouterDependencies,
} from './activity.routes.ts';
import {
  createDashboardRouter,
  type DashboardRouterDependencies,
} from './dashboard.routes.ts';
import {
  createEducationalAiRouter,
  type EducationalAiRouterDependencies,
} from './educational-ai.routes.ts';

export interface ApiRouterDependencies {
  health?: HealthCheckDependencies;
  auth?: AuthRouterDependencies;
  questions?: QuestionRouterDependencies;
  documents?: PdfDocumentRouterDependencies;
  officialAnswerKeys?: OfficialAnswerKeyRouterDependencies;
  simulations?: SimulationRouterDependencies;
  activities?: StudyActivityRouterDependencies;
  dashboard?: DashboardRouterDependencies;
  educationalAi?: EducationalAiRouterDependencies;
}

export function createApiRouter(deps?: ApiRouterDependencies): Router {
  const apiRouter = Router();

  apiRouter.use('/health', createHealthRouter(deps?.health));
  apiRouter.get('/live', createLiveController());
  apiRouter.get('/ready', createReadyController(deps?.health));
  apiRouter.use('/auth', createAuthRouter(deps?.auth));
  apiRouter.use(
    '/questions',
    createQuestionRouter({
      authService: deps?.questions?.authService ?? deps?.auth?.authService,
      questionService: deps?.questions?.questionService,
    })
  );
  apiRouter.use(
    '/documents',
    createPdfDocumentRouter({
      authService: deps?.documents?.authService ?? deps?.auth?.authService,
      pdfDocumentService: deps?.documents?.pdfDocumentService,
      aiExtractionService: deps?.documents?.aiExtractionService,
      multipartOptions: deps?.documents?.multipartOptions,
    })
  );
  apiRouter.use(
    '/official-answer-keys',
    createOfficialAnswerKeyRouter({
      authService: deps?.officialAnswerKeys?.authService ?? deps?.auth?.authService,
      officialAnswerKeyService: deps?.officialAnswerKeys?.officialAnswerKeyService,
    })
  );
  apiRouter.use(
    '/answer-keys',
    createOfficialAnswerKeyRouter({
      authService: deps?.officialAnswerKeys?.authService ?? deps?.auth?.authService,
      officialAnswerKeyService: deps?.officialAnswerKeys?.officialAnswerKeyService,
    })
  );
  apiRouter.use(
    '/simulations',
    createSimulationRouter({
      authService: deps?.simulations?.authService ?? deps?.auth?.authService,
      simulationService: deps?.simulations?.simulationService,
    })
  );
  apiRouter.use(
    '/activities',
    createStudyActivityRouter({
      authService: deps?.activities?.authService ?? deps?.auth?.authService,
      studyActivityService: deps?.activities?.studyActivityService,
      streakService: deps?.activities?.streakService,
    })
  );
  apiRouter.use(
    '/dashboard',
    createDashboardRouter({
      authService: deps?.dashboard?.authService ?? deps?.auth?.authService,
      dashboardService: deps?.dashboard?.dashboardService,
    })
  );
  apiRouter.use(
    '/educational-ai',
    createEducationalAiRouter({
      authService: deps?.educationalAi?.authService ?? deps?.auth?.authService,
      educationalAiService: deps?.educationalAi?.educationalAiService,
      rateLimiter: deps?.educationalAi?.rateLimiter,
      rateLimitOptions: deps?.educationalAi?.rateLimitOptions,
    })
  );

  // Catch-all para rotas de API inexistentes (/api/*) para nunca cair no fallback HTML do SPA
  apiRouter.use((_req, res) => {
    res.status(404).json({
      error: 'NotFound',
      message: 'Endpoint da API não encontrado.',
    });
  });

  return apiRouter;
}

export const apiRouter = createApiRouter();
