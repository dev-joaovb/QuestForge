import {
  type DashboardSummaryDTO,
  type IDashboardRepository,
  DashboardDomainError,
  calculateAccuracyPercentage,
} from '../types/dashboard.types.ts';
import type { IStudyActivityRepository, StudyActivityDTO } from '../types/activity.types.ts';
import { StreakService } from './streak.service.ts';
import { PrismaDashboardRepository } from '../repositories/dashboard.repository.ts';
import { PrismaStudyActivityRepository } from '../repositories/study-activity.repository.ts';

export interface DashboardServiceDependencies {
  dashboardRepository?: IDashboardRepository;
  streakService?: StreakService;
  studyActivityRepository?: IStudyActivityRepository;
}

/**
 * Serviço de Agregação do Dashboard (Sprint 8.1).
 *
 * Responsável por orquestrar métricas consolidadas, série temporal de evolução
 * e atividades recentes sem operações de escrita e com isolamento estrito por usuário.
 */
export class DashboardService {
  private readonly dashboardRepository: IDashboardRepository;
  private readonly streakService: StreakService;
  private readonly studyActivityRepository: IStudyActivityRepository;

  constructor(deps: DashboardServiceDependencies = {}) {
    this.dashboardRepository =
      deps.dashboardRepository ?? new PrismaDashboardRepository();
    this.streakService = deps.streakService ?? new StreakService();
    this.studyActivityRepository =
      deps.studyActivityRepository ?? new PrismaStudyActivityRepository();
  }

  /**
   * Consulta o resumo executivo completo do Dashboard para o usuário informado.
   *
   * Operação estritamente somente de leitura (não altera dados, não avança streak,
   * não grava atividades).
   */
  async getSummary(userId: string): Promise<DashboardSummaryDTO> {
    const cleanId = userId?.trim();
    if (!cleanId) {
      throw new DashboardDomainError(
        'INVALID_USER_ID',
        'Identificador de usuário obrigatório para consulta do dashboard.',
        400
      );
    }

    // Consulta paralela eficiente no banco de dados
    const [aggregates, recentEvolution, streak, recentActivitiesRaw] = await Promise.all([
      this.dashboardRepository.getCompletedSimulationsAggregates(cleanId),
      this.dashboardRepository.getRecentCompletedSimulations(cleanId, 10),
      this.streakService.getUserStreak(cleanId),
      this.studyActivityRepository.findManyByUser(cleanId, { limit: 5, offset: 0 }),
    ]);

    const totalAnsweredQuestions = aggregates.totalCorrect + aggregates.totalWrong;
    const accuracyPercentage = calculateAccuracyPercentage(
      aggregates.totalCorrect,
      aggregates.totalWrong
    );

    const recentActivities: StudyActivityDTO[] = recentActivitiesRaw.map((item) => ({
      id: item.id,
      userId: item.userId,
      type: item.type,
      simulationId: item.simulationId,
      questionId: item.questionId,
      examId: item.examId,
      durationSeconds: item.durationSeconds,
      scorePercentage: item.scorePercentage,
      correctCount: item.correctCount,
      wrongCount: item.wrongCount,
      unansweredCount: item.unansweredCount,
      completedAt: item.completedAt,
      createdAt: item.createdAt,
    }));

    return {
      completedSimulationsCount: aggregates.completedCount,
      totalAnsweredQuestions,
      totalCorrectAnswers: aggregates.totalCorrect,
      totalWrongAnswers: aggregates.totalWrong,
      accuracyPercentage,
      totalDurationSeconds: aggregates.totalDurationSeconds,
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      lastActivityDate: streak.lastActivityDate,
      recentSimulationsEvolution: recentEvolution,
      recentActivities,
    };
  }
}
