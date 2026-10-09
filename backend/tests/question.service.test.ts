import { describe, it, expect, beforeEach } from 'vitest';
import type { Alternative } from '@prisma/client';
import type {
  IQuestionRepository,
  PaginatedQuestionEntities,
  QuestionWithAlternatives,
} from '../src/repositories/question.repository.ts';
import type {
  ParsedCreateQuestionInput,
  ParsedListQuestionsQuery,
  ParsedUpdateQuestionInput,
} from '../src/validators/question.validator.ts';
import { QuestionService } from '../src/services/question.service.ts';

/**
 * Repositório in-memory exclusivo para testes unitários isolados da camada de domínio.
 */
class InMemoryQuestionRepository implements IQuestionRepository {
  public questions = new Map<string, QuestionWithAlternatives>();
  private idCounter = 1;

  async create(
    userId: string,
    data: ParsedCreateQuestionInput
  ): Promise<QuestionWithAlternatives> {
    const now = new Date();
    const qId = `question-${this.idCounter++}`;

    const alternatives: Alternative[] = data.alternatives.map((alt, idx) => ({
      id: `alt-${qId}-${idx + 1}`,
      questionId: qId,
      letter: alt.letter,
      text: alt.text,
      position: idx + 1,
    }));

    const entity: QuestionWithAlternatives = {
      id: qId,
      userId,
      examId: null,
      originalNumber: data.originalNumber ?? null,
      statement: data.statement,
      type: data.type,
      subject: data.subject,
      topic: data.topic ?? null,
      subtopic: data.subtopic ?? null,
      board: data.board ?? null,
      examTitle: data.examTitle ?? null,
      year: data.year ?? null,
      difficulty: data.difficulty ?? null,
      correctAnswer: data.correctAnswer ?? null,
      explanation: data.explanation ?? null,
      sourcePage: data.sourcePage ?? null,
      status: data.status,
      createdAt: now,
      updatedAt: now,
      alternatives,
    };

    this.questions.set(qId, entity);
    return entity;
  }

  async findById(id: string): Promise<QuestionWithAlternatives | null> {
    return this.questions.get(id) ?? null;
  }

  async findManyByUser(
    userId: string,
    query: ParsedListQuestionsQuery
  ): Promise<PaginatedQuestionEntities> {
    const allForUser = Array.from(this.questions.values()).filter((q) => {
      if (q.userId !== userId) return false;
      if (
        query.subject &&
        !q.subject.toLowerCase().includes(query.subject.toLowerCase())
      ) {
        return false;
      }
      if (
        query.topic &&
        (!q.topic || !q.topic.toLowerCase().includes(query.topic.toLowerCase()))
      ) {
        return false;
      }
      if (
        query.board &&
        (!q.board || !q.board.toLowerCase().includes(query.board.toLowerCase()))
      ) {
        return false;
      }
      if (
        query.examTitle &&
        (!q.examTitle ||
          !q.examTitle.toLowerCase().includes(query.examTitle.toLowerCase()))
      ) {
        return false;
      }
      if (query.type && q.type !== query.type) {
        return false;
      }
      if (query.difficulty && q.difficulty !== query.difficulty) {
        return false;
      }
      if (query.search) {
        const s = query.search.toLowerCase();
        const matches =
          q.statement.toLowerCase().includes(s) ||
          q.subject.toLowerCase().includes(s) ||
          (q.topic?.toLowerCase().includes(s) ?? false) ||
          (q.board?.toLowerCase().includes(s) ?? false) ||
          (q.examTitle?.toLowerCase().includes(s) ?? false);
        if (!matches) return false;
      }
      return true;
    });

    const total = allForUser.length;
    const start = (query.page - 1) * query.limit;
    const items = allForUser.slice(start, start + query.limit);

    return { items, total };
  }

  async updateAtomically(
    id: string,
    data: ParsedUpdateQuestionInput
  ): Promise<QuestionWithAlternatives> {
    const existing = this.questions.get(id);
    if (!existing) {
      throw new Error('Not found');
    }

    const updatedAlternatives: Alternative[] =
      data.alternatives !== undefined
        ? data.alternatives.map((alt, idx) => ({
            id: `alt-${id}-u-${idx + 1}`,
            questionId: id,
            letter: alt.letter,
            text: alt.text,
            position: idx + 1,
          }))
        : existing.alternatives;

    const updated: QuestionWithAlternatives = {
      ...existing,
      statement: data.statement !== undefined ? data.statement : existing.statement,
      type: data.type !== undefined ? data.type : existing.type,
      subject: data.subject !== undefined ? data.subject : existing.subject,
      topic: data.topic !== undefined ? data.topic : existing.topic,
      subtopic: data.subtopic !== undefined ? data.subtopic : existing.subtopic,
      board: data.board !== undefined ? data.board : existing.board,
      examTitle: data.examTitle !== undefined ? data.examTitle : existing.examTitle,
      year: data.year !== undefined ? data.year : existing.year,
      originalNumber:
        data.originalNumber !== undefined ? data.originalNumber : existing.originalNumber,
      difficulty: data.difficulty !== undefined ? data.difficulty : existing.difficulty,
      correctAnswer:
        data.correctAnswer !== undefined ? data.correctAnswer : existing.correctAnswer,
      explanation:
        data.explanation !== undefined ? data.explanation : existing.explanation,
      sourcePage: data.sourcePage !== undefined ? data.sourcePage : existing.sourcePage,
      status: data.status !== undefined ? data.status : existing.status,
      updatedAt: new Date(),
      alternatives: updatedAlternatives,
    };

    this.questions.set(id, updated);
    return updated;
  }

