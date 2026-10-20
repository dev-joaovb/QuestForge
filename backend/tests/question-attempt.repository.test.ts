import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient, QuestionAttempt } from '@prisma/client';
import {
  PrismaQuestionAttemptRepository,
} from '../src/repositories/question-attempt.repository.ts';
import type { UpsertQuestionAttemptInput } from '../src/types/simulation.types.ts';

describe('PrismaQuestionAttemptRepository (backend/src/repositories/question-attempt.repository.ts)', () => {
  let mockPrisma: any;
  let repository: PrismaQuestionAttemptRepository;

  const mockDate = new Date('2026-10-20T12:30:00.000Z');

  const baseAttempt: QuestionAttempt = {
    id: 'att-1',
    userId: 'user-1',
    simulationId: 'sim-100',
    questionId: 'q-1',
    selectedAlternativeId: 'alt-2',
    selectedLetter: 'B',
    isCorrect: true,
    timeSpentSeconds: 42,
    answeredAt: mockDate,
    createdAt: mockDate,
    updatedAt: mockDate,
  };

  beforeEach(() => {
    mockPrisma = {
      questionAttempt: {
        upsert: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        deleteMany: vi.fn(),
      },
    };

    repository = new PrismaQuestionAttemptRepository(
      mockPrisma as unknown as PrismaClient
    );
  });

  describe('upsertAttempt', () => {
    it('deve realizar upsert atômico de tentativa de resposta com chave composta (simulationId, questionId)', async () => {
      const input: UpsertQuestionAttemptInput = {
        userId: 'user-1',
        simulationId: 'sim-100',
        questionId: 'q-1',
        selectedAlternativeId: 'alt-2',
        selectedLetter: 'B',
        isCorrect: true,
        timeSpentSeconds: 42,
        answeredAt: mockDate,
      };

      mockPrisma.questionAttempt.upsert.mockResolvedValue(baseAttempt);

      const result = await repository.upsertAttempt(input);

      expect(mockPrisma.questionAttempt.upsert).toHaveBeenCalledTimes(1);
      const call = mockPrisma.questionAttempt.upsert.mock.calls[0][0];

      expect(call.where).toEqual({
        simulationId_questionId: {
          simulationId: 'sim-100',
          questionId: 'q-1',
        },
      });

      expect(call.create).toEqual({
        userId: 'user-1',
        simulationId: 'sim-100',
        questionId: 'q-1',
        selectedAlternativeId: 'alt-2',
        selectedLetter: 'B',
        isCorrect: true,
        timeSpentSeconds: 42,
        answeredAt: mockDate,
      });

      expect(call.update).toEqual({
        selectedAlternativeId: 'alt-2',
        selectedLetter: 'B',
        isCorrect: true,
        timeSpentSeconds: 42,
        answeredAt: mockDate,
      });

      expect(result).toEqual(baseAttempt);
    });

    it('deve permitir limpar ou desmarcar alternativa enviando null', async () => {
      const input: UpsertQuestionAttemptInput = {
        userId: 'user-1',
        simulationId: 'sim-100',
        questionId: 'q-1',
        selectedAlternativeId: null,
        selectedLetter: null,
        isCorrect: null,
        timeSpentSeconds: 15,
        answeredAt: mockDate,
      };

      const clearedAttempt: QuestionAttempt = {
        ...baseAttempt,
        selectedAlternativeId: null,
        selectedLetter: null,
        isCorrect: null,
      };

      mockPrisma.questionAttempt.upsert.mockResolvedValue(clearedAttempt);

      const result = await repository.upsertAttempt(input);

      expect(result.selectedAlternativeId).toBeNull();
      expect(result.selectedLetter).toBeNull();
      expect(result.isCorrect).toBeNull();
    });
  });

  describe('findBySimulationAndQuestion', () => {
    it('deve encontrar tentativa específica de uma questão no simulado', async () => {
      mockPrisma.questionAttempt.findFirst.mockResolvedValue(baseAttempt);

      const result = await repository.findBySimulationAndQuestion('sim-100', 'q-1');

      expect(mockPrisma.questionAttempt.findFirst).toHaveBeenCalledWith({
        where: { simulationId: 'sim-100', questionId: 'q-1' },
      });
      expect(result).toEqual(baseAttempt);
    });

    it('deve incluir filtro de userId quando fornecido para isolamento', async () => {
      mockPrisma.questionAttempt.findFirst.mockResolvedValue(baseAttempt);

      await repository.findBySimulationAndQuestion('sim-100', 'q-1', 'user-1');

      expect(mockPrisma.questionAttempt.findFirst).toHaveBeenCalledWith({
        where: { simulationId: 'sim-100', questionId: 'q-1', userId: 'user-1' },
      });
    });

    it('deve retornar null quando a questão ainda não tiver tentativa', async () => {
      mockPrisma.questionAttempt.findFirst.mockResolvedValue(null);

      const result = await repository.findBySimulationAndQuestion('sim-100', 'q-99');

      expect(result).toBeNull();
    });
  });

  describe('findManyBySimulation', () => {
    it('deve retornar todas as tentativas de um simulado ordenadas por criação', async () => {
      mockPrisma.questionAttempt.findMany.mockResolvedValue([baseAttempt]);

      const result = await repository.findManyBySimulation('sim-100', 'user-1');

      expect(mockPrisma.questionAttempt.findMany).toHaveBeenCalledWith({
        where: { simulationId: 'sim-100', userId: 'user-1' },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual([baseAttempt]);
    });
  });

  describe('countAttempts', () => {
    it('deve calcular a quantidade total de tentativas, acertos e erros', async () => {
      mockPrisma.questionAttempt.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(7)  // correct
        .mockResolvedValueOnce(3);  // wrong

      const stats = await repository.countAttempts('sim-100', 'user-1');

      expect(mockPrisma.questionAttempt.count).toHaveBeenCalledTimes(3);
      expect(stats).toEqual({
        total: 10,
        correct: 7,
        wrong: 3,
      });
    });
  });

  describe('deleteBySimulation', () => {
    it('deve remover todas as tentativas de um simulado e retornar a contagem deletada', async () => {
      mockPrisma.questionAttempt.deleteMany.mockResolvedValue({ count: 5 });

      const deletedCount = await repository.deleteBySimulation('sim-100');

      expect(mockPrisma.questionAttempt.deleteMany).toHaveBeenCalledWith({
        where: { simulationId: 'sim-100' },
      });
      expect(deletedCount).toBe(5);
    });
  });
});
