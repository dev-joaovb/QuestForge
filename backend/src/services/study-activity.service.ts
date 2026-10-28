import type { PrismaClient, StudyActivity, UserStreak } from '@prisma/client';
import {
  type IStudyActivityRepository,
  type IUserStreakRepository,
  type RecordStudyActivityInput,
  type RecordActivityOutput,
  StudyActivityDomainError,
} from '../types/activity.types.ts';
import { PrismaStudyActivityRepository } from '../repositories/study-activity.repository.ts';
import { PrismaUserStreakRepository } from '../repositories/user-streak.repository.ts';
import {
  PrismaSimulationRepository,
  type ISimulationRepository,
} from '../repositories/simulation.repository.ts';
import {
  PrismaQuestionRepository,
  type IQuestionRepository,
} from '../repositories/question.repository.ts';
import {
  PrismaExamRepository,
  type IExamRepository,
} from '../repositories/exam.repository.ts';
import { StreakService } from './streak.service.ts';
import { logger } from '../utils/logger.ts';
import { getPrismaClient } from '../config/database.ts';

export interface StudyActivityServiceDependencies {
  studyActivityRepository?: IStudyActivityRepository;
  userStreakRepository?: IUserStreakRepository;
  streakService?: StreakService;
  simulationRepository?: ISimulationRepository;
  questionRepository?: IQuestionRepository;
  examRepository?: IExamRepository;
  prisma?: PrismaClient;
}

export class StudyActivityService {
  private readonly studyActivityRepository: IStudyActivityRepository;
  private readonly userStreakRepository: IUserStreakRepository;
  private readonly streakService: StreakService;
  private readonly simulationRepository: ISimulationRepository;
  private readonly questionRepository: IQuestionRepository;
  private readonly examRepository: IExamRepository;
  private readonly prisma?: PrismaClient;