  async deleteById(id: string): Promise<void> {
    this.questions.delete(id);
  }
}

describe('QuestionService — Regras de Domínio do Banco de Questões (backend/tests/question.service.test.ts)', () => {
  let repo: InMemoryQuestionRepository;
  let service: QuestionService;

  const USER_A = 'user-owner-a';
  const USER_B = 'user-other-b';

  beforeEach(() => {
    repo = new InMemoryQuestionRepository();
    service = new QuestionService({ questionRepository: repo });
  });

  it('deve cadastrar questão completa ou com campos opcionais omitidos, mantendo difficulty e correctAnswer null quando não informados', async () => {
    // 1. Questão com dados mínimos (sem difficulty, sem correctAnswer, sem topic/board)
    const minimal = await service.createQuestion(USER_A, {
      statement: 'Julgue o item a seguir acerca dos princípios constitucionais.',
      type: 'TRUE_FALSE',
      subject: 'Direito Constitucional',
    });

    expect(minimal.userId).toBe(USER_A);
    expect(minimal.difficulty).toBeNull();
    expect(minimal.correctAnswer).toBeNull();
    expect(minimal.explanation).toBeNull();
    expect(minimal.hasAnswerKey).toBe(false);
    expect(minimal.alternatives).toHaveLength(0);

    // 2. Questão completa com alternativas e gabarito
    const complete = await service.createQuestion(USER_A, {
      statement: 'Qual é a complexidade média de busca em uma tabela hash bem distribuída?',
      type: 'MULTIPLE_CHOICE',
      subject: 'Ciência da Computação',
      topic: 'Estruturas de Dados',
      board: 'CEBRASPE',
      examTitle: 'Analista de TI 2025',
      year: 2025,
      difficulty: 'EASY',
      correctAnswer: 'a',
      explanation: 'Tabelas hash possuem tempo médio O(1) para busca.',
      alternatives: [
        { letter: 'a', text: 'O(1)' },
        { letter: 'b', text: 'O(log n)' },
        { letter: 'c', text: 'O(n)' },
      ],
    });

    expect(complete.correctAnswer).toBe('A');
    expect(complete.hasAnswerKey).toBe(true);
    expect(complete.hasExplanation).toBe(true);
    expect(complete.alternatives.map((a) => a.letter)).toEqual(['A', 'B', 'C']);
  });

  it('deve aplicar a política de proteção do gabarito: omitir correctAnswer/explanation por padrão e revelá-los apenas ao proprietário quando solicitado', async () => {
    const created = await service.createQuestion(USER_A, {
      statement: 'Assinale a alternativa correspondente ao protocolo de camada de transporte confiável.',
      type: 'MULTIPLE_CHOICE',
      subject: 'Redes de Computadores',
      correctAnswer: 'B',
      explanation: 'O TCP é orientado a conexão e confiável.',
      alternatives: [
        { letter: 'A', text: 'UDP' },
        { letter: 'B', text: 'TCP' },
      ],
    });

    // Consulta padrão sem includeAnswer -> omite correctAnswer e explanation
    const defaultView = await service.getQuestionById(USER_A, created.id);
    expect(defaultView.answerKeyRevealed).toBe(false);
    expect('correctAnswer' in defaultView).toBe(false);
    expect('explanation' in defaultView).toBe(false);
    expect(defaultView.hasAnswerKey).toBe(true);

    // Consulta pelo proprietário com includeAnswer: true -> revela gabarito
    const revealedView = await service.getQuestionById(USER_A, created.id, {
      includeAnswer: true,
    });
    expect(revealedView.answerKeyRevealed).toBe(true);
    if (revealedView.answerKeyRevealed) {
      expect(revealedView.correctAnswer).toBe('B');
      expect(revealedView.explanation).toBe('O TCP é orientado a conexão e confiável.');
    }

    // Listagem paginada padrão -> omite gabarito
    const listDefault = await service.listQuestions(USER_A, { page: 1, limit: 10 });
    expect(listDefault.items[0].answerKeyRevealed).toBe(false);
    expect('correctAnswer' in listDefault.items[0]).toBe(false);
  });

  it('deve rejeitar alternativas com letras duplicadas ou correctAnswer inexistente nas alternativas', async () => {
    // Letras duplicadas
    await expect(
      service.createQuestion(USER_A, {
        statement: 'Questão com alternativas duplicadas.',
        subject: 'Português',
        alternatives: [
          { letter: 'A', text: 'Opção 1' },
          { letter: 'A', text: 'Opção 2 repetida' },
        ],
      })
    ).rejects.toMatchObject({
      code: 'QUESTION_VALIDATION_ERROR',
      statusCode: 400,
    });

    // correctAnswer fora das alternativas
    await expect(
      service.createQuestion(USER_A, {
        statement: 'Questão com gabarito fora das alternativas.',
        subject: 'Português',
        correctAnswer: 'E',
        alternatives: [
          { letter: 'A', text: 'Opção A' },
          { letter: 'B', text: 'Opção B' },
        ],
      })
    ).rejects.toMatchObject({
      code: 'QUESTION_VALIDATION_ERROR',
      statusCode: 400,
    });
  });

  it('deve atualizar alternativas atomicamente e rejeitar atualização que remova a alternativa apontada por correctAnswer', async () => {
    const created = await service.createQuestion(USER_A, {
      statement: 'Questão original para teste de atualização atômica.',
      subject: 'Matemática',
      correctAnswer: 'C',
      alternatives: [
        { letter: 'A', text: '10' },
        { letter: 'B', text: '20' },
        { letter: 'C', text: '30' },
      ],
    });

    // Tenta atualizar as alternativas para apenas A e B mantendo correctAnswer = 'C' no registro -> deve rejeitar
    await expect(
      service.updateQuestion(USER_A, created.id, {
        alternatives: [
          { letter: 'A', text: '100' },
          { letter: 'B', text: '200' },
        ],
      })
    ).rejects.toMatchObject({
      code: 'QUESTION_VALIDATION_ERROR',
      statusCode: 400,
    });

    // Atualiza alternativas para A e B e altera simultaneamente correctAnswer para 'B' -> deve suceder
    const updated = await service.updateQuestion(USER_A, created.id, {
      correctAnswer: 'B',
      alternatives: [
        { letter: 'A', text: '100' },
        { letter: 'B', text: '200' },
      ],
    });

    expect(updated.correctAnswer).toBe('B');
    expect(updated.alternatives).toHaveLength(2);
    expect(updated.alternatives[1].text).toBe('200');
  });

  it('deve garantir isolamento estrito entre usuários (Usuário B não pode visualizar, editar ou excluir questão de Usuário A)', async () => {
    const questionOfA = await service.createQuestion(USER_A, {
      statement: 'Questão privada do Usuário A.',
      subject: 'Direito Administrativo',
    });

    // Usuário B tenta buscar por ID (mesmo passando includeAnswer: true)
    await expect(
      service.getQuestionById(USER_B, questionOfA.id, { includeAnswer: true })
    ).rejects.toMatchObject({
      code: 'QUESTION_FORBIDDEN',
      statusCode: 403,
    });

    // Usuário B tenta editar
    await expect(
      service.updateQuestion(USER_B, questionOfA.id, {
        statement: 'Tentativa de adulteração pelo Usuário B.',
      })
    ).rejects.toMatchObject({
      code: 'QUESTION_FORBIDDEN',
      statusCode: 403,
    });

    // Usuário B tenta excluir
    await expect(service.deleteQuestion(USER_B, questionOfA.id)).rejects.toMatchObject({
      code: 'QUESTION_FORBIDDEN',
      statusCode: 403,
    });

    // Listagem do Usuário B deve retornar vazia
    const listOfB = await service.listQuestions(USER_B);
    expect(listOfB.total).toBe(0);
    expect(listOfB.items).toHaveLength(0);
  });

  it('deve filtrar e paginar questões corretamente por disciplina, banca, tipo, dificuldade e busca textual', async () => {
    await service.createQuestion(USER_A, {
      statement: 'Questão sobre árvores binárias de busca.',
      subject: 'Algoritmos',
      topic: 'Árvores',
      board: 'FGV',
      type: 'MULTIPLE_CHOICE',
      difficulty: 'MEDIUM',
    });

    await service.createQuestion(USER_A, {
      statement: 'Questão sobre normalização de banco de dados relacional.',
      subject: 'Banco de Dados',
      topic: 'Modelagem',
      board: 'CEBRASPE',
      type: 'TRUE_FALSE',
      difficulty: 'HARD',
    });

    await service.createQuestion(USER_A, {
      statement: 'Questão sobre índices B-Tree em PostgreSQL.',
      subject: 'Banco de Dados',
      topic: 'Performance',
      board: 'FGV',
      type: 'MULTIPLE_CHOICE',
      difficulty: 'HARD',
    });

    const bySubject = await service.listQuestions(USER_A, { subject: 'Banco de Dados' });
    expect(bySubject.total).toBe(2);

    const byBoardAndDifficulty = await service.listQuestions(USER_A, {
      board: 'FGV',
      difficulty: 'HARD',
    });
    expect(byBoardAndDifficulty.total).toBe(1);
    expect(byBoardAndDifficulty.items[0].topic).toBe('Performance');

    const paginated = await service.listQuestions(USER_A, { page: 1, limit: 2 });
    expect(paginated.items).toHaveLength(2);
    expect(paginated.total).toBe(3);
    expect(paginated.totalPages).toBe(2);
  });
});
