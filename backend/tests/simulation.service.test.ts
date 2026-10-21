import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  AnswerKeySource,
  OfficialAnswerKey,
  OfficialAnswerKeyItem,
  QuestionAttempt,
  Simulation,
  SimulationStatus,
} from '@prisma/client';
import { SimulationService } from '../src/services/simulation.service.ts';
import type {
  ISimulationRepository,
} from '../src/repositories/simulation.repository.ts';
import type {
  IQuestionAttemptRepository,
} from '../src/repositories/question-attempt.repository.ts';
import type {
  IQuestionRepository,
  QuestionWithAlternatives,
} from '../src/repositories/question.repository.ts';
import type {
  IOfficialAnswerKeyRepository,
} from '../src/repositories/official-answer-key.repository.ts';
import {
  SimulationDomainError,
  type CreateSimulationRequest,
  type SimulationWithFullDetails,
  type SimulationWithQuestions,
} from '../src/types/simulation.types.ts';

describe('SimulationService (backend/src/services/simulation.service.ts)', () => {
  let simulationService: SimulationService;
  let mockSimulationRepo: any;
  let mockAttemptRepo: any;
  let mockQuestionRepo: any;
  let mockOfficialKeyRepo: any;

  const mockDate = new Date('2026-10-20T12:00:00.000Z');

  const sampleQuestion1: QuestionWithAlternatives = {
    id: 'q-1',
    userId: 'user-1',
    examId: 'exam-1',
    originalNumber: 1,
    statement: 'Qual é o princípio fundamental da RFB?',
    type: 'MULTIPLE_CHOICE',
    subject: 'Direito Constitucional',
    topic: 'Princípios Fundamentais',
    subtopic: null,
    board: 'CESPE',
    examTitle: 'PF 2026',
    year: 2026,
    difficulty: 'MEDIUM',
    correctAnswer: 'A',
    explanation: 'Art. 1º da CF/88.',
    sourcePage: 1,
    status: 'ACTIVE',
    createdAt: mockDate,
    updatedAt: mockDate,
    alternatives: [
      { id: 'alt-1a', questionId: 'q-1', letter: 'A', text: 'Soberania', position: 1 },
      { id: 'alt-1b', questionId: 'q-1', letter: 'B', text: 'Monarquia', position: 2 },
    ],
  };

  const sampleQuestion2: QuestionWithAlternatives = {
    id: 'q-2',
    userId: 'user-1',
    examId: null,
    originalNumber: null,
    statement: 'Qual a concordância correta?',
    type: 'MULTIPLE_CHOICE',
    subject: 'Língua Portuguesa',
    topic: 'Sintaxe',
    subtopic: null,
    board: 'FGV',
    examTitle: 'Concurso Nacional',
    year: 2025,
    difficulty: 'EASY',
    correctAnswer: 'B',
    explanation: 'Regra geral de concordância verbal.',
    sourcePage: null,
    status: 'ACTIVE',
    createdAt: mockDate,
    updatedAt: mockDate,
    alternatives: [
      { id: 'alt-2a', questionId: 'q-2', letter: 'A', text: 'Houveram problemas', position: 1 },
      { id: 'alt-2b', questionId: 'q-2', letter: 'B', text: 'Houve problemas', position: 2 },
    ],
  };

  const sampleQuestion3Annulled: QuestionWithAlternatives = {
    id: 'q-3',
    userId: 'user-1',
    examId: 'exam-1',
    originalNumber: 3,
    statement: 'Questão polêmica sobre ato administrativo',
    type: 'MULTIPLE_CHOICE',
    subject: 'Direito Administrativo',
    topic: 'Atos Administrativos',
    subtopic: null,
    board: 'CESPE',
    examTitle: 'PF 2026',
    year: 2026,
    difficulty: 'HARD',
    correctAnswer: null,
    explanation: 'Questão com duas alternativas corretas.',
    sourcePage: 2,
    status: 'ACTIVE',
    createdAt: mockDate,
    updatedAt: mockDate,
    alternatives: [
      { id: 'alt-3a', questionId: 'q-3', letter: 'A', text: 'Opção 1', position: 1 },
      { id: 'alt-3b', questionId: 'q-3', letter: 'B', text: 'Opção 2', position: 2 },
    ],
  };

  const sampleOfficialKey: OfficialAnswerKey & { items: OfficialAnswerKeyItem[] } = {
    id: 'key-1',
    userId: 'user-1',
    examId: 'exam-1',
    pdfDocumentId: 'pdf-1',
    type: 'FINAL',
    status: 'PUBLISHED',
    version: 2,
    isCurrent: true,
    publicationDate: mockDate,
    notes: 'Gabarito oficial definitivo',
    createdAt: mockDate,
    updatedAt: mockDate,
    items: [
      {
        id: 'item-1',
        answerKeyId: 'key-1',
        questionNumber: 1,
        questionId: 'q-1',
        correctAnswer: 'A',
        previousAnswer: 'B',
        status: 'CHANGED',
        isAnnulled: false,
        justification: 'Retificação pós-recurso',
        textEvidence: '1. A',
        confidence: 1.0,
        sourcePage: 1,
        createdAt: mockDate,
        updatedAt: mockDate,
      },
      {
        id: 'item-3',
        answerKeyId: 'key-1',
        questionNumber: 3,
        questionId: 'q-3',
        correctAnswer: null,
        previousAnswer: 'A',
        status: 'ANNULLED',
        isAnnulled: true,
        justification: 'Anulada pela banca examinadora',
        textEvidence: '3. Anulada',
        confidence: 1.0,
        sourcePage: 2,
        createdAt: mockDate,
        updatedAt: mockDate,
      },
    ],
  };

  const baseSimulation: SimulationWithFullDetails = {
    id: 'sim-1',
    userId: 'user-1',
    title: 'Simulado de Teste',
    status: 'IN_PROGRESS' as SimulationStatus,
    totalQuestions: 2,
    timeLimitSeconds: 3600,
    startedAt: new Date(),
    finishedAt: null,
    durationSeconds: null,
    scorePercentage: null,
    correctCount: null,
    wrongCount: null,
    unansweredCount: null,
    createdAt: mockDate,
    updatedAt: mockDate,
    questions: [
      {
        id: 'sq-1',
        simulationId: 'sim-1',
        questionId: 'q-1',
        position: 1,
        answerKeySnapshot: 'A',
        isAnnulledSnapshot: false,
        snapshotSource: 'OFFICIAL_KEY' as AnswerKeySource,
        officialAnswerKeyId: 'key-1',
        officialAnswerKeyItemId: 'item-1',
        officialAnswerKeyVersion: 2,
        createdAt: mockDate,
        question: sampleQuestion1,
      },
      {
        id: 'sq-2',
        simulationId: 'sim-1',
        questionId: 'q-2',
        position: 2,
        answerKeySnapshot: 'B',
        isAnnulledSnapshot: false,
        snapshotSource: 'QUESTION_BANK' as AnswerKeySource,
        officialAnswerKeyId: null,
        officialAnswerKeyItemId: null,
        officialAnswerKeyVersion: null,
        createdAt: mockDate,
        question: sampleQuestion2,
      },
    ],
    attempts: [],
  };

  beforeEach(() => {
    mockSimulationRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByIdAndUser: vi.fn(),
      findByIdWithQuestions: vi.fn(),
      findByIdWithFullDetails: vi.fn(),
      findManyByUser: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      countByUserAndStatus: vi.fn(),
    };

    mockAttemptRepo = {
      upsertAttempt: vi.fn(),
      findBySimulationAndQuestion: vi.fn(),
      findManyBySimulation: vi.fn(),
      countAttempts: vi.fn(),
      deleteBySimulation: vi.fn(),
    };

    mockQuestionRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findManyByUser: vi.fn(),
      updateAtomically: vi.fn(),
      deleteById: vi.fn(),
      findEligibleForSimulation: vi.fn(),
      findByIdsAndUser: vi.fn(),
    };

    mockOfficialKeyRepo = {
      findCurrentByExamIdWithItems: vi.fn(),
    };

    baseSimulation.startedAt = new Date();
    baseSimulation.status = 'IN_PROGRESS' as SimulationStatus;
    baseSimulation.timeLimitSeconds = 3600;

    simulationService = new SimulationService({
      simulationRepository: mockSimulationRepo as ISimulationRepository,
      questionAttemptRepository: mockAttemptRepo as IQuestionAttemptRepository,
      questionRepository: mockQuestionRepo as IQuestionRepository,
      officialAnswerKeyRepository: mockOfficialKeyRepo as IOfficialAnswerKeyRepository,
    });
  });

  // ==========================================================================
  // 1. Criação com configuração válida
  // ==========================================================================
  it('1. deve criar um simulado com configuração válida, randomização e snapshots', async () => {
    mockQuestionRepo.findEligibleForSimulation.mockResolvedValue([
      sampleQuestion1,
      sampleQuestion2,
    ]);
    mockOfficialKeyRepo.findCurrentByExamIdWithItems.mockResolvedValue(sampleOfficialKey);

    mockSimulationRepo.create.mockResolvedValue({
      ...baseSimulation,
      status: 'CREATED',
      timeLimitSeconds: 7200,
      startedAt: null,
    });

    const request: CreateSimulationRequest = {
      title: 'Simulado PF 2026',
      totalQuestions: 2,
      timeLimitSeconds: 7200,
      criteria: { subject: 'Direito' },
    };

    const result = await simulationService.createSimulation('user-1', request);

    expect(result.id).toBe('sim-1');
    expect(result.status).toBe('CREATED');
    expect(result.totalQuestions).toBe(2);
    expect(result.timeLimitSeconds).toBe(7200);
    expect(mockSimulationRepo.create).toHaveBeenCalledTimes(1);

    const createPayload = mockSimulationRepo.create.mock.calls[0][0];
    expect(createPayload.userId).toBe('user-1');
    expect(createPayload.questions).toHaveLength(2);
    expect(createPayload.questions[0].position).toBe(1);
    expect(createPayload.questions[1].position).toBe(2);
  });

  // ==========================================================================
  // 2. Rejeição por quantidade insuficiente de questões elegíveis
  // ==========================================================================
  it('2. deve rejeitar criação com HTTP 422 quando a quantidade de questões elegíveis for insuficiente', async () => {
    mockQuestionRepo.findEligibleForSimulation.mockResolvedValue([sampleQuestion1]);
    mockOfficialKeyRepo.findCurrentByExamIdWithItems.mockResolvedValue(sampleOfficialKey);

    const request: CreateSimulationRequest = {
      totalQuestions: 5,
    };

    await expect(simulationService.createSimulation('user-1', request)).rejects.toMatchObject({
      name: 'SimulationDomainError',
      code: 'SIMULATION_INSUFFICIENT_QUESTIONS',
      statusCode: 422,
    });

    expect(mockSimulationRepo.create).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // 3. Rejeição de questões duplicadas
  // ==========================================================================
  it('3. deve rejeitar a criação se a lista de questionIds fornecida contiver IDs duplicados', async () => {
    const request: CreateSimulationRequest = {
      totalQuestions: 2,
      questionIds: ['q-1', 'q-1'],
    };

    await expect(simulationService.createSimulation('user-1', request)).rejects.toMatchObject({
      name: 'SimulationDomainError',
      code: 'SIMULATION_INVALID_INPUT',
      statusCode: 400,
    });

    expect(mockSimulationRepo.create).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // 4. Preservação dos snapshots de gabarito e anulação
  // ==========================================================================
  it('4. deve preservar o snapshot de gabarito oficial e anulação da questão no momento da criação', async () => {
    mockQuestionRepo.findEligibleForSimulation.mockResolvedValue([
      sampleQuestion1,
      sampleQuestion3Annulled,
    ]);
    mockOfficialKeyRepo.findCurrentByExamIdWithItems.mockResolvedValue(sampleOfficialKey);

    mockSimulationRepo.create.mockResolvedValue({
      ...baseSimulation,
      questions: [
        { ...baseSimulation.questions[0] },
        {
          id: 'sq-3',
          simulationId: 'sim-1',
          questionId: 'q-3',
          position: 2,
          answerKeySnapshot: null,
          isAnnulledSnapshot: true,
          snapshotSource: 'OFFICIAL_KEY',
          officialAnswerKeyId: 'key-1',
          officialAnswerKeyItemId: 'item-3',
          officialAnswerKeyVersion: 2,
          createdAt: mockDate,
          question: sampleQuestion3Annulled,
        },
      ],
    });

    const result = await simulationService.createSimulation('user-1', {
      totalQuestions: 2,
    });

    const createPayload = mockSimulationRepo.create.mock.calls[0][0];
    const item1Snapshot = createPayload.questions.find((q: any) => q.questionId === 'q-1');
    const item3Snapshot = createPayload.questions.find((q: any) => q.questionId === 'q-3');

    expect(item1Snapshot.answerKeySnapshot).toBe('A');
    expect(item1Snapshot.isAnnulledSnapshot).toBe(false);
    expect(item1Snapshot.snapshotSource).toBe('OFFICIAL_KEY');
    expect(item1Snapshot.officialAnswerKeyVersion).toBe(2);

    expect(item3Snapshot.isAnnulledSnapshot).toBe(true);
    expect(item3Snapshot.snapshotSource).toBe('OFFICIAL_KEY');
    expect(item3Snapshot.officialAnswerKeyItemId).toBe('item-3');
  });

  // ==========================================================================
  // 5. Isolamento entre usuários
  // ==========================================================================
  it('5. deve impedir que um usuário acerte, consulte ou finalize simulado de outro usuário com 404', async () => {
    mockSimulationRepo.findByIdWithFullDetails.mockResolvedValue(null);

    await expect(
      simulationService.getSimulation('usuario-invasor', 'sim-1')
    ).rejects.toMatchObject({
      name: 'SimulationDomainError',
      code: 'SIMULATION_NOT_FOUND',
      statusCode: 404,
    });

    expect(mockSimulationRepo.findByIdWithFullDetails).toHaveBeenCalledWith(
      'sim-1',
      'usuario-invasor'
    );
  });

  // ==========================================================================
  // 6. Rejeição de alternativa pertencente a outra questão
  // ==========================================================================
  it('6. deve rejeitar resposta quando a alternativa pertencer a outra questão com 400', async () => {
    mockSimulationRepo.findByIdWithQuestions.mockResolvedValue(baseSimulation);

    // Tentando enviar a alternativa 'alt-2a' (que pertence a q-2) para a questão 'q-1'
    await expect(
      simulationService.submitAnswer('user-1', {
        simulationId: 'sim-1',
        questionId: 'q-1',
        selectedAlternativeId: 'alt-2a',
      })
    ).rejects.toMatchObject({
      name: 'SimulationDomainError',
      code: 'ALTERNATIVE_MISMATCH',
      statusCode: 400,
    });

    expect(mockAttemptRepo.upsertAttempt).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // 7. Rejeição de alternativa inexistente
  // ==========================================================================
  it('7. deve rejeitar resposta quando a alternativa não existir na questão', async () => {
    mockSimulationRepo.findByIdWithQuestions.mockResolvedValue(baseSimulation);

    await expect(
      simulationService.submitAnswer('user-1', {
        simulationId: 'sim-1',
        questionId: 'q-1',
        selectedAlternativeId: 'alt-fantasma-inexistente',
      })
    ).rejects.toMatchObject({
      name: 'SimulationDomainError',
      code: 'ALTERNATIVE_MISMATCH',
      statusCode: 400,
    });

    expect(mockAttemptRepo.upsertAttempt).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // 8. Consistência entre alternativa e letra selecionadas
  // ==========================================================================
  it('8. deve extrair a letra correta da alternativa diretamente do banco de dados', async () => {
    mockSimulationRepo.findByIdWithQuestions.mockResolvedValue(baseSimulation);

    mockAttemptRepo.upsertAttempt.mockResolvedValue({
      id: 'att-1',
      userId: 'user-1',
      simulationId: 'sim-1',
      questionId: 'q-1',
      selectedAlternativeId: 'alt-1a',
      selectedLetter: 'A',
      isCorrect: true,
      timeSpentSeconds: 30,
      answeredAt: mockDate,
      createdAt: mockDate,
      updatedAt: mockDate,
    });

    await simulationService.submitAnswer('user-1', {
      simulationId: 'sim-1',
      questionId: 'q-1',
      selectedAlternativeId: 'alt-1a',
    });

    expect(mockAttemptRepo.upsertAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedAlternativeId: 'alt-1a',
        selectedLetter: 'A', // extraído da alternativa
      })
    );
  });

  // ==========================================================================
  // 9. Cálculo de correção pelo backend
  // ==========================================================================
  it('9. deve calcular isCorrect exclusivamente pelo backend confrontando com o snapshot', async () => {
    mockSimulationRepo.findByIdWithQuestions.mockResolvedValue(baseSimulation);

    // Gabarito do snapshot de q-1 é 'A'
    // Usuário seleciona 'alt-1b' (letra 'B')
    await simulationService.submitAnswer('user-1', {
      simulationId: 'sim-1',
      questionId: 'q-1',
      selectedAlternativeId: 'alt-1b',
    });

    expect(mockAttemptRepo.upsertAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedAlternativeId: 'alt-1b',
        selectedLetter: 'B',
        isCorrect: false, // Calculado pelo backend
      })
    );
  });

  // ==========================================================================
  // 10. Distinção entre resposta em branco e resposta errada
  // ==========================================================================
  it('10. deve representar questão em branco como isCorrect: null sem confundir com resposta errada', async () => {
    mockSimulationRepo.findByIdWithQuestions.mockResolvedValue(baseSimulation);

    await simulationService.submitAnswer('user-1', {
      simulationId: 'sim-1',
      questionId: 'q-1',
      selectedAlternativeId: null, // Deixada em branco
    });

    expect(mockAttemptRepo.upsertAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedAlternativeId: null,
        selectedLetter: null,
        isCorrect: null, // Branco não é erro
      })
    );
  });

  // ==========================================================================
  // 11. Alteração de resposta durante simulado em andamento
  // ==========================================================================
  it('11. deve permitir alterar a resposta enquanto o simulado estiver em andamento', async () => {
    mockSimulationRepo.findByIdWithQuestions.mockResolvedValue(baseSimulation);

    mockAttemptRepo.upsertAttempt.mockResolvedValue({
      id: 'att-1',
      userId: 'user-1',
      simulationId: 'sim-1',
      questionId: 'q-1',
      selectedAlternativeId: 'alt-1a',
      selectedLetter: 'A',
      isCorrect: true,
      timeSpentSeconds: 15,
      answeredAt: mockDate,
      createdAt: mockDate,
      updatedAt: mockDate,
    });

    const result = await simulationService.submitAnswer('user-1', {
      simulationId: 'sim-1',
      questionId: 'q-1',
      selectedAlternativeId: 'alt-1a',
    });

    expect(result.selectedLetter).toBe('A');
    expect(mockAttemptRepo.upsertAttempt).toHaveBeenCalledTimes(1);
  });

  // ==========================================================================
  // 12. Bloqueio de resposta após finalização
  // ==========================================================================
  it('12. deve impedir resposta ou alteração após finalização do simulado com HTTP 409', async () => {
    const completedSimulation = {
      ...baseSimulation,
      status: 'COMPLETED' as SimulationStatus,
    };
    mockSimulationRepo.findByIdWithQuestions.mockResolvedValue(completedSimulation);

    await expect(
      simulationService.submitAnswer('user-1', {
        simulationId: 'sim-1',
        questionId: 'q-1',
        selectedAlternativeId: 'alt-1a',
      })
    ).rejects.toMatchObject({
      name: 'SimulationDomainError',
      code: 'SIMULATION_ALREADY_COMPLETED',
      statusCode: 409,
    });

    expect(mockAttemptRepo.upsertAttempt).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // 13. Tempo opcional e estudo livre
  // ==========================================================================
  it('13. deve suportar simulado em modo estudo livre (timeLimitSeconds = null) que nunca expira', async () => {
    const freeStudySimulation = {
      ...baseSimulation,
      timeLimitSeconds: null,
      startedAt: new Date(Date.now() - 365 * 24 * 3600 * 1000), // Iniciado há 1 ano
    };
    mockSimulationRepo.findByIdWithQuestions.mockResolvedValue(freeStudySimulation);

    await simulationService.submitAnswer('user-1', {
      simulationId: 'sim-1',
      questionId: 'q-1',
      selectedAlternativeId: 'alt-1a',
    });

    expect(mockAttemptRepo.upsertAttempt).toHaveBeenCalled();
  });

  // ==========================================================================
  // 14. Expiração de simulado cronometrado
  // ==========================================================================
  it('14. deve expirar simulado cronometrado quando now > startedAt + timeLimitSeconds e rejeitar resposta com 410', async () => {
    const expiredSimulation = {
      ...baseSimulation,
      timeLimitSeconds: 300, // 5 minutos
      startedAt: new Date(Date.now() - 600 * 1000), // Iniciado há 10 minutos
    };
    mockSimulationRepo.findByIdWithQuestions.mockResolvedValue(expiredSimulation);

    await expect(
      simulationService.submitAnswer('user-1', {
        simulationId: 'sim-1',
        questionId: 'q-1',
        selectedAlternativeId: 'alt-1a',
      })
    ).rejects.toMatchObject({
      name: 'SimulationDomainError',
      code: 'SIMULATION_EXPIRED',
      statusCode: 410,
    });

    expect(mockSimulationRepo.update).toHaveBeenCalledWith(
      'sim-1',
      'user-1',
      expect.objectContaining({ status: 'EXPIRED' })
    );
  });

  // ==========================================================================
  // 15. Finalização e cálculo correto dos resultados
  // ==========================================================================
  it('15. deve calcular pontuação, acertos, erros e em branco corretamente na finalização', async () => {
    const simToFinalize: SimulationWithFullDetails = {
      ...baseSimulation,
      attempts: [
        {
          id: 'att-1',
          userId: 'user-1',
          simulationId: 'sim-1',
          questionId: 'q-1',
          selectedAlternativeId: 'alt-1a',
          selectedLetter: 'A',
          isCorrect: true, // Acertou q-1
          timeSpentSeconds: 40,
          answeredAt: mockDate,
          createdAt: mockDate,
          updatedAt: mockDate,
        },
        // q-2 não foi respondida (em branco)
      ],
    };

    mockSimulationRepo.findByIdWithFullDetails.mockResolvedValue(simToFinalize);

    const result = await simulationService.finishSimulation('user-1', 'sim-1');

    expect(result.status).toBe('COMPLETED');
    expect(result.correctCount).toBe(1);
    expect(result.wrongCount).toBe(0);
    expect(result.unansweredCount).toBe(1);
    expect(result.scorePercentage).toBe(50.0); // 1 acerto de 2 questões = 50%
    expect(mockSimulationRepo.update).toHaveBeenCalledWith(
      'sim-1',
      'user-1',
      expect.objectContaining({
        status: 'COMPLETED',
        correctCount: 1,
        wrongCount: 0,
        unansweredCount: 1,
        scorePercentage: 50.0,
      })
    );
  });

  // ==========================================================================
  // 16. Tratamento de questões anuladas
  // ==========================================================================
  it('16. deve atribuir o ponto à questão anulada no snapshot independente da resposta dada', async () => {
    const simWithAnnulled: SimulationWithFullDetails = {
      ...baseSimulation,
      questions: [
        {
          ...baseSimulation.questions[0],
          isAnnulledSnapshot: true, // Questão 1 anulada
        },
        {
          ...baseSimulation.questions[1],
        },
      ],
      attempts: [
        {
          id: 'att-1',
          userId: 'user-1',
          simulationId: 'sim-1',
          questionId: 'q-1',
          selectedAlternativeId: 'alt-1b',
          selectedLetter: 'B', // Aluno marcou B, gabarito inicial era A
          isCorrect: true, // Mas anulada pontua!
          timeSpentSeconds: 20,
          answeredAt: mockDate,
          createdAt: mockDate,
          updatedAt: mockDate,
        },
      ],
    };

    mockSimulationRepo.findByIdWithFullDetails.mockResolvedValue(simWithAnnulled);

    const result = await simulationService.finishSimulation('user-1', 'sim-1');

    expect(result.correctCount).toBe(1);
    expect(result.unansweredCount).toBe(1); // q-2 em branco
    expect(result.scorePercentage).toBe(50.0);
  });

  // ==========================================================================
  // 17. Idempotência da finalização
  // ==========================================================================
  it('17. deve ser idempotente se finishSimulation for chamado mais de uma vez', async () => {
    const alreadyCompleted: SimulationWithFullDetails = {
      ...baseSimulation,
      status: 'COMPLETED',
      scorePercentage: 100,
      correctCount: 2,
      wrongCount: 0,
      unansweredCount: 0,
    };

    mockSimulationRepo.findByIdWithFullDetails.mockResolvedValue(alreadyCompleted);

    const result = await simulationService.finishSimulation('user-1', 'sim-1');

    expect(result.status).toBe('COMPLETED');
    expect(result.scorePercentage).toBe(100);
    // Não deve executar novo update
    expect(mockSimulationRepo.update).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // 18. Transições de estado inválidas
  // ==========================================================================
  it('18. deve rejeitar transições inválidas (tentar iniciar simulado finalizado ou abandonado)', async () => {
    const completedSim = {
      ...baseSimulation,
      status: 'COMPLETED' as SimulationStatus,
    };
    mockSimulationRepo.findByIdWithFullDetails.mockResolvedValue(completedSim);

    await expect(
      simulationService.startSimulation('user-1', 'sim-1')
    ).rejects.toMatchObject({
      name: 'SimulationDomainError',
      code: 'SIMULATION_ALREADY_COMPLETED',
      statusCode: 409,
    });
  });

  // ==========================================================================
  // 19. Tentativa de operar sobre simulado de outro usuário
  // ==========================================================================
  it('19. deve rejeitar exclusão de simulado pertencente a outro usuário', async () => {
    mockSimulationRepo.findByIdAndUser.mockResolvedValue(null);

    await expect(
      simulationService.deleteSimulation('usuario-invasor', 'sim-1')
    ).rejects.toMatchObject({
      name: 'SimulationDomainError',
      code: 'SIMULATION_NOT_FOUND',
      statusCode: 404,
    });

    expect(mockAttemptRepo.deleteBySimulation).not.toHaveBeenCalled();
    expect(mockSimulationRepo.delete).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // 20. Prevenção de inconsistências em operações concorrentes
  // ==========================================================================
  it('20. deve delegar persistência de tentativas ao upsert atômico do repositório prevenindo duplicidade concorrente', async () => {
    mockSimulationRepo.findByIdWithQuestions.mockResolvedValue(baseSimulation);

    mockAttemptRepo.upsertAttempt.mockResolvedValue({
      id: 'att-1',
      userId: 'user-1',
      simulationId: 'sim-1',
      questionId: 'q-1',
      selectedAlternativeId: 'alt-1a',
      selectedLetter: 'A',
      isCorrect: true,
      timeSpentSeconds: 10,
      answeredAt: mockDate,
      createdAt: mockDate,
      updatedAt: mockDate,
    });

    // Dois cliques simultâneos
    await Promise.all([
      simulationService.submitAnswer('user-1', {
        simulationId: 'sim-1',
        questionId: 'q-1',
        selectedAlternativeId: 'alt-1a',
      }),
      simulationService.submitAnswer('user-1', {
        simulationId: 'sim-1',
        questionId: 'q-1',
        selectedAlternativeId: 'alt-1a',
      }),
    ]);

    expect(mockAttemptRepo.upsertAttempt).toHaveBeenCalledTimes(2);
  });

  // ==========================================================================
  // 21. Sprint 6.3-B: Concorrência e idempotência com updateIfStatus
  // ==========================================================================
  it('21. deve utilizar updateIfStatus para transição atômica de status evitando finalizações concorrentes redundantes', async () => {
    mockSimulationRepo.updateIfStatus = vi.fn().mockResolvedValue({
      ...baseSimulation,
      status: 'COMPLETED',
    });
    mockSimulationRepo.findByIdWithFullDetails.mockResolvedValue(baseSimulation);

    const result = await simulationService.finishSimulation('user-1', 'sim-1');

    expect(mockSimulationRepo.updateIfStatus).toHaveBeenCalledWith(
      'sim-1',
      'user-1',
      ['CREATED', 'IN_PROGRESS'],
      expect.objectContaining({
        status: 'COMPLETED',
      })
    );
    expect(result.status).toBe('COMPLETED');
  });

  it('22. deve retornar com idempotência se updateIfStatus indicar que outra finalização concorrente já concluiu o simulado', async () => {
    // updateIfStatus retorna null (conflito: outra transação já alterou o status)
    mockSimulationRepo.updateIfStatus = vi.fn().mockResolvedValue(null);
    mockSimulationRepo.findByIdWithFullDetails
      .mockResolvedValueOnce(baseSimulation) // Primeira consulta antes de tentar finalizar
      .mockResolvedValueOnce({
        // Segunda consulta re-obtendo o resultado já concluído pela concorrente
        ...baseSimulation,
        status: 'COMPLETED',
        scorePercentage: 100,
        correctCount: 2,
        wrongCount: 0,
        unansweredCount: 0,
      });

    const result = await simulationService.finishSimulation('user-1', 'sim-1');

    expect(mockSimulationRepo.updateIfStatus).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('COMPLETED');
    expect(result.scorePercentage).toBe(100);
  });

  // ==========================================================================
  // 23. Sprint 6.3-B: Fallback de seleção de questões sem truncamento a 50
  // ==========================================================================
  it('23. deve paginar completamente no fallback de seleção sem truncar a amostra a 50 questões', async () => {
    // Sem findEligibleForSimulation -> ativa fallback
    delete mockQuestionRepo.findEligibleForSimulation;

    // Simula 75 questões ativas divididas em 2 páginas
    const page1Questions: QuestionWithAlternatives[] = Array.from({ length: 50 }, (_, i) => ({
      ...sampleQuestion1,
      id: `q-p1-${i + 1}`,
      statement: `Questão Página 1 #${i + 1}`,
    }));

    const page2Questions: QuestionWithAlternatives[] = Array.from({ length: 25 }, (_, i) => ({
      ...sampleQuestion2,
      id: `q-p2-${i + 1}`,
      statement: `Questão Página 2 #${i + 1}`,
    }));

    mockQuestionRepo.findManyByUser.mockImplementation((_userId: string, query: any) => {
      if (query.page === 1) {
        return Promise.resolve({
          items: page1Questions,
          total: 75,
        });
      }
      return Promise.resolve({
        items: page2Questions,
        total: 75,
      });
    });

    mockOfficialKeyRepo.findCurrentByExamIdWithItems.mockResolvedValue(null);

    mockSimulationRepo.create.mockResolvedValue({
      id: 'sim-paginated',
      userId: 'user-1',
      title: 'Simulado Amostra Grande',
      status: 'CREATED',
      totalQuestions: 60,
      timeLimitSeconds: null,
      startedAt: null,
      finishedAt: null,
      durationSeconds: null,
      scorePercentage: null,
      correctCount: null,
      wrongCount: null,
      unansweredCount: null,
      createdAt: mockDate,
      updatedAt: mockDate,
      questions: [],
    });

    // Solicita 60 questões (que antes falharia com 422 se truncado a 50)
    await simulationService.createSimulation('user-1', {
      totalQuestions: 60,
    });

    // Deve ter chamado as 2 páginas
    expect(mockQuestionRepo.findManyByUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ page: 1, limit: 50 })
    );
    expect(mockQuestionRepo.findManyByUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ page: 2, limit: 50 })
    );

    // Deve ter criado simulado com as 60 questões selecionadas da amostra completa de 75
    expect(mockSimulationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        totalQuestions: 60,
        questions: expect.arrayContaining([expect.objectContaining({ position: 1 })]),
      })
    );
  });

  // ==========================================================================
  // 24. Sprint 6.3-B: Preservação de tentativas ao expirar simulado em submitAnswer
  // ==========================================================================
  it('24. deve preservar tentativas existentes ao expirar simulado cronometrado durante submitAnswer', async () => {
    const expiredSimulation: SimulationWithFullDetails = {
      ...baseSimulation,
      timeLimitSeconds: 300,
      startedAt: new Date(Date.now() - 600 * 1000), // Expirado há 5 minutos
      attempts: [
        {
          id: 'att-1',
          userId: 'user-1',
          simulationId: 'sim-1',
          questionId: 'q-1',
          selectedAlternativeId: 'alt-1a',
          selectedLetter: 'A',
          isCorrect: true, // Questão 1 acertada
          timeSpentSeconds: 40,
          answeredAt: mockDate,
          createdAt: mockDate,
          updatedAt: mockDate,
        },
      ],
    };

    mockSimulationRepo.findByIdWithQuestions.mockResolvedValue(expiredSimulation);
    mockSimulationRepo.findByIdWithFullDetails.mockResolvedValue(expiredSimulation);

    await expect(
      simulationService.submitAnswer('user-1', {
        simulationId: 'sim-1',
        questionId: 'q-2',
        selectedAlternativeId: 'alt-2a',
      })
    ).rejects.toMatchObject({
      code: 'SIMULATION_EXPIRED',
      statusCode: 410,
    });

    // Finalização como EXPIRED deve consolidar a tentativa existente (1 acerto, 1 em branco)
    expect(mockSimulationRepo.update).toHaveBeenCalledWith(
      'sim-1',
      'user-1',
      expect.objectContaining({
        status: 'EXPIRED',
        correctCount: 1,
        unansweredCount: 1,
        wrongCount: 0,
        scorePercentage: 50.0,
      })
    );
  });

  // ==========================================================================
  // SPRINT 6.3-D: TESTES OBRIGATÓRIOS DE CONCORRÊNCIA E INTEGRIDADE ATÔMICA
  // ==========================================================================
  describe('Sprint 6.3-D: Concorrência e integridade atômica', () => {
    // Cenário 1: submitAnswer obtém a trava antes de finishSimulation
    // (a resposta deve ser persistida e o resultado consolidado final deve incluí-la)
    it('Cenário 1: submitAnswer obtém a trava antes de finishSimulation -> resposta persistida e consolidada no resultado final', async () => {
      let lockQueue = Promise.resolve();
      const attemptsStore: any[] = [];
      const currentSimState: any = { ...baseSimulation, attempts: attemptsStore };

      mockSimulationRepo.executeInSimulationLock = vi.fn().mockImplementation(async (_simId, _userId, action) => {
        const prev = lockQueue;
        let resolveNext: () => void;
        lockQueue = new Promise((resolve) => { resolveNext = resolve; });
        await prev;
        try {
          const lockedSimRepo = {
            ...mockSimulationRepo,
            findByIdWithQuestions: vi.fn().mockResolvedValue(currentSimState),
            findByIdWithFullDetails: vi.fn().mockResolvedValue({ ...currentSimState, attempts: [...attemptsStore] }),
            update: vi.fn().mockImplementation(async (_id, _u, data) => {
              Object.assign(currentSimState, data);
              return currentSimState;
            }),
            updateIfStatus: vi.fn().mockImplementation(async (_id, _u, statuses, data) => {
              if (statuses.includes(currentSimState.status)) {
                Object.assign(currentSimState, data);
                return currentSimState;
              }
              return null;
            }),
          };
          const lockedAttemptRepo = {
            ...mockAttemptRepo,
            upsertAttempt: vi.fn().mockImplementation(async (attData) => {
              const newAtt = { id: 'att-created', ...attData, createdAt: new Date(), updatedAt: new Date() };
              attemptsStore.push(newAtt);
              return newAtt;
            }),
          };
          return await action(lockedSimRepo, lockedAttemptRepo);
        } finally {
          resolveNext!();
        }
      });

      const submitPromise = simulationService.submitAnswer('user-1', {
        simulationId: 'sim-1',
        questionId: 'q-1',
        selectedAlternativeId: 'alt-1a',
      });
      const finishPromise = simulationService.finishSimulation('user-1', 'sim-1');

      const [submitRes, finishRes] = await Promise.all([submitPromise, finishPromise]);

      expect(submitRes.selectedLetter).toBe('A');
      expect(submitRes.isCorrect).toBe(true);
      expect(finishRes.status).toBe('COMPLETED');
      expect(finishRes.correctCount).toBe(1);
      expect(finishRes.scorePercentage).toBe(50.0);
    });

    // Cenário 2: finishSimulation obtém a trava antes de submitAnswer
    // (o simulado deve ser concluído e a submissão subsequente rejeitada com 409 sem alterar tentativas)
    it('Cenário 2: finishSimulation obtém a trava antes de submitAnswer -> simulado concluído e submissão rejeitada com 409', async () => {
      let lockQueue = Promise.resolve();
      const attemptsStore: any[] = [];
      const currentSimState: any = { ...baseSimulation, attempts: attemptsStore };

      mockSimulationRepo.executeInSimulationLock = vi.fn().mockImplementation(async (_simId, _userId, action) => {
        const prev = lockQueue;
        let resolveNext: () => void;
        lockQueue = new Promise((resolve) => { resolveNext = resolve; });
        await prev;
        try {
          const lockedSimRepo = {
            ...mockSimulationRepo,
            findByIdWithQuestions: vi.fn().mockResolvedValue(currentSimState),
            findByIdWithFullDetails: vi.fn().mockResolvedValue({ ...currentSimState, attempts: [...attemptsStore] }),
            update: vi.fn().mockImplementation(async (_id, _u, data) => {
              Object.assign(currentSimState, data);
              return currentSimState;
            }),
            updateIfStatus: vi.fn().mockImplementation(async (_id, _u, statuses, data) => {
              if (statuses.includes(currentSimState.status)) {
                Object.assign(currentSimState, data);
                return currentSimState;
              }
              return null;
            }),
          };
          const lockedAttemptRepo = {
            ...mockAttemptRepo,
            upsertAttempt: vi.fn().mockImplementation(async (attData) => {
              const newAtt = { id: 'att-created', ...attData };
              attemptsStore.push(newAtt);
              return newAtt;
            }),
          };
          return await action(lockedSimRepo, lockedAttemptRepo);
        } finally {
          resolveNext!();
        }
      });

      const finishRes = await simulationService.finishSimulation('user-1', 'sim-1');
      expect(finishRes.status).toBe('COMPLETED');

      await expect(
        simulationService.submitAnswer('user-1', {
          simulationId: 'sim-1',
          questionId: 'q-1',
          selectedAlternativeId: 'alt-1a',
        })
      ).rejects.toMatchObject({
        name: 'SimulationDomainError',
        code: 'SIMULATION_ALREADY_COMPLETED',
        statusCode: 409,
      });

      expect(attemptsStore).toHaveLength(0);
    });

    // Cenário 3: Duas chamadas simultâneas a finishSimulation
    // (a primeira conclui, a segunda é serializada e retorna o resultado consolidado sem recalcular incorretamente)
    it('Cenário 3: Duas chamadas simultâneas a finishSimulation -> idempotência serializada', async () => {
      let lockQueue = Promise.resolve();
      let updateCount = 0;
      const currentSimState: any = { ...baseSimulation, attempts: [] };

      mockSimulationRepo.executeInSimulationLock = vi.fn().mockImplementation(async (_simId, _userId, action) => {
        const prev = lockQueue;
        let resolveNext: () => void;
        lockQueue = new Promise((resolve) => { resolveNext = resolve; });
        await prev;
        try {
          const lockedSimRepo = {
            ...mockSimulationRepo,
            findByIdWithFullDetails: vi.fn().mockResolvedValue({ ...currentSimState }),
            updateIfStatus: vi.fn().mockImplementation(async (_id, _u, statuses, data) => {
              if (statuses.includes(currentSimState.status)) {
                updateCount++;
                Object.assign(currentSimState, data);
                return currentSimState;
              }
              return null;
            }),
          };
          return await action(lockedSimRepo, mockAttemptRepo);
        } finally {
          resolveNext!();
        }
      });

      const [res1, res2] = await Promise.all([
        simulationService.finishSimulation('user-1', 'sim-1'),
        simulationService.finishSimulation('user-1', 'sim-1'),
      ]);

      expect(res1.status).toBe('COMPLETED');
      expect(res2.status).toBe('COMPLETED');
      expect(updateCount).toBe(1);
    });

    // Cenário 4: Expiração concorrente com submissão
    // (respostas já confirmadas são preservadas, tentativas após expiração não são gravadas)
    it('Cenário 4: Expiração concorrente com submissão -> respostas confirmadas preservadas, novas respostas rejeitadas com 410', async () => {
      const expiredSimulation: any = {
        ...baseSimulation,
        timeLimitSeconds: 60,
        startedAt: new Date(Date.now() - 3600 * 1000),
        attempts: [
          {
            id: 'att-1',
            userId: 'user-1',
            simulationId: 'sim-1',
            questionId: 'q-1',
            selectedAlternativeId: 'alt-1a',
            selectedLetter: 'A',
            isCorrect: true,
            timeSpentSeconds: 30,
            answeredAt: mockDate,
            createdAt: mockDate,
            updatedAt: mockDate,
          },
        ],
      };

      mockSimulationRepo.executeInSimulationLock = vi.fn().mockImplementation(async (_simId, _userId, action) => {
        const lockedSimRepo = {
          ...mockSimulationRepo,
          findByIdWithQuestions: vi.fn().mockResolvedValue(expiredSimulation),
          findByIdWithFullDetails: vi.fn().mockResolvedValue(expiredSimulation),
          update: vi.fn().mockImplementation(async (_id, _u, data) => {
            Object.assign(expiredSimulation, data);
            return expiredSimulation;
          }),
        };
        return action(lockedSimRepo, mockAttemptRepo);
      });

      await expect(
        simulationService.submitAnswer('user-1', {
          simulationId: 'sim-1',
          questionId: 'q-2',
          selectedAlternativeId: 'alt-2a',
        })
      ).rejects.toMatchObject({
        code: 'SIMULATION_EXPIRED',
        statusCode: 410,
      });

      expect(mockAttemptRepo.upsertAttempt).not.toHaveBeenCalled();
      expect(expiredSimulation.status).toBe('EXPIRED');
      expect(expiredSimulation.correctCount).toBe(1);
    });

    // Cenário 5: Concorrência entre startSimulation e abandonSimulation ou finishSimulation
    // (transições de estado não devem gerar estados inconsistentes)
    it('Cenário 5: Concorrência entre startSimulation e abandonSimulation -> transições consistentes sem sobrescrita', async () => {
      let lockQueue = Promise.resolve();
      const currentSimState: any = {
        ...baseSimulation,
        status: 'CREATED' as SimulationStatus,
        startedAt: null,
      };

      mockSimulationRepo.executeInSimulationLock = vi.fn().mockImplementation(async (_simId, _userId, action) => {
        const prev = lockQueue;
        let resolveNext: () => void;
        lockQueue = new Promise((resolve) => { resolveNext = resolve; });
        await prev;
        try {
          const lockedSimRepo = {
            ...mockSimulationRepo,
            findByIdWithFullDetails: vi.fn().mockResolvedValue({ ...currentSimState }),
            findByIdAndUser: vi.fn().mockResolvedValue({ ...currentSimState }),
            updateIfStatus: vi.fn().mockImplementation(async (_id, _u, statuses, data) => {
              if (statuses.includes(currentSimState.status)) {
                Object.assign(currentSimState, data);
                return currentSimState;
              }
              return null;
            }),
            update: vi.fn().mockImplementation(async (_id, _u, data) => {
              Object.assign(currentSimState, data);
              return currentSimState;
            }),
          };
          return await action(lockedSimRepo, mockAttemptRepo);
        } finally {
          resolveNext!();
        }
      });

      const abandonRes = await simulationService.abandonSimulation('user-1', 'sim-1');
      expect(abandonRes.status).toBe('ABANDONED');

      await expect(
        simulationService.startSimulation('user-1', 'sim-1')
      ).rejects.toMatchObject({
        code: 'SIMULATION_NOT_IN_PROGRESS',
        statusCode: 400,
      });
    });

    // Cenário 6: Submissões concorrentes para a mesma questão
    // (nenhuma duplicação, última escrita serializada persiste)
    it('Cenário 6: Submissões concorrentes para a mesma questão -> serializadas e a última persiste', async () => {
      let lockQueue = Promise.resolve();
      const attemptsStore = new Map<string, any>();

      mockSimulationRepo.executeInSimulationLock = vi.fn().mockImplementation(async (_simId, _userId, action) => {
        const prev = lockQueue;
        let resolveNext: () => void;
        lockQueue = new Promise((resolve) => { resolveNext = resolve; });
        await prev;
        try {
          const lockedSimRepo = {
            ...mockSimulationRepo,
            findByIdWithQuestions: vi.fn().mockResolvedValue(baseSimulation),
          };
          const lockedAttemptRepo = {
            ...mockAttemptRepo,
            upsertAttempt: vi.fn().mockImplementation(async (data) => {
              const attempt = { id: 'att-1', ...data };
              attemptsStore.set(data.questionId, attempt);
              return attempt;
            }),
          };
          return await action(lockedSimRepo, lockedAttemptRepo);
        } finally {
          resolveNext!();
        }
      });

      await Promise.all([
        simulationService.submitAnswer('user-1', {
          simulationId: 'sim-1',
          questionId: 'q-1',
          selectedAlternativeId: 'alt-1a',
        }),
        simulationService.submitAnswer('user-1', {
          simulationId: 'sim-1',
          questionId: 'q-1',
          selectedAlternativeId: 'alt-1b',
        }),
      ]);

      expect(attemptsStore.size).toBe(1);
      expect(attemptsStore.get('q-1')).toBeDefined();
    });

    // Cenário 7: Falha durante a transação
    // (rollback garante que o simulado não fique com status de finalizado sem contadores atualizados)
    it('Cenário 7: Falha durante a transação sob lock -> exceção propagada para acionar rollback atômico', async () => {
      mockSimulationRepo.executeInSimulationLock = vi.fn().mockImplementation(async () => {
        throw new Error('Database disk error during transaction');
      });

      await expect(
        simulationService.finishSimulation('user-1', 'sim-1')
      ).rejects.toThrow('Database disk error during transaction');
    });

    // Cenário 8: Isolamento entre usuários
    // (usuário B não consegue travar nem alterar simulado do usuário A)
    it('Cenário 8: Isolamento entre usuários -> usuário B recebe 404 e não obtém acesso ao simulado do usuário A', async () => {
      mockSimulationRepo.executeInSimulationLock = vi.fn().mockImplementation(async (_simId, _userId, action) => {
        const lockedSimRepo = {
          ...mockSimulationRepo,
          findByIdWithQuestions: vi.fn().mockResolvedValue(null),
          findByIdWithFullDetails: vi.fn().mockResolvedValue(null),
        };
        return action(lockedSimRepo, mockAttemptRepo);
      });

      await expect(
        simulationService.submitAnswer('usuario-invasor', {
          simulationId: 'sim-1',
          questionId: 'q-1',
          selectedAlternativeId: 'alt-1a',
        })
      ).rejects.toMatchObject({
        code: 'SIMULATION_NOT_FOUND',
        statusCode: 404,
      });

      expect(mockAttemptRepo.upsertAttempt).not.toHaveBeenCalled();
    });
  });
});
