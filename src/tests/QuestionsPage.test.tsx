import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../App.tsx';
import type { QuestionOwnerDetailDTO, QuestionPublicViewDTO } from '../types/index.ts';

describe('Frontend do Banco de Questões (src/tests/QuestionsPage.test.tsx)', () => {
  const originalFetch = globalThis.fetch;

  const mockAuthenticatedUser = {
    user: {
      id: 'user-auth-1',
      name: 'Helena Martins',
      email: 'helena@questforge.dev',
      avatarUrl: null,
      createdAt: '2026-10-09T10:00:00.000Z',
      updatedAt: '2026-10-09T10:00:00.000Z',
    },
    session: {
      id: 'session-auth-1',
      userId: 'user-auth-1',
      expiresAt: '2026-10-16T10:00:00.000Z',
      createdAt: '2026-10-09T10:00:00.000Z',
      lastUsedAt: '2026-10-09T10:00:00.000Z',
    },
  };

  const samplePublicQuestion: QuestionPublicViewDTO = {
    id: 'q-101',
    userId: 'user-auth-1',
    examId: null,
    originalNumber: 12,
    statement:
      'Assinale a opção que apresenta a complexidade de busca binária em vetor ordenado.',
    type: 'MULTIPLE_CHOICE',
    subject: 'Algoritmos e Estruturas de Dados',
    topic: 'Busca Binária',
    subtopic: null,
    board: 'CEBRASPE',
    examTitle: 'Analista de TI 2025',
    year: 2025,
    difficulty: 'MEDIUM',
    sourcePage: 4,
    status: 'ACTIVE',
    hasAnswerKey: true,
    hasExplanation: true,
    answerKeyRevealed: false,
    alternatives: [
      { id: 'alt-1', letter: 'A', text: 'O(1)', position: 1 },
      { id: 'alt-2', letter: 'B', text: 'O(log n)', position: 2 },
      { id: 'alt-3', letter: 'C', text: 'O(n)', position: 3 },
    ],
    createdAt: '2026-10-09T10:00:00.000Z',
    updatedAt: '2026-10-09T10:00:00.000Z',
  };

  const sampleRevealedQuestion: QuestionOwnerDetailDTO = {
    ...samplePublicQuestion,
    answerKeyRevealed: true,
    correctAnswer: 'B',
    explanation: 'A busca binária divide o espaço de busca pela metade a cada passo: O(log n).',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('deve exibir estado de lista vazia e tratar erro HTTP 503 da API sem mascarar falha como sucesso', async () => {
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

      if (url.includes('/api/questions')) {
        if (shouldFail) {
          return {
            status: 503,
            ok: false,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              error: 'ServiceUnavailable',
              message:
                'Não foi possível processar a operação no banco de questões no momento.',
            }),
          } as Response;
        }

        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            items: [],
            total: 0,
            currentPage: 1,
            totalPages: 1,
            limit: 10,
          }),
        } as Response;
      }

      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/questions']}>
        <AppRoutes />
      </MemoryRouter>
    );

    // 1. Deve apresentar o alerta de erro 503 e nunca lista vazia enganosa
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      /Não foi possível processar a operação no banco de questões no momento/i
    );
    expect(screen.queryByText(/Nenhuma questão encontrada/i)).not.toBeInTheDocument();

    // 2. Ao clicar em "Tentar novamente" com API recuperada, exibe o estado vazio real
    shouldFail = false;
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));

    expect(
      await screen.findByRole('heading', { name: /Nenhuma questão encontrada/i })
    ).toBeInTheDocument();
  });

  it('deve realizar busca, aplicar filtros sem disparar requisição a cada tecla e paginar resultados reais', async () => {
    const requestedQuestionUrls: string[] = [];

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

      if (url.includes('/api/questions')) {
        requestedQuestionUrls.push(url);
        const isPage2 = url.includes('page=2');
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            items: [
              {
                ...samplePublicQuestion,
                statement: isPage2
                  ? 'Questão da segunda página de resultados.'
                  : samplePublicQuestion.statement,
              },
            ],
            total: 15,
            currentPage: isPage2 ? 2 : 1,
            totalPages: 2,
            limit: 10,
          }),
        } as Response;
      }

      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/questions']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(
      await screen.findByText(/Assinale a opção que apresenta a complexidade de busca binária/i)
    ).toBeInTheDocument();
    expect(requestedQuestionUrls).toHaveLength(1);

    // Digitar nos campos de busca e disciplina NÃO deve disparar chamadas antes de submeter
    fireEvent.change(screen.getByLabelText(/Busca textual/i), {
      target: { value: 'binária' },
    });
    fireEvent.change(screen.getByLabelText(/Disciplina/i), {
      target: { value: 'Algoritmos' },
    });
    fireEvent.change(screen.getByLabelText(/Banca/i), {
      target: { value: 'CEBRASPE' },
    });
    expect(requestedQuestionUrls).toHaveLength(1);

    // Submete o formulário de filtros
    fireEvent.click(screen.getByRole('button', { name: /Aplicar filtros/i }));

    await waitFor(() => {
      expect(requestedQuestionUrls).toHaveLength(2);
    });
    expect(requestedQuestionUrls[1]).toContain('search=bin%C3%A1ria');
    expect(requestedQuestionUrls[1]).toContain('subject=Algoritmos');
    expect(requestedQuestionUrls[1]).toContain('board=CEBRASPE');
    expect(requestedQuestionUrls[1]).toContain('page=1');

    // Avança para a página 2
    fireEvent.click(screen.getByRole('button', { name: /Próxima página/i }));

    expect(
      await screen.findByText(/Questão da segunda página de resultados/i)
    ).toBeInTheDocument();
    expect(requestedQuestionUrls[2]).toContain('page=2');
  });

  it('deve validar o formulário de cadastro (/questions/new), manter difficulty null quando não informada e enviar POST /api/questions com cabeçalho CSRF', async () => {
    let capturedPostBody: Record<string, unknown> | null = null;

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }

      if (url === '/api/questions' && init?.method === 'POST') {
        const headers = init.headers as Record<string, string>;
        expect(headers['X-Requested-With']).toBe('QuestForge-Client');
        expect(init.credentials).toBe('include');
        capturedPostBody = JSON.parse(String(init.body));

        return {
          status: 201,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            question: sampleRevealedQuestion,
          }),
        } as Response;
      }

      if (url.includes('/api/questions/q-101')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            question: samplePublicQuestion,
          }),
        } as Response;
      }

      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/questions/new']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(
      await screen.findByRole('heading', { name: /Cadastrar Nova Questão/i })
    ).toBeInTheDocument();

    // 1. Tenta submeter com enunciado curto -> erro de validação no frontend
    fireEvent.change(screen.getByLabelText(/Enunciado da questão/i), {
      target: { value: 'abc' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Cadastrar questão/i }));
    expect(
      await screen.findByText(/O enunciado deve possuir pelo menos 5 caracteres/i)
    ).toBeInTheDocument();

    // 2. Preenche enunciado, disciplina e alternativas, mas coloca correctAnswer fora das letras -> erro
    fireEvent.change(screen.getByLabelText(/Enunciado da questão/i), {
      target: {
        value:
          'Assinale a opção que apresenta a complexidade de busca binária em vetor ordenado.',
      },
    });
    fireEvent.change(screen.getByLabelText(/Disciplina \*/i), {
      target: { value: 'Algoritmos e Estruturas de Dados' },
    });
    fireEvent.change(screen.getByLabelText(/Texto da alternativa 1/i), {
      target: { value: 'O(1)' },
    });
    fireEvent.change(screen.getByLabelText(/Texto da alternativa 2/i), {
      target: { value: 'O(log n)' },
    });
    fireEvent.change(screen.getByLabelText(/Resposta correta/i), {
      target: { value: 'E' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Cadastrar questão/i }));
    expect(
      await screen.findByText(
        /A resposta correta "E" não corresponde a nenhuma das alternativas fornecidas/i
      )
    ).toBeInTheDocument();

    // 3. Corrige resposta correta para 'B' e submete sem escolher dificuldade (deve enviar difficulty: null)
    fireEvent.change(screen.getByLabelText(/Resposta correta/i), {
      target: { value: 'B' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Cadastrar questão/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Detalhes da Questão/i })
      ).toBeInTheDocument();
    });

    expect(capturedPostBody).not.toBeNull();
    expect(capturedPostBody?.['difficulty']).toBeNull();
    expect(capturedPostBody?.['correctAnswer']).toBe('B');
  });

  it('deve carregar dados reais na edição (/questions/:id/edit) e enviar PUT /api/questions/:id', async () => {
    let capturedPutBody: Record<string, unknown> | null = null;

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }

      if (url.includes('/api/questions/q-101') && (!init?.method || init.method === 'GET')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            question: url.includes('includeAnswer=true')
              ? sampleRevealedQuestion
              : samplePublicQuestion,
          }),
        } as Response;
      }

      if (url.includes('/api/questions/q-101') && init?.method === 'PUT') {
        const headers = init.headers as Record<string, string>;
        expect(headers['X-Requested-With']).toBe('QuestForge-Client');
        capturedPutBody = JSON.parse(String(init.body));

        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            question: {
              ...sampleRevealedQuestion,
              statement: String(capturedPutBody?.['statement']),
            },
          }),
        } as Response;
      }

      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/questions/q-101/edit']}>
        <AppRoutes />
      </MemoryRouter>
    );

    const statementInput = await screen.findByLabelText(/Enunciado da questão/i);
    expect(statementInput).toHaveValue(sampleRevealedQuestion.statement);

    fireEvent.change(statementInput, {
      target: { value: 'Enunciado atualizado durante o teste de edição.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Salvar alterações/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Detalhes da Questão/i })
      ).toBeInTheDocument();
    });
    expect(capturedPutBody?.['statement']).toBe(
      'Enunciado atualizado durante o teste de edição.'
    );
  });

  it('deve ocultar gabarito por padrão em /questions/:id, revelar ao clicar em "Revelar gabarito", ocultar novamente e tratar erro 403 se não autorizado', async () => {
    let denyReveal = false;

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

      if (url.includes('/api/questions/q-101?includeAnswer=true')) {
        if (denyReveal) {
          return {
            status: 403,
            ok: false,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              error: 'QUESTION_FORBIDDEN',
              message: 'Você não possui permissão para acessar esta questão.',
            }),
          } as Response;
        }

        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            question: sampleRevealedQuestion,
          }),
        } as Response;
      }

      if (url.includes('/api/questions/q-101')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            question: samplePublicQuestion,
          }),
        } as Response;
      }

      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/questions/q-101']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(
      await screen.findByText(/Assinale a opção que apresenta a complexidade de busca binária/i)
    ).toBeInTheDocument();

    // 1. Por padrão, a explicação não está visível
    expect(
      screen.queryByText(/A busca binária divide o espaço de busca pela metade/i)
    ).not.toBeInTheDocument();

    // 2. Clica em "Revelar gabarito" -> exibe resposta correta e explicação
    fireEvent.click(screen.getByRole('button', { name: /Revelar gabarito/i }));
    expect(
      await screen.findByText(/A busca binária divide o espaço de busca pela metade/i)
    ).toBeInTheDocument();

    // 3. Clica em "Ocultar gabarito" -> remove gabarito e explicação da tela
    fireEvent.click(screen.getByRole('button', { name: /Ocultar gabarito/i }));
    expect(
      screen.queryByText(/A busca binária divide o espaço de busca pela metade/i)
    ).not.toBeInTheDocument();

    // 4. Se o backend negar a revelação (403), exibe mensagem de erro adequada
    denyReveal = true;
    fireEvent.click(screen.getByRole('button', { name: /Revelar gabarito/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Você não possui permissão para acessar esta questão/i
    );
  });

  it('deve exigir confirmação antes de excluir questão e tratar expiração de sessão (HTTP 401)', async () => {
    let questionsList = [samplePublicQuestion];
    let sessionExpired = false;

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        if (sessionExpired) {
          return {
            status: 401,
            ok: false,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ error: 'Unauthorized', message: 'Sessão expirada.' }),
          } as Response;
        }
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }

      if (url.includes('/api/questions/q-101') && init?.method === 'DELETE') {
        const headers = init.headers as Record<string, string>;
        expect(headers['X-Requested-With']).toBe('QuestForge-Client');
        questionsList = [];
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ message: 'Questão excluída com sucesso.' }),
        } as Response;
      }

      if (url.includes('/api/questions')) {
        if (sessionExpired) {
          return {
            status: 401,
            ok: false,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ error: 'Unauthorized', message: 'Sessão expirada.' }),
          } as Response;
        }
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            items: questionsList,
            total: questionsList.length,
            currentPage: 1,
            totalPages: 1,
            limit: 10,
          }),
        } as Response;
      }

      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/questions']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(
      await screen.findByText(/Assinale a opção que apresenta a complexidade de busca binária/i)
    ).toBeInTheDocument();

    // 1. Clica em "Excluir" -> solicita confirmação antes de chamar DELETE
    fireEvent.click(screen.getByRole('button', { name: /^Excluir$/i }));
    expect(screen.getByText(/Confirmar exclusão permanente\?/i)).toBeInTheDocument();

    // 2. Confirma a exclusão -> chama DELETE /api/questions/q-101 e atualiza a lista
    fireEvent.click(screen.getByRole('button', { name: /Confirmar exclusão/i }));
    expect(
      await screen.findByText(/Questão excluída com sucesso/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Nenhuma questão encontrada/i })
    ).toBeInTheDocument();

    // 3. Simula expiração de sessão ao atualizar lista -> revalida /api/auth/me e mostra tela de acesso restrito
    sessionExpired = true;
    fireEvent.click(screen.getByRole('button', { name: /Atualizar/i }));
    expect(
      await screen.findByRole('heading', {
        name: /Autenticação necessária para acessar o Banco de Questões/i,
      })
    ).toBeInTheDocument();
  });
});
