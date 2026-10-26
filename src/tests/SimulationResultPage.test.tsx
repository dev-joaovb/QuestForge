/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../App.tsx';
import type { SimulationDetailDTO } from '../types/index.ts';

describe('Página de Resultados e Revisão Pedagógica (src/tests/SimulationResultPage.test.tsx) — Sprint 6.8', () => {
  const originalFetch = globalThis.fetch;

  const mockAuthenticatedUser = {
    user: {
      id: 'user-auth-1',
      name: 'Carlos Oliveira',
      email: 'carlos@questforge.dev',
      avatarUrl: null,
      createdAt: '2026-10-20T10:00:00.000Z',
      updatedAt: '2026-10-20T10:00:00.000Z',
    },
    session: {
      id: 'session-auth-1',
      userId: 'user-auth-1',
      expiresAt: '2026-10-25T10:00:00.000Z',
      createdAt: '2026-10-20T10:00:00.000Z',
      lastUsedAt: '2026-10-20T10:00:00.000Z',
    },
  };

  const sampleCompletedSimulation: SimulationDetailDTO = {
    id: 'sim-result-100',
    userId: 'user-auth-1',
    title: 'Simulado PF 2026 - Conhecimentos Específicos',
    status: 'COMPLETED',
    totalQuestions: 4,
    timeLimitSeconds: 3600,
    startedAt: '2026-10-25T14:00:00.000Z',
    finishedAt: '2026-10-25T14:45:00.000Z',
    durationSeconds: 2700,
    scorePercentage: 75.0,
    correctCount: 3,
    wrongCount: 1,
    unansweredCount: 0,
    createdAt: '2026-10-25T13:50:00.000Z',
    timeRemainingSeconds: 900,
    isExpired: false,
    questions: [
      {
        id: 'sq-1',
        simulationId: 'sim-result-100',
        questionId: 'q-101',
        position: 1,
        statement: 'A República Federativa do Brasil rege-se nas suas relações internacionais pelo princípio da prevalência dos direitos humanos.',
        type: 'MULTIPLE_CHOICE',
        subject: 'Direito Constitucional',
        topic: 'Princípios Fundamentais',
        subtopic: 'Relações Internacionais',
        board: 'Cebraspe',
        examTitle: 'Polícia Federal - Agente',
        year: 2024,
        difficulty: 'MEDIUM',
        answerKeySnapshot: 'A',
        isAnnulledSnapshot: false,
        snapshotSource: 'OFFICIAL_KEY',
        officialAnswerKeyVersion: 1,
        explanation: 'O art. 4º, II da CF/88 elenca a prevalência dos direitos humanos como princípio regente das relações internacionais.',
        isCorrect: true,
        currentAttempt: {
          selectedAlternativeId: 'alt-1a',
          selectedLetter: 'A',
          answeredAt: '2026-10-25T14:10:00.000Z',
          timeSpentSeconds: 45,
        },
        alternatives: [
          { id: 'alt-1a', letter: 'A', text: 'Certo, conforme art. 4º da CF/88.', position: 1 },
          { id: 'alt-1b', letter: 'B', text: 'Errado, é competência do Presidente.', position: 2 },
        ],
      },
      {
        id: 'sq-2',
        simulationId: 'sim-result-100',
        questionId: 'q-102',
        position: 2,
        statement: 'No Direito Administrativo brasileiro, o ato administrativo discricionário não admite controle de legalidade pelo Poder Judiciário.',
        type: 'MULTIPLE_CHOICE',
        subject: 'Direito Administrativo',
        topic: 'Atos Administrativos',
        subtopic: 'Controle Judicial',
        board: 'FGV',
        examTitle: 'Receita Federal - Auditor',
        year: 2023,
        difficulty: 'HARD',
        answerKeySnapshot: 'B',
        isAnnulledSnapshot: false,
        snapshotSource: 'QUESTION_BANK',
        officialAnswerKeyVersion: null,
        explanation: 'O Judiciário controla a legalidade de todo ato administrativo, mesmo os discricionários, sendo vedado apenas o mérito administrativo.',
        isCorrect: false,
        currentAttempt: {
          selectedAlternativeId: 'alt-2a',
          selectedLetter: 'A',
          answeredAt: '2026-10-25T14:22:00.000Z',
          timeSpentSeconds: 65,
        },
        alternatives: [
          { id: 'alt-2a', letter: 'A', text: 'Incorreto afirmar que há controle, pois vigora a discricionariedade plena.', position: 1 },
          { id: 'alt-2b', letter: 'B', text: 'Admite sim controle judicial quanto à legalidade e aos limites da discricionariedade.', position: 2 },
        ],
      },
      {
        id: 'sq-3',
        simulationId: 'sim-result-100',
        questionId: 'q-103',
        position: 3,
        statement: 'Questão técnica que continha erro de transcrição no edital da banca examinadora.',
        type: 'MULTIPLE_CHOICE',
        subject: 'Informática',
        topic: 'Segurança da Informação',
        subtopic: 'Criptografia',
        board: 'Cebraspe',
        examTitle: 'Polícia Federal',
        year: 2024,
        difficulty: 'EASY',
        answerKeySnapshot: 'C',
        isAnnulledSnapshot: true,
        snapshotSource: 'OFFICIAL_KEY',
        officialAnswerKeyVersion: 2,
        explanation: 'Questão anulada oficialmente por duplicidade de gabarito e erro no texto enunciado.',
        isCorrect: true,
        currentAttempt: {
          selectedAlternativeId: 'alt-3a',
          selectedLetter: 'A',
          answeredAt: '2026-10-25T14:30:00.000Z',
          timeSpentSeconds: 30,
        },
        alternatives: [
          { id: 'alt-3a', letter: 'A', text: 'Algoritmo RSA simétrico.', position: 1 },
          { id: 'alt-3b', letter: 'B', text: 'Algoritmo AES assimétrico.', position: 2 },
          { id: 'alt-3c', letter: 'C', text: 'Opção rectificada no gabarito preliminar.', position: 3 },
        ],
      },
      {
        id: 'sq-4',
        simulationId: 'sim-result-100',
        questionId: 'q-104',
        position: 4,
        statement: 'Acerca dos poderes administrativos, o poder de polícia autoriza a aplicação de sanções a particulares.',
        type: 'MULTIPLE_CHOICE',
        subject: 'Direito Administrativo',
        topic: 'Poderes Administrativos',
        subtopic: 'Poder de Polícia',
        board: 'Vunesp',
        examTitle: 'Tribunal de Justiça',
        year: 2024,
        difficulty: 'MEDIUM',
        answerKeySnapshot: 'A',
        isAnnulledSnapshot: false,
        snapshotSource: 'QUESTION_BANK',
        officialAnswerKeyVersion: null,
        explanation: 'O poder de polícia estatal faculta sanções administrativas a particulares em geral.',
        isCorrect: null,
        currentAttempt: null, // Deixada em branco
        alternatives: [
          { id: 'alt-4a', letter: 'A', text: 'Correto, decorre da supremacia geral do Estado.', position: 1 },
          { id: 'alt-4b', letter: 'B', text: 'Incorreto, apenas o Judiciário aplica sanções.', position: 2 },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('1. deve exibir tela de acesso restrito quando o usuário não estiver autenticado', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 401,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: 'Unauthorized', message: 'Sessão inválida' }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-result-100/results']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(
      await screen.findByRole('heading', {
        name: /Autenticação necessária para consultar os resultados/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ir para o Login/i })).toBeInTheDocument();
  });

  it('2. deve impedir vazamento de gabarito e exibir aviso com link de retorno se simulado estiver IN_PROGRESS', async () => {
    const inProgressSimulation: SimulationDetailDTO = {
      ...sampleCompletedSimulation,
      status: 'IN_PROGRESS',
      scorePercentage: null,
      correctCount: null,
      wrongCount: null,
      unansweredCount: null,
    };

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }
      if (url.includes('/api/simulations/sim-result-100')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: inProgressSimulation }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-result-100/results']}>
        <AppRoutes />
      </MemoryRouter>
    );

    // Deve exibir alerta de simulado em andamento
    expect(
      await screen.findByRole('heading', { name: /Simulado ainda não concluído/i })
    ).toBeInTheDocument();

    // CTA para ir para o simulado ativo
    expect(
      screen.getByRole('link', { name: /Ir para o Simulado em Andamento/i })
    ).toHaveAttribute('href', '/simulations/sim-result-100');

    // NENHUM gabarito ou questão deve estar visível
    expect(screen.queryByText(/Aproveitamento Oficial/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Gabarito Oficial')).not.toBeInTheDocument();
    expect(screen.queryByText('Sua resposta (Correta)')).not.toBeInTheDocument();
    expect(screen.queryByText('Comentário e Justificativa Pedagógica')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Questão 1')).not.toBeInTheDocument();
  });

  it('3. deve renderizar aviso informativo e CTA quando o simulado tiver sido ABANDONED', async () => {
    const abandonedSimulation: SimulationDetailDTO = {
      ...sampleCompletedSimulation,
      status: 'ABANDONED',
      scorePercentage: null,
      correctCount: null,
      wrongCount: null,
    };

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }
      if (url.includes('/api/simulations/sim-result-100')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: abandonedSimulation }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-result-100/results']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText('Abandonado')).toBeInTheDocument();
    expect(
      screen.getByText(/Este simulado foi abandonado antes da sua conclusão/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Criar Novo Simulado/i })).toBeInTheDocument();
  });

  it('4. deve renderizar métricas oficiais retornadas pelo backend sem recálculo no cliente', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }
      if (url.includes('/api/simulations/sim-result-100')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: sampleCompletedSimulation }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-result-100/results']}>
        <AppRoutes />
      </MemoryRouter>
    );

    // Título e status
    expect(
      await screen.findByRole('heading', {
        name: 'Simulado PF 2026 - Conhecimentos Específicos',
      })
    ).toBeInTheDocument();
    expect(screen.getByText('Concluído')).toBeInTheDocument();

    // Métricas oficiais
    expect(screen.getByText('75.0%')).toBeInTheDocument();
    expect(screen.getByText('45m 00s')).toBeInTheDocument();
    expect(screen.getByText(/^Questões$/i).closest('div')).toHaveTextContent('4');
    expect(screen.getByText(/^Acertos$/i).closest('div')).toHaveTextContent('3');
    expect(screen.getByText(/^Erros$/i).closest('div')).toHaveTextContent('1');
    expect(screen.getByText(/^Em branco$/i).closest('div')).toHaveTextContent('0');
  });

  it('5. deve identificar corretamente a alternativa escolhida pelo aluno e o gabarito oficial em questão com acerto', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }
      if (url.includes('/api/simulations/sim-result-100')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: sampleCompletedSimulation }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-result-100/results']}>
        <AppRoutes />
      </MemoryRouter>
    );

    // Questão 1
    const q1Article = await screen.findByLabelText('Questão 1');
    expect(within(q1Article).getByText('Direito Constitucional')).toBeInTheDocument();
    expect(within(q1Article).getByText('Cebraspe')).toBeInTheDocument();
    expect(within(q1Article).getByText('Acertou')).toBeInTheDocument();
    expect(within(q1Article).getByText('Sua resposta (Correta)')).toBeInTheDocument();
  });

  it('6. deve identificar erro do aluno apontando sua resposta incorreta e indicando o gabarito oficial', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }
      if (url.includes('/api/simulations/sim-result-100')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: sampleCompletedSimulation }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-result-100/results']}>
        <AppRoutes />
      </MemoryRouter>
    );

    // Questão 2 (Erro)
    const q2Article = await screen.findByLabelText('Questão 2');
    expect(within(q2Article).getByText('Errou')).toBeInTheDocument();
    expect(within(q2Article).getByText('Sua resposta (Incorreta)')).toBeInTheDocument();
    expect(within(q2Article).getByText('Gabarito Oficial')).toBeInTheDocument();
  });

  it('7. deve renderizar explicação e justificativa pedagógica da questão quando fornecida', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }
      if (url.includes('/api/simulations/sim-result-100')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: sampleCompletedSimulation }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-result-100/results']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(
      await screen.findByText(
        'O art. 4º, II da CF/88 elenca a prevalência dos direitos humanos como princípio regente das relações internacionais.'
      )
    ).toBeInTheDocument();

    expect(
      screen.getAllByText('Comentário e Justificativa Pedagógica').length
    ).toBeGreaterThanOrEqual(1);
  });

  it('8. deve exibir distintivo de questão anulada e versão do gabarito oficial', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }
      if (url.includes('/api/simulations/sim-result-100')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: sampleCompletedSimulation }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-result-100/results']}>
        <AppRoutes />
      </MemoryRouter>
    );

    const q3Article = await screen.findByLabelText('Questão 3');
    expect(within(q3Article).getByText('Questão Anulada')).toBeInTheDocument();
    expect(
      within(q3Article).getByText(/Questão oficialmente anulada pela banca examinadora/i)
    ).toBeInTheDocument();
    expect(within(q3Article).getByText(/Versão 2/i)).toBeInTheDocument();
  });

  it('9. deve marcar questão não respondida com indicador de "Não Respondida"', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }
      if (url.includes('/api/simulations/sim-result-100')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: sampleCompletedSimulation }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-result-100/results']}>
        <AppRoutes />
      </MemoryRouter>
    );

    const q4Article = await screen.findByLabelText('Questão 4');
    expect(within(q4Article).getByText('Não Respondida')).toBeInTheDocument();
  });

  it('10. deve alternar abas de filtro pedagógico e ajustar a lista exibida', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }
      if (url.includes('/api/simulations/sim-result-100')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: sampleCompletedSimulation }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-result-100/results']}>
        <AppRoutes />
      </MemoryRouter>
    );

    // Inicialmente exibe todas as 4 questões
    expect(await screen.findByText('Questão 1')).toBeInTheDocument();
    expect(screen.getByText('Questão 2')).toBeInTheDocument();

    // Filtra por "Erros (1)"
    const errorTab = screen.getByRole('tab', { name: /Erros/i });
    fireEvent.click(errorTab);

    // Deve exibir apenas Questão 2
    expect(screen.getByText('Questão 2')).toBeInTheDocument();
    expect(screen.queryByText('Questão 1')).not.toBeInTheDocument();

    // Filtra por "Acertos"
    const correctTab = screen.getByRole('tab', { name: /Acertos/i });
    fireEvent.click(correctTab);
    expect(screen.getByText('Questão 1')).toBeInTheDocument();
    expect(screen.queryByText('Questão 2')).not.toBeInTheDocument();

    // Retorna para "Todas"
    const allTab = screen.getByRole('tab', { name: /Todas/i });
    fireEvent.click(allTab);
    expect(screen.getByText('Questão 1')).toBeInTheDocument();
    expect(screen.getByText('Questão 2')).toBeInTheDocument();
  });

  it('11. deve exibir mensagem de erro no carregamento e permitir tentar novamente', async () => {
    let shouldFail = true;

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }
      if (url.includes('/api/simulations/sim-result-100')) {
        if (shouldFail) {
          return {
            status: 500,
            ok: false,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ error: 'InternalError', message: 'Falha temporária no banco' }),
          } as Response;
        }
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: sampleCompletedSimulation }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-result-100/results']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(
      await screen.findByRole('heading', { name: /Não foi possível carregar os resultados/i })
    ).toBeInTheDocument();

    // Tentar novamente após recuperação
    shouldFail = false;
    const retryBtn = screen.getByRole('button', { name: /Tentar Novamente/i });
    fireEvent.click(retryBtn);

    expect(
      await screen.findByRole('heading', {
        name: 'Simulado PF 2026 - Conhecimentos Específicos',
      })
    ).toBeInTheDocument();
  });

  it('12. deve conter botões de navegação para Voltar e Criar Novo Simulado', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }
      if (url.includes('/api/simulations/sim-result-100')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ simulation: sampleCompletedSimulation }),
        } as Response;
      }
      throw new Error(`Chamada inesperada para ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/simulations/sim-result-100/results']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText('Concluído')).toBeInTheDocument();

    const returnLinks = screen.getAllByRole('link', { name: /Voltar/i });
    expect(returnLinks.length).toBeGreaterThanOrEqual(1);

    const newSimLinks = screen.getAllByRole('link', { name: /Novo Simulado/i });
    expect(newSimLinks.length).toBeGreaterThanOrEqual(1);
  });
});
