import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuestionPalette } from '../components/simulations/QuestionPalette.tsx';
import type { SimulationPublicQuestionDTO } from '../types/index.ts';

describe('QuestionPalette (src/tests/QuestionPalette.test.tsx)', () => {
  const sampleQuestions: SimulationPublicQuestionDTO[] = [
    {
      id: 'sq-1',
      simulationId: 'sim-1',
      questionId: 'q-1',
      position: 1,
      statement: 'Questão 1',
      type: 'MULTIPLE_CHOICE',
      subject: 'Direito',
      topic: null,
      subtopic: null,
      board: null,
      examTitle: null,
      year: null,
      difficulty: null,
      alternatives: [],
      currentAttempt: {
        selectedAlternativeId: 'alt-a',
        selectedLetter: 'A',
        answeredAt: '2026-10-24T10:00:00Z',
        timeSpentSeconds: null,
      },
    },
    {
      id: 'sq-2',
      simulationId: 'sim-1',
      questionId: 'q-2',
      position: 2,
      statement: 'Questão 2',
      type: 'MULTIPLE_CHOICE',
      subject: 'Direito',
      topic: null,
      subtopic: null,
      board: null,
      examTitle: null,
      year: null,
      difficulty: null,
      alternatives: [],
      currentAttempt: null,
    },
  ];

  it('1. deve calcular e exibir o contador e porcentagem de respondidas', () => {
    render(
      <QuestionPalette
        questions={sampleQuestions}
        currentIndex={0}
        onSelectIndex={() => {}}
      />
    );

    expect(screen.getByText('Mapa de Questões')).toBeInTheDocument();
    expect(screen.getByText(/1\/2/)).toBeInTheDocument();
    expect(screen.getByText(/(50%)/)).toBeInTheDocument();
  });

  it('2. deve acionar onSelectIndex ao clicar em um número da paleta', () => {
    const handleSelectIndex = vi.fn();
    render(
      <QuestionPalette
        questions={sampleQuestions}
        currentIndex={0}
        onSelectIndex={handleSelectIndex}
      />
    );

    const q2Btn = screen.getByRole('button', { name: /Questão 2/i });
    fireEvent.click(q2Btn);

    expect(handleSelectIndex).toHaveBeenCalledWith(1);
  });
});
