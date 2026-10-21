import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  AnswerKeySource,
  PrismaClient,
  Simulation,
  SimulationStatus,
} from '@prisma/client';
import {
  PrismaSimulationRepository,
} from '../src/repositories/simulation.repository.ts';
import {
  SimulationDomainError,
  type CreateSimulationInput,
  type UpdateSimulationInput,
} from '../src/types/simulation.types.ts';

describe('PrismaSimulationRepository (backend/src/repositories/simulation.repository.ts)', () => {
  let mockPrisma: any;
  let repository: PrismaSimulationRepository;

  const mockDate = new Date('2026-10-20T12:00:00.000Z');

  const baseSimulation: Simulation = {
    id: 'sim-100',
    userId: 'user-1',
    title: 'Simulado PF - Agente 2026',
    status: 'CREATED' as SimulationStatus,
    totalQuestions: 2,
    timeLimitSeconds: 7200,
    startedAt: null,
    finishedAt: null,
    durationSeconds: null,
    scorePercentage: null,
    correctCount: null,
    wrongCount: null,
    unansweredCount: null,
    createdAt: mockDate,
    updatedAt: mockDate,
  };

  const mockQuestionsWithAlternatives = [
    {
      id: 'sq-1',
      simulationId: 'sim-100',
      questionId: 'q-1',
      position: 1,
      answerKeySnapshot: 'B',
      isAnnulledSnapshot: false,
      snapshotSource: 'OFFICIAL_KEY' as AnswerKeySource,
      officialAnswerKeyId: 'key-1',
      officialAnswerKeyItemId: 'item-1',
      officialAnswerKeyVersion: 1,
      createdAt: mockDate,
      question: {
        id: 'q-1',
        statement: 'Questão 1 sobre Direito Constitucional',
        alternatives: [
          { id: 'alt-1', letter: 'A', text: 'Opção A', position: 1 },
          { id: 'alt-2', letter: 'B', text: 'Opção B', position: 2 },
        ],
      },
    },
    {
      id: 'sq-2',
      simulationId: 'sim-100',
      questionId: 'q-2',
      position: 2,
      answerKeySnapshot: 'A',
      isAnnulledSnapshot: false,
      snapshotSource: 'QUESTION_BANK' as AnswerKeySource,
      officialAnswerKeyId: null,
      officialAnswerKeyItemId: null,
      officialAnswerKeyVersion: null,
      createdAt: mockDate,
      question: {
        id: 'q-2',
        statement: 'Questão 2 sobre Língua Portuguesa',
        alternatives: [
          { id: 'alt-3', letter: 'A', text: 'Opção A', position: 1 },
          { id: 'alt-4', letter: 'B', text: 'Opção B', position: 2 },
        ],
      },
    },
  ];

  beforeEach(() => {
    mockPrisma = {
      simulation: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
    };

    repository = new PrismaSimulationRepository(mockPrisma as unknown as PrismaClient);
  });

  describe('create', () => {
    it('deve persistir um simulado atômico com suas questões e snapshots no PostgreSQL via Prisma', async () => {
      const input: CreateSimulationInput = {
        userId: 'user-1',
        title: 'Simulado PF - Agente 2026',
        timeLimitSeconds: 7200,
        totalQuestions: 2,
        questions: [
          {
            questionId: 'q-1',
            position: 1,
            answerKeySnapshot: 'B',
            isAnnulledSnapshot: false,
            snapshotSource: 'OFFICIAL_KEY',
            officialAnswerKeyId: 'key-1',
            officialAnswerKeyItemId: 'item-1',
            officialAnswerKeyVersion: 1,
          },
          {
            questionId: 'q-2',
            position: 2,
            answerKeySnapshot: 'A',
            isAnnulledSnapshot: false,
            snapshotSource: 'QUESTION_BANK',
          },
        ],
      };

      const expectedResult = {
        ...baseSimulation,
        questions: mockQuestionsWithAlternatives,
      };

      mockPrisma.simulation.create.mockResolvedValue(expectedResult);

      const result = await repository.create(input);

      expect(mockPrisma.simulation.create).toHaveBeenCalledTimes(1);
      const createCall = mockPrisma.simulation.create.mock.calls[0][0];

      expect(createCall.data.userId).toBe('user-1');
      expect(createCall.data.title).toBe('Simulado PF - Agente 2026');
      expect(createCall.data.timeLimitSeconds).toBe(7200);
      expect(createCall.data.totalQuestions).toBe(2);
      expect(createCall.data.status).toBe('CREATED');
      expect(createCall.data.questions.create).toHaveLength(2);
      expect(createCall.data.questions.create[0]).toEqual({
        questionId: 'q-1',
        position: 1,
        answerKeySnapshot: 'B',
        isAnnulledSnapshot: false,
        snapshotSource: 'OFFICIAL_KEY',
        officialAnswerKeyId: 'key-1',
        officialAnswerKeyItemId: 'item-1',
        officialAnswerKeyVersion: 1,
      });

      expect(result).toEqual(expectedResult);
    });

    it('deve permitir criar simulado sem limite de tempo (estudo livre: timeLimitSeconds = null)', async () => {
      const input: CreateSimulationInput = {
        userId: 'user-1',
        title: 'Estudo Livre sem Cronômetro',
        timeLimitSeconds: null,
        totalQuestions: 1,
        questions: [
          {
            questionId: 'q-1',
            position: 1,
            answerKeySnapshot: 'C',
          },
        ],
      };

      mockPrisma.simulation.create.mockResolvedValue({
        ...baseSimulation,
        title: 'Estudo Livre sem Cronômetro',
        timeLimitSeconds: null,
        totalQuestions: 1,
        questions: [mockQuestionsWithAlternatives[0]],
      });

      const result = await repository.create(input);

      expect(result.timeLimitSeconds).toBeNull();
      const callData = mockPrisma.simulation.create.mock.calls[0][0].data;
      expect(callData.timeLimitSeconds).toBeNull();
    });

    it('deve rejeitar com 422 quando a contagem de questões divergir de totalQuestions', async () => {
      const input: CreateSimulationInput = {
        userId: 'user-1',
        totalQuestions: 5,
        questions: [
          {
            questionId: 'q-1',
            position: 1,
          },
        ],
      };

      await expect(repository.create(input)).rejects.toThrow(
        /A quantidade de questões \(1\) diverge do total especificado \(5\)/i
      );
      expect(mockPrisma.simulation.create).not.toHaveBeenCalled();
    });

    it('deve rejeitar com 422 quando houver posições duplicadas na mesma simulação', async () => {
      const input: CreateSimulationInput = {
        userId: 'user-1',
        totalQuestions: 2,
        questions: [
          { questionId: 'q-1', position: 1 },
          { questionId: 'q-2', position: 1 },
        ],
      };

      await expect(repository.create(input)).rejects.toThrow(
        /Posição duplicada detectada no simulado: posição 1/i
      );
      expect(mockPrisma.simulation.create).not.toHaveBeenCalled();
    });

    it('deve rejeitar com 422 quando houver a mesma questão duplicada no array do simulado', async () => {
      const input: CreateSimulationInput = {
        userId: 'user-1',
        totalQuestions: 2,
        questions: [
          { questionId: 'q-1', position: 1 },
          { questionId: 'q-1', position: 2 },
        ],
      };

      await expect(repository.create(input)).rejects.toThrow(
        /Questão duplicada detectada no simulado: q-1/i
      );
      expect(mockPrisma.simulation.create).not.toHaveBeenCalled();
    });

    it('deve mapear erro de violação de restrição única P2002 do Prisma para SimulationDomainError 409', async () => {
      const input: CreateSimulationInput = {
        userId: 'user-1',
        totalQuestions: 1,
        questions: [{ questionId: 'q-1', position: 1 }],
      };

      const prismaError = new Error('Unique constraint failed');
      (prismaError as any).code = 'P2002';
      mockPrisma.simulation.create.mockRejectedValue(prismaError);

      await expect(repository.create(input)).rejects.toMatchObject({
        name: 'SimulationDomainError',
        code: 'SIMULATION_INVALID_INPUT',
        statusCode: 409,
      });
    });
  });

  describe('findById e findByIdAndUser', () => {
    it('deve buscar simulado por id sem filtro de usuário', async () => {
      mockPrisma.simulation.findUnique.mockResolvedValue(baseSimulation);

      const result = await repository.findById('sim-100');

      expect(mockPrisma.simulation.findUnique).toHaveBeenCalledWith({
        where: { id: 'sim-100' },
      });
      expect(result).toEqual(baseSimulation);
    });

    it('deve buscar simulado com isolamento de usuário via findByIdAndUser', async () => {
      mockPrisma.simulation.findFirst.mockResolvedValue(baseSimulation);

      const result = await repository.findByIdAndUser('sim-100', 'user-1');

      expect(mockPrisma.simulation.findFirst).toHaveBeenCalledWith({
        where: { id: 'sim-100', userId: 'user-1' },
      });
      expect(result).toEqual(baseSimulation);
    });

    it('deve retornar null quando o simulado pertencer a outro usuário', async () => {
      mockPrisma.simulation.findFirst.mockResolvedValue(null);

      const result = await repository.findByIdAndUser('sim-100', 'outro-usuario');

      expect(result).toBeNull();
    });
  });

  describe('findByIdWithQuestions', () => {
    it('deve retornar o simulado com questões e alternativas ordenadas por posição', async () => {
      const expected = {
        ...baseSimulation,
        questions: mockQuestionsWithAlternatives,
      };

      mockPrisma.simulation.findFirst.mockResolvedValue(expected);

      const result = await repository.findByIdWithQuestions('sim-100', 'user-1');

      expect(mockPrisma.simulation.findFirst).toHaveBeenCalledWith({
        where: { id: 'sim-100', userId: 'user-1' },
        include: {
          questions: {
            include: {
              question: {
                include: {
                  alternatives: {
                    orderBy: {
                      position: 'asc',
                    },
                  },
                },
              },
            },
            orderBy: {
              position: 'asc',
            },
          },
        },
      });

      expect(result).toEqual(expected);
    });
  });

  describe('findByIdWithFullDetails', () => {
    it('deve retornar o simulado com questões e tentativas associadas', async () => {
      const expected = {
        ...baseSimulation,
        questions: mockQuestionsWithAlternatives,
        attempts: [
          {
            id: 'att-1',
            userId: 'user-1',
            simulationId: 'sim-100',
            questionId: 'q-1',
            selectedAlternativeId: 'alt-2',
            selectedLetter: 'B',
            isCorrect: true,
            timeSpentSeconds: 45,
            answeredAt: mockDate,
            createdAt: mockDate,
            updatedAt: mockDate,
            selectedAlternative: { id: 'alt-2', letter: 'B', text: 'Opção B', position: 2 },
          },
        ],
      };

      mockPrisma.simulation.findFirst.mockResolvedValue(expected);

      const result = await repository.findByIdWithFullDetails('sim-100', 'user-1');

      expect(mockPrisma.simulation.findFirst).toHaveBeenCalledWith({
        where: { id: 'sim-100', userId: 'user-1' },
        include: {
          questions: {
            include: {
              question: {
                include: {
                  alternatives: {
                    orderBy: {
                      position: 'asc',
                    },
                  },
                },
              },
            },
            orderBy: {
              position: 'asc',
            },
          },
          attempts: {
            include: {
              selectedAlternative: true,
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      });

      expect(result).toEqual(expected);
    });
  });

  describe('findManyByUser', () => {
    it('deve listar simulados do usuário com paginação e ordenação decrescente por data', async () => {
      mockPrisma.simulation.findMany.mockResolvedValue([baseSimulation]);
      mockPrisma.simulation.count.mockResolvedValue(1);

      const result = await repository.findManyByUser('user-1', { limit: 10, offset: 0 });

      expect(mockPrisma.simulation.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        skip: 0,
      });
      expect(mockPrisma.simulation.count).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });

      expect(result).toEqual({
        items: [baseSimulation],
        total: 1,
        limit: 10,
        offset: 0,
      });
    });

    it('deve filtrar simulados por status quando fornecido', async () => {
      mockPrisma.simulation.findMany.mockResolvedValue([]);
      mockPrisma.simulation.count.mockResolvedValue(0);

      await repository.findManyByUser('user-1', { status: 'COMPLETED' });

      expect(mockPrisma.simulation.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        take: 20,
        skip: 0,
      });
    });
  });

  describe('update', () => {
    it('deve atualizar campos de status, finalização e pontuação do simulado', async () => {
      mockPrisma.simulation.findFirst.mockResolvedValue(baseSimulation);

      const updateData: UpdateSimulationInput = {
        status: 'COMPLETED',
        startedAt: new Date('2026-10-20T12:00:00Z'),
        finishedAt: new Date('2026-10-20T13:30:00Z'),
        durationSeconds: 5400,
        scorePercentage: 100,
        correctCount: 2,
        wrongCount: 0,
        unansweredCount: 0,
      };

      const updatedSimulation = {
        ...baseSimulation,
        ...updateData,
      };

      mockPrisma.simulation.update.mockResolvedValue(updatedSimulation);

      const result = await repository.update('sim-100', 'user-1', updateData);

      expect(mockPrisma.simulation.update).toHaveBeenCalledWith({
        where: { id: 'sim-100' },
        data: updateData,
      });
      expect(result.status).toBe('COMPLETED');
      expect(result.scorePercentage).toBe(100);
    });

    it('deve lançar 404 se o simulado não for encontrado para o usuário solicitante', async () => {
      mockPrisma.simulation.findFirst.mockResolvedValue(null);

      await expect(
        repository.update('sim-inexistente', 'user-1', { status: 'ABANDONED' })
      ).rejects.toMatchObject({
        name: 'SimulationDomainError',
        code: 'SIMULATION_NOT_FOUND',
        statusCode: 404,
      });

      expect(mockPrisma.simulation.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deve remover o simulado quando o usuário for o proprietário', async () => {
      mockPrisma.simulation.findFirst.mockResolvedValue(baseSimulation);
      mockPrisma.simulation.delete.mockResolvedValue(baseSimulation);

      const success = await repository.delete('sim-100', 'user-1');

      expect(mockPrisma.simulation.delete).toHaveBeenCalledWith({
        where: { id: 'sim-100' },
      });
      expect(success).toBe(true);
    });

    it('deve retornar false sem deletar se o simulado não pertencer ao usuário', async () => {
      mockPrisma.simulation.findFirst.mockResolvedValue(null);

      const success = await repository.delete('sim-100', 'outro-usuario');

      expect(mockPrisma.simulation.delete).not.toHaveBeenCalled();
      expect(success).toBe(false);
    });
  });

  describe('countByUserAndStatus', () => {
    it('deve contar simulados do usuário por status', async () => {
      mockPrisma.simulation.count.mockResolvedValue(3);

      const count = await repository.countByUserAndStatus('user-1', 'COMPLETED');

      expect(mockPrisma.simulation.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', status: 'COMPLETED' },
      });
      expect(count).toBe(3);
    });
  });

  describe('updateIfStatus', () => {
    it('deve atualizar condicionalmente quando o status atual for compatível', async () => {
      mockPrisma.simulation.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.simulation.findFirst.mockResolvedValue({
        ...baseSimulation,
        status: 'COMPLETED',
      });

      const result = await repository.updateIfStatus(
        'sim-100',
        'user-1',
        ['CREATED', 'IN_PROGRESS'],
        { status: 'COMPLETED' }
      );

      expect(mockPrisma.simulation.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'sim-100',
          userId: 'user-1',
          status: { in: ['CREATED', 'IN_PROGRESS'] },
        },
        data: { status: 'COMPLETED' },
      });
      expect(result?.status).toBe('COMPLETED');
    });

    it('deve retornar null se count for 0 (status já alterado por operação concorrente)', async () => {
      mockPrisma.simulation.updateMany.mockResolvedValue({ count: 0 });

      const result = await repository.updateIfStatus(
        'sim-100',
        'user-1',
        ['CREATED', 'IN_PROGRESS'],
        { status: 'COMPLETED' }
      );

      expect(result).toBeNull();
    });
  });

  describe('executeInSimulationLock', () => {
    it('deve executar $transaction e adquirir row lock com SELECT ... FOR UPDATE', async () => {
      const mockTx: any = {
        $queryRaw: vi.fn().mockResolvedValue([{ id: 'sim-100' }]),
        simulation: {
          findFirst: vi.fn().mockResolvedValue(baseSimulation),
        },
        questionAttempt: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      const actionSpy = vi.fn().mockImplementation(async (txSimRepo, txAttemptRepo) => {
        expect(txSimRepo).toBeDefined();
        expect(txAttemptRepo).toBeDefined();
        return 'success-result';
      });

      const result = await repository.executeInSimulationLock(
        'sim-100',
        'user-1',
        actionSpy
      );

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(actionSpy).toHaveBeenCalledTimes(1);
      expect(result).toBe('success-result');
    });

    it('deve propagar erro lançado dentro da ação transacional abortando a transação', async () => {
      const mockTx: any = {
        $queryRaw: vi.fn().mockResolvedValue([{ id: 'sim-100' }]),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      const failingAction = vi.fn().mockRejectedValue(new Error('Transaction action failed'));

      await expect(
        repository.executeInSimulationLock('sim-100', 'user-1', failingAction)
      ).rejects.toThrow('Transaction action failed');

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });
});