  constructor(deps: StudyActivityServiceDependencies = {}) {
    this.studyActivityRepository =
      deps.studyActivityRepository ?? new PrismaStudyActivityRepository();
    this.userStreakRepository =
      deps.userStreakRepository ?? new PrismaUserStreakRepository();
    this.streakService =
      deps.streakService ?? new StreakService(this.userStreakRepository);
    this.simulationRepository =
      deps.simulationRepository ?? new PrismaSimulationRepository();
    this.questionRepository =
      deps.questionRepository ?? new PrismaQuestionRepository();
    this.examRepository =
      deps.examRepository ?? new PrismaExamRepository();

    if (deps.prisma) {
      this.prisma = deps.prisma;
    } else if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '') {
      try {
        this.prisma = getPrismaClient();
      } catch {
        this.prisma = undefined;
      }
    }
  }

  /**
   * Registra uma atividade de estudo persistida e avança atomicamente o streak do usuário.
   * Valida estritamente a titularidade do recurso (simulado, questão ou prova) e garante
   * idempotência para finalizações duplicadas de simulado.
   *
   * Se chamada sem `txRepos`, utiliza `prisma.$transaction` para agrupar atividade, lock e streak.
   * Se chamada com `txRepos` fornecidos, utiliza a transação já aberta sem criar transação aninhada.
   */
  async recordActivity(
    input: RecordStudyActivityInput,
    txRepos?: {
      studyActivityRepo?: IStudyActivityRepository;
      userStreakRepo?: IUserStreakRepository;
    }
  ): Promise<RecordActivityOutput> {
    if (txRepos?.studyActivityRepo && txRepos?.userStreakRepo) {
      // Repositórios transacionais já fornecidos pelo chamador: não abre transação aninhada
      return this.recordActivityInternal(input, {
        studyActivityRepo: txRepos.studyActivityRepo,
        userStreakRepo: txRepos.userStreakRepo,
      });
    }

    // Chamada avulsa sem repositórios transacionais injetados:
    // Se o cliente Prisma com $transaction estiver disponível, agrupa atomicamente no mesmo tx
    if (this.prisma && typeof this.prisma.$transaction === 'function') {
      return await this.prisma.$transaction(async (tx) => {
        return this.recordActivityInternal(input, {
          studyActivityRepo: new PrismaStudyActivityRepository(tx),
          userStreakRepo: new PrismaUserStreakRepository(tx),
        });
      });
    }

    // Fallback para repositórios padrão ou ambiente de mock isolado
    return this.recordActivityInternal(input, {
      studyActivityRepo: txRepos?.studyActivityRepo ?? this.studyActivityRepository,
      userStreakRepo: txRepos?.userStreakRepo ?? this.userStreakRepository,
    });
  }

  private async recordActivityInternal(
    input: RecordStudyActivityInput,
    repos: {
      studyActivityRepo: IStudyActivityRepository;
      userStreakRepo: IUserStreakRepository;
    }
  ): Promise<RecordActivityOutput> {
    const userId = input.userId?.trim();
    if (!userId) {
      throw new StudyActivityDomainError(
        'INVALID_USER_ID',
        'Identificador de usuário obrigatório para registro de atividade.',
        400
      );
    }

    const { studyActivityRepo: activityRepo, userStreakRepo: streakRepo } = repos;

    // 1. Idempotência e validação para Simulado
    if (input.simulationId) {
      const cleanSimId = input.simulationId.trim();
      const existing = await activityRepo.findBySimulationId(cleanSimId);
      if (existing) {
        logger.info('activity_already_recorded_for_simulation', {
          simulationId: cleanSimId,
          activityId: existing.id,
          userId,
        });

        // Obtém o streak atual sem re-incrementar
        const currentStreak = await streakRepo.findByUserId(userId);
        const transition = this.streakService.calculateStreakTransition(
          currentStreak,
          existing.completedAt
        );

        return {
          activity: existing,
          streak: currentStreak ?? {
            id: `streak-${userId}`,
            userId,
            currentStreak: 0,
            longestStreak: 0,
            lastActivityDate: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          transition,
          wasCreated: false,
        };
      }

      // Validação de titularidade real no banco
      if (!input.skipResourceValidation) {
        let simulation = await this.simulationRepository.findByIdAndUser(
          cleanSimId,
          userId
        );
        if (!simulation && this.simulationRepository.findByIdWithFullDetails) {
          simulation = (await this.simulationRepository.findByIdWithFullDetails(
            cleanSimId,
            userId
          )) as any;
        }
        if (!simulation && this.simulationRepository.findById) {
          const found = await this.simulationRepository.findById(cleanSimId);
          if (found && found.userId === userId) {
            simulation = found;
          }
        }
        if (!simulation) {
          throw new StudyActivityDomainError(
            'SIMULATION_NOT_FOUND',
            'Simulado não encontrado ou não pertence ao usuário.',
            404,
            { simulationId: cleanSimId, userId }
          );
        }
      }
    }

    // 2. Validação de titularidade real para Questão
    if (input.questionId) {
      const cleanQId = input.questionId.trim();
      const question = await this.questionRepository.findById(cleanQId);
      if (!question || question.userId !== userId) {
        throw new StudyActivityDomainError(
          'QUESTION_NOT_FOUND',
          'Questão não encontrada ou não pertence ao usuário.',
          404,
          { questionId: cleanQId, userId }
        );
      }
    }

    // 3. Validação de titularidade real para Prova (Exam)
    if (input.examId) {
      const cleanExamId = input.examId.trim();
      const exam = await this.examRepository.findById(cleanExamId);
      if (!exam || exam.userId !== userId) {
        throw new StudyActivityDomainError(
          'EXAM_NOT_FOUND',
          'Prova não encontrada ou não pertence ao usuário.',
          404,
          { examId: cleanExamId, userId }
        );
      }
    }

    const completedAt = input.completedAt ?? new Date();

    // 4. Cria a atividade de estudo no repositório persistente
    const createResult = await activityRepo.create({
      ...input,
      userId,
      completedAt,
    });

    const { activity, wasCreated } = createResult;

    if (!wasCreated) {
      logger.info('activity_preexisting_streak_not_advanced', {
        userId,
        simulationId: input.simulationId,
        activityId: activity.id,
      });

      const currentStreak = await streakRepo.findByUserId(userId);
      const transition = this.streakService.calculateStreakTransition(
        currentStreak,
        activity.completedAt
      );

      return {
        activity,
        streak: currentStreak ?? {
          id: `streak-${userId}`,
          userId,
          currentStreak: 0,
          longestStreak: 0,
          lastActivityDate: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        transition,
        wasCreated: false,
      };
    }

    // 5. Atualiza o streak sob row lock exclusivo na mesma transação APENAS se foi recém-criada
    const { streak, transition } = await this.streakService.advanceStreakAtomic(
      userId,
      completedAt,
      streakRepo
    );

    return { activity, streak, transition, wasCreated: true };
  }
}
