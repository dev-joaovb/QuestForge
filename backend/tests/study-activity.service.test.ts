import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StudyActivityService } from '../src/services/study-activity.service.ts';
import { StreakService } from '../src/services/streak.service.ts';
import {
  MockStudyActivityRepository,
  PrismaStudyActivityRepository,
} from '../src/repositories/study-activity.repository.ts';
import { MockUserStreakRepository } from '../src/repositories/user-streak.repository.ts';
import { SimulationService } from '../src/services/simulation.service.ts';
import type { ISimulationRepository } from '../src/repositories/simulation.repository.ts';
import type { IQuestionAttemptRepository } from '../src/repositories/question-attempt.repository.ts';
import type { IQuestionRepository } from '../src/repositories/question.repository.ts';
import type { IExamRepository } from '../src/repositories/exam.repository.ts';
import type { SimulationWithFullDetails } from '../src/types/simulation.types.ts';
import { StudyActivityDomainError } from '../src/types/activity.types.ts';
import { Prisma } from '@prisma/client';

describe('StudyActivityService & Simulation Finalization — Sprint 7.1', () => {
  let activityRepo: MockStudyActivityRepository;
  let streakRepo: MockUserStreakRepository;
  let streakService: StreakService;
  let mockSimulationRepo: ISimulationRepository;
  let mockQuestionRepo: IQuestionRepository;
  let mockExamRepo: IExamRepository;
  let studyActivityService: StudyActivityService;

  beforeEach(() => {
    activityRepo = new MockStudyActivityRepository();
    streakRepo = new MockUserStreakRepository();
    streakService = new StreakService(streakRepo);

    mockSimulationRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByIdAndUser: vi.fn().mockImplementation(async (id: string, userId: string) => {
        if (id === 'sim-user-1' && userId === 'user-1') {
          return { id: 'sim-user-1', userId: 'user-1', status: 'COMPLETED' } as any;
        }
        if (id === 'sim-user-2' && userId === 'user-2') {
          return { id: 'sim-user-2', userId: 'user-2', status: 'COMPLETED' } as any;
        }
        return null;
      }),
      findByIdWithQuestions: vi.fn(),
      findByIdWithFullDetails: vi.fn(),
      findManyByUser: vi.fn(),
      update: vi.fn(),
      updateIfStatus: vi.fn(),
      delete: vi.fn(),
      countByUserAndStatus: vi.fn(),
      executeInSimulationLock: vi.fn(),
    };

    mockQuestionRepo = {
      create: vi.fn(),
      findById: vi.fn().mockImplementation(async (id: string) => {
        if (id === 'q-user-1') {
          return { id: 'q-user-1', userId: 'user-1', alternatives: [] } as any;
        }
        if (id === 'q-user-2') {
          return { id: 'q-user-2', userId: 'user-2', alternatives: [] } as any;
        }
        return null;
      }),
      findManyByUser: vi.fn(),
      updateAtomically: vi.fn(),
      deleteById: vi.fn(),
    };

    mockExamRepo = {
      findById: vi.fn().mockImplementation(async (id: string) => {
        if (id === 'exam-user-1') {
          return { id: 'exam-user-1', userId: 'user-1' } as any;
        }
        if (id === 'exam-user-2') {
          return { id: 'exam-user-2', userId: 'user-2' } as any;
        }
        return null;
      }),
      findByIdAndUser: vi.fn().mockImplementation(async (id: string, userId: string) => {
        if (id === 'exam-user-1' && userId === 'user-1') {
          return { id: 'exam-user-1', userId: 'user-1' } as any;
        }
        return null;
      }),
    };

    studyActivityService = new StudyActivityService({
      studyActivityRepository: activityRepo,
      userStreakRepository: streakRepo,
      streakService,
      simulationRepository: mockSimulationRepo,
      questionRepository: mockQuestionRepo,
      examRepository: mockExamRepo,
    });
  });

  describe('Validações de Titularidade e Isolamento Multiusuário', () => {
    it('1. deve gravar atividade de simulado pertencente ao próprio usuário', async () => {
      const res = await studyActivityService.recordActivity({
        userId: 'user-1',
        type: 'SIMULATION',
        simulationId: 'sim-user-1',
        completedAt: new Date('2026-10-28T12:00:00Z'),
      });

      expect(res.activity.id).toBeDefined();
      expect(res.activity.simulationId).toBe('sim-user-1');
      expect(res.streak.currentStreak).toBe(1);
      expect(res.transition.action).toBe('STARTED');
    });

    it('2. deve rejeitar gravação de atividade para simulado de outro usuário (404)', async () => {
      await expect(
        studyActivityService.recordActivity({
          userId: 'user-1',
          type: 'SIMULATION',
          simulationId: 'sim-user-2', // pertence a user-2
        })
      ).rejects.toThrow(StudyActivityDomainError);
    });

    it('3. deve rejeitar gravação de atividade para questão de outro usuário (404)', async () => {
      await expect(
        studyActivityService.recordActivity({
          userId: 'user-1',
          type: 'QUESTION',
          questionId: 'q-user-2', // pertence a user-2
        })
      ).rejects.toThrow(StudyActivityDomainError);
    });

    it('4. deve rejeitar gravação de atividade para prova de outro usuário (404)', async () => {
      await expect(
        studyActivityService.recordActivity({
          userId: 'user-1',
          type: 'EXAM',
          examId: 'exam-user-2', // pertence a user-2
        })
      ).rejects.toThrow(StudyActivityDomainError);
    });
  });

  describe('Idempotência de Atividades', () => {
    it('5. chamadas repetidas para o mesmo simulado retornam a mesma atividade e não duplicam streak', async () => {
      const date = new Date('2026-10-28T12:00:00Z');

      const first = await studyActivityService.recordActivity({
        userId: 'user-1',
        type: 'SIMULATION',
        simulationId: 'sim-user-1',
        completedAt: date,
      });

      expect(first.wasCreated).toBe(true);
      expect(first.streak.currentStreak).toBe(1);
      expect(activityRepo.activities.length).toBe(1);

      // Segunda chamada com mesmo simulationId
      const second = await studyActivityService.recordActivity({
        userId: 'user-1',
        type: 'SIMULATION',
        simulationId: 'sim-user-1',
        completedAt: date,
      });

      expect(second.wasCreated).toBe(false);
      expect(second.activity.id).toBe(first.activity.id);
      expect(second.streak.currentStreak).toBe(1);
      expect(activityRepo.activities.length).toBe(1);
    });

    it('5b. chamada repetida após commit com data de dia consecutivo NÃO incrementa o streak', async () => {
      const day1 = new Date('2026-10-28T12:00:00Z');
      const day2 = new Date('2026-10-29T12:00:00Z');

      const first = await studyActivityService.recordActivity({
        userId: 'user-1',
        type: 'SIMULATION',
        simulationId: 'sim-user-1',
        completedAt: day1,
      });

      expect(first.wasCreated).toBe(true);
      expect(first.streak.currentStreak).toBe(1);

      // Repetição do mesmo simulado porém com completedAt no dia seguinte
      const second = await studyActivityService.recordActivity({
        userId: 'user-1',
        type: 'SIMULATION',
        simulationId: 'sim-user-1',
        completedAt: day2,
      });

      expect(second.wasCreated).toBe(false);
      expect(second.activity.id).toBe(first.activity.id);
      // Streak DEVE continuar 1, pois a atividade já existia e não pode ser re-pontuada
      expect(second.streak.currentStreak).toBe(1);
      const storedStreak = await streakRepo.findByUserId('user-1');
      expect(storedStreak?.currentStreak).toBe(1);
    });
  });

  describe('Concorrência Lógica de Múltiplos Simulados do Mesmo Usuário', () => {
    it('6. dois simulados diferentes do mesmo usuário finalizados simultaneamente no mesmo dia não duplicam streak', async () => {
      // Configurar dois simulados do mesmo usuário
      (mockSimulationRepo.findByIdAndUser as any).mockImplementation(async (id: string, userId: string) => {
        if ((id === 'sim-A' || id === 'sim-B') && userId === 'user-1') {
          return { id, userId, status: 'COMPLETED' } as any;
        }
        return null;
      });

      const today = new Date('2026-10-28T15:00:00Z');

      // Executa concurrentemente
      const [resA, resB] = await Promise.all([
        studyActivityService.recordActivity({
          userId: 'user-1',
          type: 'SIMULATION',
          simulationId: 'sim-A',
          completedAt: today,
        }),
        studyActivityService.recordActivity({
          userId: 'user-1',
          type: 'SIMULATION',
          simulationId: 'sim-B',
          completedAt: today,
        }),
      ]);

      expect(activityRepo.activities.length).toBe(2);
      expect(resA.activity.id).not.toBe(resB.activity.id);

      const finalStreak = await streakRepo.findByUserId('user-1');
      expect(finalStreak?.currentStreak).toBe(1);
      expect(finalStreak?.longestStreak).toBe(1);
    });
  });

  describe('Integração com SimulationService (finishSimulation, expiração e abandono)', () => {
    let mockAttemptRepo: IQuestionAttemptRepository;
    let simulationService: SimulationService;

    const createBaseSimulation = (
      id: string,
      status: any,
      attempts: any[] = []
    ): SimulationWithFullDetails => ({
      id,
      userId: 'user-1',
      title: 'Simulado Teste',
      status,
      totalQuestions: 2,
      timeLimitSeconds: 3600,
      startedAt: new Date(Date.now() - 1000 * 60),
      finishedAt: null,
      durationSeconds: null,
      scorePercentage: null,
      correctCount: null,
      wrongCount: null,
      unansweredCount: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      questions: [
        {
          id: 'sq-1',
          simulationId: id,
          questionId: 'q-1',
          position: 1,
          answerKeySnapshot: 'A',
          isAnnulledSnapshot: false,
          snapshotSource: 'QUESTION_BANK',
          officialAnswerKeyId: null,
          officialAnswerKeyItemId: null,
          officialAnswerKeyVersion: null,
          createdAt: new Date(),
          question: {
            id: 'q-1',
            userId: 'user-1',
            examId: null,
            originalNumber: 1,
            statement: 'Q1',
            type: 'MULTIPLE_CHOICE',
            subject: 'Dir',
            topic: null,
            subtopic: null,
            board: null,
            examTitle: null,
            year: null,
            difficulty: null,
            correctAnswer: 'A',
            explanation: null,
            sourcePage: null,
            status: 'ACTIVE',
            createdAt: new Date(),
            updatedAt: new Date(),
            alternatives: [],
          },
        },
        {
          id: 'sq-2',
          simulationId: id,
          questionId: 'q-2',
          position: 2,
          answerKeySnapshot: 'B',
          isAnnulledSnapshot: false,
          snapshotSource: 'QUESTION_BANK',
          officialAnswerKeyId: null,
          officialAnswerKeyItemId: null,
          officialAnswerKeyVersion: null,
          createdAt: new Date(),
          question: {
            id: 'q-2',
            userId: 'user-1',
            examId: null,
            originalNumber: 2,
            statement: 'Q2',
            type: 'MULTIPLE_CHOICE',
            subject: 'Dir',
            topic: null,
            subtopic: null,
            board: null,
            examTitle: null,
            year: null,
            difficulty: null,
            correctAnswer: 'B',
            explanation: null,
            sourcePage: null,
            status: 'ACTIVE',
            createdAt: new Date(),
            updatedAt: new Date(),
            alternatives: [],
          },
        },
      ],
      attempts,
    });

    beforeEach(() => {
      mockAttemptRepo = {
        upsertAttempt: vi.fn(),
        findBySimulationAndQuestion: vi.fn(),
        findManyBySimulation: vi.fn(),
        countAttempts: vi.fn(),
        deleteBySimulation: vi.fn(),
      };

      const mockSimMap = new Map<string, SimulationWithFullDetails>();

      mockSimulationRepo.findByIdWithFullDetails = vi.fn().mockImplementation(
        async (id: string, userId: string) => {
          const sim = mockSimMap.get(id);
          if (sim && sim.userId === userId) {
            return JSON.parse(JSON.stringify(sim));
          }
          return null;
        }
      );

      mockSimulationRepo.findByIdAndUser = vi.fn().mockImplementation(
        async (id: string, userId: string) => {
          const sim = mockSimMap.get(id);
          if (sim && sim.userId === userId) {
            return JSON.parse(JSON.stringify(sim));
          }
          return null;
        }
      );

      mockSimulationRepo.update = vi.fn().mockImplementation(
        async (id: string, userId: string, data: any) => {
          const sim = mockSimMap.get(id);
          if (sim && sim.userId === userId) {
            Object.assign(sim, data);
            return JSON.parse(JSON.stringify(sim));
          }
          throw new Error('Not found');
        }
      );

      mockSimulationRepo.updateIfStatus = vi.fn().mockImplementation(
        async (id: string, userId: string, expectedStatuses: string[], data: any) => {
          const sim = mockSimMap.get(id);
          if (sim && sim.userId === userId && expectedStatuses.includes(sim.status)) {
            Object.assign(sim, data);
            return JSON.parse(JSON.stringify(sim));
          }
          return null;
        }
      );

      mockSimulationRepo.executeInSimulationLock = vi.fn().mockImplementation(
        async (_simId: string, _userId: string, action: any) => {
          return action(mockSimulationRepo, mockAttemptRepo, {
            studyActivityRepo: activityRepo,
            userStreakRepo: streakRepo,
          });
        }
      );

      simulationService = new SimulationService({
        simulationRepository: mockSimulationRepo,
        questionAttemptRepository: mockAttemptRepo,
        questionRepository: mockQuestionRepo,
        studyActivityRepository: activityRepo,
        userStreakRepository: streakRepo,
        studyActivityService,
      });

      // Registrar simulados no Map em memória do teste
      const sim1 = createBaseSimulation('sim-1', 'IN_PROGRESS', [
        {
          id: 'att-1',
          userId: 'user-1',
          simulationId: 'sim-1',
          questionId: 'q-1',
          selectedAlternativeId: 'alt-1',
          selectedLetter: 'A',
          isCorrect: true,
          timeSpentSeconds: 30,
          answeredAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          selectedAlternative: null,
        },
      ]);
      mockSimMap.set('sim-1', sim1);

      const simExpiredWithAnswers = createBaseSimulation('sim-exp-answered', 'IN_PROGRESS', [
        {
          id: 'att-2',
          userId: 'user-1',
          simulationId: 'sim-exp-answered',
          questionId: 'q-1',
          selectedAlternativeId: 'alt-1',
          selectedLetter: 'A',
          isCorrect: true,
          timeSpentSeconds: 30,
          answeredAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          selectedAlternative: null,
        },
      ]);
      // Simula tempo limite expirado
      simExpiredWithAnswers.startedAt = new Date(Date.now() - 5000 * 1000);
      mockSimMap.set('sim-exp-answered', simExpiredWithAnswers);

      const simExpiredZeroAnswers = createBaseSimulation('sim-exp-zero', 'IN_PROGRESS', []);
      simExpiredZeroAnswers.startedAt = new Date(Date.now() - 5000 * 1000);
      mockSimMap.set('sim-exp-zero', simExpiredZeroAnswers);

      const simAbandon = createBaseSimulation('sim-abandon', 'IN_PROGRESS', []);
      mockSimMap.set('sim-abandon', simAbandon);
    });

    it('7. finishSimulation: finaliza o simulado e gera StudyActivity com streak incrementado', async () => {
      const result = await simulationService.finishSimulation('user-1', 'sim-1');

      expect(result.status).toBe('COMPLETED');
      expect(result.correctCount).toBe(1);

      // Verifica atividade gravada no repositório
      const activities = await activityRepo.findByUser('user-1');
      expect(activities.length).toBe(1);
      expect(activities[0].simulationId).toBe('sim-1');
      expect(activities[0].type).toBe('SIMULATION');

      // Verifica streak atualizado
      const streak = await streakRepo.findByUserId('user-1');
      expect(streak?.currentStreak).toBe(1);
      expect(streak?.longestStreak).toBe(1);
    });

    it('8. finishSimulation repetido é idempotente e não duplica atividade', async () => {
      await simulationService.finishSimulation('user-1', 'sim-1');
      const secondCall = await simulationService.finishSimulation('user-1', 'sim-1');

      expect(secondCall.status).toBe('COMPLETED');
      const activities = await activityRepo.findByUser('user-1');
      expect(activities.length).toBe(1);

      const streak = await streakRepo.findByUserId('user-1');
      expect(streak?.currentStreak).toBe(1);
    });

    it('9. Simulado EXPIRED com ao menos uma resposta gera StudyActivity e avança streak', async () => {
      const result = await simulationService.finishSimulation('user-1', 'sim-exp-answered');

      expect(result.status).toBe('EXPIRED');
      const activities = await activityRepo.findByUser('user-1');
      expect(activities.some((a) => a.simulationId === 'sim-exp-answered')).toBe(true);

      const streak = await streakRepo.findByUserId('user-1');
      expect(streak?.currentStreak).toBe(1);
    });

    it('10. Simulado EXPIRED sem nenhuma resposta NÃO gera StudyActivity nem avança streak', async () => {
      const result = await simulationService.finishSimulation('user-1', 'sim-exp-zero');

      expect(result.status).toBe('EXPIRED');
      const activities = await activityRepo.findByUser('user-1');
      expect(activities.some((a) => a.simulationId === 'sim-exp-zero')).toBe(false);

      const streak = await streakRepo.findByUserId('user-1');
      expect(streak).toBeNull();
    });

    it('11. Simulado abandonado NÃO gera StudyActivity nem avança streak', async () => {
      const summary = await simulationService.abandonSimulation('user-1', 'sim-abandon');

      expect(summary.status).toBe('ABANDONED');
      const activities = await activityRepo.findByUser('user-1');
      expect(activities.length).toBe(0);

      const streak = await streakRepo.findByUserId('user-1');
      expect(streak).toBeNull();
    });

    it('12. Falha na gravação da atividade dentro da transação propaga erro e cancela finalização', async () => {
      // Mockar falha no repositório de atividade
      activityRepo.create = vi.fn().mockRejectedValue(new Error('DB Connection Timeout'));

      await expect(
        simulationService.finishSimulation('user-1', 'sim-1')
      ).rejects.toThrow('DB Connection Timeout');
    });
  });

  describe('Tratamento de Colisão P2002 no Repositório Prisma', () => {
    it('13. deve lançar StudyActivityDomainError com ACTIVITY_ALREADY_EXISTS (409) sem tentar nova consulta no tx abortado', async () => {
      const mockFindUnique = vi.fn();
      const mockClient = {
        studyActivity: {
          create: vi.fn().mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
              code: 'P2002',
              clientVersion: '5.x',
            })
          ),
          findUnique: mockFindUnique,
        },
      } as any;

      const prismaRepo = new PrismaStudyActivityRepository(mockClient);

      await expect(
        prismaRepo.create({
          userId: 'user-1',
          type: 'SIMULATION',
          simulationId: 'sim-duplicate',
        })
      ).rejects.toThrow(StudyActivityDomainError);

      try {
        await prismaRepo.create({
          userId: 'user-1',
          type: 'SIMULATION',
          simulationId: 'sim-duplicate',
        });
      } catch (err: any) {
        expect(err.code).toBe('ACTIVITY_ALREADY_EXISTS');
        expect(err.statusCode).toBe(409);
      }

      // CRÍTICO: Não deve chamar findUnique no cliente transacional abortado
      expect(mockFindUnique).not.toHaveBeenCalled();
    });
  });

  describe('Atomicidade e Transações em Chamadas Avulsas', () => {
    it('14. quando recordActivity é chamado sem txRepos, agrupa atividade, lock e streak em prisma.$transaction', async () => {
      const mockTxClient = {
        studyActivity: {
          create: vi.fn().mockResolvedValue({
            id: 'act-tx-1',
            userId: 'user-1',
            type: 'QUESTION',
            questionId: 'q-user-1',
            examId: null,
            simulationId: null,
            durationSeconds: null,
            scorePercentage: null,
            correctCount: null,
            wrongCount: null,
            unansweredCount: null,
            completedAt: new Date('2026-10-28T12:00:00Z'),
            createdAt: new Date(),
          }),
          findUnique: vi.fn().mockResolvedValue(null),
        },
        userStreak: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockResolvedValue({
            id: 'streak-user-1',
            userId: 'user-1',
            currentStreak: 1,
            longestStreak: 1,
            lastActivityDate: '2026-10-28',
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
        $queryRaw: vi.fn().mockResolvedValue([{ id: 'user-1' }]),
      } as any;

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation(async (callback: any) => {
          return callback(mockTxClient);
        }),
      } as any;

      const serviceWithPrisma = new StudyActivityService({
        questionRepository: mockQuestionRepo,
        prisma: mockPrisma,
      });

      const res = await serviceWithPrisma.recordActivity({
        userId: 'user-1',
        type: 'QUESTION',
        questionId: 'q-user-1',
        completedAt: new Date('2026-10-28T12:00:00Z'),
      });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockTxClient.studyActivity.create).toHaveBeenCalledTimes(1);
      expect(mockTxClient.$queryRaw).toHaveBeenCalledTimes(1);
      expect(mockTxClient.userStreak.upsert).toHaveBeenCalledTimes(1);
      expect(res.wasCreated).toBe(true);
      expect(res.streak.currentStreak).toBe(1);
    });

    it('15. quando recordActivity é chamado COM txRepos injetados, NÃO abre prisma.$transaction aninhada', async () => {
      const mockPrisma = {
        $transaction: vi.fn(),
      } as any;

      const serviceWithPrisma = new StudyActivityService({
        simulationRepository: mockSimulationRepo,
        prisma: mockPrisma,
      });

      const res = await serviceWithPrisma.recordActivity(
        {
          userId: 'user-1',
          type: 'SIMULATION',
          simulationId: 'sim-user-1',
          completedAt: new Date('2026-10-28T12:00:00Z'),
        },
        {
          studyActivityRepo: activityRepo,
          userStreakRepo: streakRepo,
        }
      );

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(res.wasCreated).toBe(true);
      expect(res.streak.currentStreak).toBe(1);
    });
  });
});
