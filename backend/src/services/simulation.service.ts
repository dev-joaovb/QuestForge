import type {
  AnswerKeySource,
  OfficialAnswerKey,
  OfficialAnswerKeyItem,
  QuestionAttempt,
  Simulation,
} from '@prisma/client';
import {
  PrismaSimulationRepository,
  type ISimulationRepository,
} from '../repositories/simulation.repository.ts';
import {
  PrismaQuestionAttemptRepository,
  type IQuestionAttemptRepository,
} from '../repositories/question-attempt.repository.ts';
import {
  PrismaQuestionRepository,
  type IQuestionRepository,
  type QuestionWithAlternatives,
} from '../repositories/question.repository.ts';
import {
  PrismaOfficialAnswerKeyRepository,
  type IOfficialAnswerKeyRepository,
} from '../repositories/official-answer-key.repository.ts';
import {
  SimulationDomainError,
  type CreateSimulationQuestionInput,
  type CreateSimulationRequest,
  type PaginatedSimulationsResult,
  type QuestionAttemptWithAlternative,
  type SimulationDetailDTO,
  type SimulationFilterParams,
  type SimulationPublicQuestionDTO,
  type SimulationResultDTO,
  type SimulationReviewQuestionDTO,
  type SimulationStatus,
  type SimulationSummaryDTO,
  type SimulationWithFullDetails,
  type SubmitAnswerRequest,
} from '../types/simulation.types.ts';
import { logger } from '../utils/logger.ts';

export interface SimulationServiceDependencies {
  simulationRepository?: ISimulationRepository;
  questionAttemptRepository?: IQuestionAttemptRepository;
  questionRepository?: IQuestionRepository;
  officialAnswerKeyRepository?: IOfficialAnswerKeyRepository;
}

interface ResolvedQuestionSnapshot {
  question: QuestionWithAlternatives;
  answerKeySnapshot: string | null;
  isAnnulledSnapshot: boolean;
  snapshotSource: AnswerKeySource;
  officialAnswerKeyId: string | null;
  officialAnswerKeyItemId: string | null;
  officialAnswerKeyVersion: number | null;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export class SimulationService {
  private readonly simulationRepository: ISimulationRepository;
  private readonly questionAttemptRepository: IQuestionAttemptRepository;
  private readonly questionRepository: IQuestionRepository;
  private readonly officialAnswerKeyRepository: IOfficialAnswerKeyRepository;

  constructor(deps: SimulationServiceDependencies = {}) {
    this.simulationRepository =
      deps.simulationRepository ?? new PrismaSimulationRepository();
    this.questionAttemptRepository =
      deps.questionAttemptRepository ?? new PrismaQuestionAttemptRepository();
    this.questionRepository =
      deps.questionRepository ?? new PrismaQuestionRepository();
    this.officialAnswerKeyRepository =
      deps.officialAnswerKeyRepository ?? new PrismaOfficialAnswerKeyRepository();
  }

  private assertValidActorUserId(actorUserId: string): string {
    if (!actorUserId || typeof actorUserId !== 'string' || actorUserId.trim() === '') {
      throw new SimulationDomainError(
        'SIMULATION_FORBIDDEN',
        'Usuário autenticado obrigatório para operações de simulado.',
        403
      );
    }
    return actorUserId.trim();
  }

  private assertValidId(id: string, fieldName: string): string {
    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new SimulationDomainError(
        'SIMULATION_INVALID_INPUT',
        `O identificador (${fieldName}) é obrigatório.`,
        400
      );
    }
    return id.trim();
  }

  private calculateTimer(simulation: Simulation): {
    isExpired: boolean;
    timeRemainingSeconds: number | null;
  } {
    if (simulation.timeLimitSeconds === null || simulation.timeLimitSeconds === undefined) {
      return { isExpired: false, timeRemainingSeconds: null };
    }

    if (!simulation.startedAt) {
      return { isExpired: false, timeRemainingSeconds: simulation.timeLimitSeconds };
    }

    const elapsedSeconds = Math.floor(
      (Date.now() - simulation.startedAt.getTime()) / 1000
    );
    const timeRemainingSeconds = Math.max(0, simulation.timeLimitSeconds - elapsedSeconds);
    const isExpired = elapsedSeconds >= simulation.timeLimitSeconds;

    return { isExpired, timeRemainingSeconds };
  }

  /**
   * Resolve o snapshot do gabarito oficial ou do banco de questões para uma questão individual.
   * Não altera entidades existentes e não sincroniza campos silenciosamente.
   */
  private resolveQuestionSnapshot(
    question: QuestionWithAlternatives,
    officialKey: (OfficialAnswerKey & { items: OfficialAnswerKeyItem[] }) | null
  ): ResolvedQuestionSnapshot | null {
    // 1. Tentar resolver a partir do gabarito oficial publicado vigente
    if (officialKey && officialKey.items && officialKey.items.length > 0) {
      const item = officialKey.items.find(
        (i) =>
          i.questionId === question.id ||
          (question.originalNumber !== null &&
            i.questionNumber === question.originalNumber)
      );

      if (item) {
        // Se estiver pendente de revisão, NÃO é elegível
        if (item.status === 'NEEDS_REVIEW') {
          return null;
        }

        // Se for anulada, é elegível com pontuação garantida
        if (item.isAnnulled) {
          return {
            question,
            answerKeySnapshot: item.correctAnswer ? item.correctAnswer.trim().toUpperCase() : null,
            isAnnulledSnapshot: true,
            snapshotSource: 'OFFICIAL_KEY',
            officialAnswerKeyId: officialKey.id,
            officialAnswerKeyItemId: item.id,
            officialAnswerKeyVersion: officialKey.version,
          };
        }

        // Se tiver resposta válida
        if (item.correctAnswer && item.correctAnswer.trim() !== '') {
          return {
            question,
            answerKeySnapshot: item.correctAnswer.trim().toUpperCase(),
            isAnnulledSnapshot: false,
            snapshotSource: 'OFFICIAL_KEY',
            officialAnswerKeyId: officialKey.id,
            officialAnswerKeyItemId: item.id,
            officialAnswerKeyVersion: officialKey.version,
          };
        }

        return null;
      }
    }

    // 2. Se não houver gabarito oficial aplicável, usar Question.correctAnswer quando válido
    if (question.correctAnswer && question.correctAnswer.trim() !== '') {
      const normalizedAnswer = question.correctAnswer.trim().toUpperCase();
      const validLetters = new Set(
        question.alternatives.map((a) => a.letter.trim().toUpperCase())
      );

      // A resposta do banco de questões precisa corresponder a uma alternativa existente
      if (validLetters.has(normalizedAnswer)) {
        return {
          question,
          answerKeySnapshot: normalizedAnswer,
          isAnnulledSnapshot: false,
          snapshotSource: 'QUESTION_BANK',
          officialAnswerKeyId: null,
          officialAnswerKeyItemId: null,
          officialAnswerKeyVersion: null,
        };
      }
    }

    // Sem gabarito oficial nem resposta válida no banco: NÃO elegível
    return null;
  }

  /**
   * Cria um novo simulado persistido no PostgreSQL via Prisma.
   * Seleção e randomização ocorrem exclusivamente no backend.
   */
  async createSimulation(
    actorUserId: string,
    request: CreateSimulationRequest
  ): Promise<SimulationDetailDTO> {
    const validUserId = this.assertValidActorUserId(actorUserId);

    if (
      !request.totalQuestions ||
      typeof request.totalQuestions !== 'number' ||
      !Number.isInteger(request.totalQuestions) ||
      request.totalQuestions <= 0
    ) {
      throw new SimulationDomainError(
        'SIMULATION_INVALID_INPUT',
        'A quantidade total de questões deve ser um número inteiro positivo.',
        400
      );
    }

    if (
      request.timeLimitSeconds !== undefined &&
      request.timeLimitSeconds !== null
    ) {
      if (
        typeof request.timeLimitSeconds !== 'number' ||
        !Number.isInteger(request.timeLimitSeconds) ||
        request.timeLimitSeconds <= 0
      ) {
        throw new SimulationDomainError(
          'SIMULATION_INVALID_INPUT',
          'O limite de tempo deve ser um número inteiro positivo em segundos.',
          400
        );
      }
    }

    let candidateQuestions: QuestionWithAlternatives[] = [];

    // 1. Obtenção de questões candidatas
    if (request.questionIds && request.questionIds.length > 0) {
      const uniqueIds = Array.from(new Set(request.questionIds));
      if (uniqueIds.length !== request.questionIds.length) {
        throw new SimulationDomainError(
          'SIMULATION_INVALID_INPUT',
          'A lista de questões contém identificadores duplicados.',
          400
        );
      }

      if (this.questionRepository.findByIdsAndUser) {
        candidateQuestions = await this.questionRepository.findByIdsAndUser(
          uniqueIds,
          validUserId
        );
      } else {
        const found = await Promise.all(
          uniqueIds.map((id) => this.questionRepository.findById(id))
        );
        candidateQuestions = found.filter(
          (q): q is QuestionWithAlternatives => q !== null && q.userId === validUserId
        );
      }

      if (candidateQuestions.length !== uniqueIds.length) {
        throw new SimulationDomainError(
          'SIMULATION_QUESTION_NOT_FOUND',
          'Uma ou mais questões solicitadas não foram encontradas ou não pertencem ao usuário.',
          404
        );
      }

      // Filtrar apenas ativas
      candidateQuestions = candidateQuestions.filter((q) => q.status === 'ACTIVE');
    } else {
      if (this.questionRepository.findEligibleForSimulation) {
        candidateQuestions = await this.questionRepository.findEligibleForSimulation(
          validUserId,
          request.criteria
        );
      } else {
        const paginated = await this.questionRepository.findManyByUser(validUserId, {
          page: 1,
          limit: 50,
          search: undefined,
          includeAnswer: true,
          subject: request.criteria?.subject,
          topic: request.criteria?.topic,
          board: request.criteria?.board,
          examTitle: request.criteria?.examTitle,
          type: request.criteria?.type,
          difficulty: request.criteria?.difficulty,
        });
        candidateQuestions = paginated.items.filter((q) => q.status === 'ACTIVE');
      }
    }

    // 2. Cache local de gabaritos oficiais para evitar queries redundantes
    const officialKeysCache = new Map<
      string,
      (OfficialAnswerKey & { items: OfficialAnswerKeyItem[] }) | null
    >();

    const getOfficialKeyForExam = async (examId: string) => {
      if (!officialKeysCache.has(examId)) {
        const key =
          await this.officialAnswerKeyRepository.findCurrentByExamIdWithItems(
            examId,
            validUserId
          );
        officialKeysCache.set(examId, key);
      }
      return officialKeysCache.get(examId) ?? null;
    };

    // 3. Filtrar somente questões com gabarito válido e resolver snapshots
    const resolvedCandidates: ResolvedQuestionSnapshot[] = [];

    for (const question of candidateQuestions) {
      let officialKey: (OfficialAnswerKey & { items: OfficialAnswerKeyItem[] }) | null =
        null;
      if (question.examId) {
        officialKey = await getOfficialKeyForExam(question.examId);
      }

      const snapshot = this.resolveQuestionSnapshot(question, officialKey);
      if (snapshot) {
        resolvedCandidates.push(snapshot);
      }
    }

    // 4. Verificação de quantidade suficiente (Decisão de Produto 4: Rejeitar com 422)
    if (resolvedCandidates.length < request.totalQuestions) {
      throw new SimulationDomainError(
        'SIMULATION_INSUFFICIENT_QUESTIONS',
        `Quantidade insuficiente de questões elegíveis com gabarito válido. Solicitadas: ${request.totalQuestions}, Disponíveis: ${resolvedCandidates.length}.`,
        422,
        {
          requested: request.totalQuestions,
          available: resolvedCandidates.length,
        }
      );
    }

    // 5. Randomização no backend (se questionIds explícitos não foram fornecidos)
    let selectedSnapshots: ResolvedQuestionSnapshot[];
    if (request.questionIds && request.questionIds.length > 0) {
      selectedSnapshots = resolvedCandidates.slice(0, request.totalQuestions);
    } else {
      const shuffled = shuffleArray(resolvedCandidates);
      selectedSnapshots = shuffled.slice(0, request.totalQuestions);
    }

    // 6. Atribuição de posições estáveis e sequenciais (1..N)
    const questionsToCreate: CreateSimulationQuestionInput[] = selectedSnapshots.map(
      (s, index) => ({
        questionId: s.question.id,
        position: index + 1,
        answerKeySnapshot: s.answerKeySnapshot,
        isAnnulledSnapshot: s.isAnnulledSnapshot,
        snapshotSource: s.snapshotSource,
        officialAnswerKeyId: s.officialAnswerKeyId,
        officialAnswerKeyItemId: s.officialAnswerKeyItemId,
        officialAnswerKeyVersion: s.officialAnswerKeyVersion,
      })
    );

    const created = await this.simulationRepository.create({
      userId: validUserId,
      title: request.title ?? null,
      timeLimitSeconds: request.timeLimitSeconds ?? null,
      totalQuestions: request.totalQuestions,
      status: 'CREATED',
      questions: questionsToCreate,
    });

    logger.info('simulation_created', {
      simulationId: created.id,
      userId: validUserId,
      totalQuestions: created.totalQuestions,
      timeLimitSeconds: created.timeLimitSeconds,
    });

    return this.toSimulationDetailDTO({
      ...created,
      attempts: [],
    });
  }

  /**
   * Inicia o simulado e marca o horário oficial no servidor (`startedAt`).
   */
  async startSimulation(
    actorUserId: string,
    simulationId: string
  ): Promise<SimulationDetailDTO> {
    const validUserId = this.assertValidActorUserId(actorUserId);
    const validSimId = this.assertValidId(simulationId, 'simulationId');

    const simulation = await this.simulationRepository.findByIdWithFullDetails(
      validSimId,
      validUserId
    );

    if (!simulation) {
      throw new SimulationDomainError(
        'SIMULATION_NOT_FOUND',
        'Simulado não encontrado.',
        404
      );
    }

    // Idempotência se já estiver em andamento
    if (simulation.status === 'IN_PROGRESS') {
      const { isExpired } = this.calculateTimer(simulation);
      if (isExpired) {
        return this.finalizeInternal(simulation, validUserId, 'EXPIRED');
      }
      return this.toSimulationDetailDTO(simulation);
    }

    if (simulation.status === 'COMPLETED' || simulation.status === 'EXPIRED') {
      throw new SimulationDomainError(
        'SIMULATION_ALREADY_COMPLETED',
        'Este simulado já foi finalizado e não pode ser reiniciado.',
        409
      );
    }

    if (simulation.status === 'ABANDONED') {
      throw new SimulationDomainError(
        'SIMULATION_NOT_IN_PROGRESS',
        'Este simulado foi abandonado e não pode ser iniciado.',
        400
      );
    }

    const startedAt = new Date();
    await this.simulationRepository.update(validSimId, validUserId, {
      status: 'IN_PROGRESS',
      startedAt,
    });

    simulation.status = 'IN_PROGRESS';
    simulation.startedAt = startedAt;

    logger.info('simulation_started', {
      simulationId: validSimId,
      userId: validUserId,
      startedAt,
    });

    return this.toSimulationDetailDTO(simulation);
  }

  /**
   * Obtém os detalhes do simulado com proteção do gabarito em andamento e cálculo de tempo restante.
   */
  async getSimulation(
    actorUserId: string,
    simulationId: string
  ): Promise<SimulationDetailDTO> {
    const validUserId = this.assertValidActorUserId(actorUserId);
    const validSimId = this.assertValidId(simulationId, 'simulationId');

    const simulation = await this.simulationRepository.findByIdWithFullDetails(
      validSimId,
      validUserId
    );

    if (!simulation) {
      throw new SimulationDomainError(
        'SIMULATION_NOT_FOUND',
        'Simulado não encontrado.',
        404
      );
    }

    // Verificação de expiração automática durante consulta
    if (simulation.status === 'IN_PROGRESS') {
      const { isExpired } = this.calculateTimer(simulation);
      if (isExpired) {
        return this.finalizeInternal(simulation, validUserId, 'EXPIRED');
      }
    }

    return this.toSimulationDetailDTO(simulation);
  }

  /**
   * Registra ou altera a resposta do usuário a uma questão do simulado.
   * `isCorrect` é calculado exclusivamente pelo backend com base no snapshot do gabarito.
   */
  async submitAnswer(
    actorUserId: string,
    request: SubmitAnswerRequest
  ): Promise<QuestionAttempt> {
    const validUserId = this.assertValidActorUserId(actorUserId);
    const validSimId = this.assertValidId(request.simulationId, 'simulationId');
    const validQId = this.assertValidId(request.questionId, 'questionId');

    const simulation = await this.simulationRepository.findByIdWithQuestions(
      validSimId,
      validUserId
    );

    if (!simulation) {
      throw new SimulationDomainError(
        'SIMULATION_NOT_FOUND',
        'Simulado não encontrado.',
        404
      );
    }

    if (simulation.status === 'COMPLETED') {
      throw new SimulationDomainError(
        'SIMULATION_ALREADY_COMPLETED',
        'Este simulado já foi finalizado e não aceita novas respostas.',
        409
      );
    }

    if (simulation.status === 'EXPIRED') {
      throw new SimulationDomainError(
        'SIMULATION_EXPIRED',
        'O tempo limite do simulado expirou.',
        410
      );
    }

    if (simulation.status === 'ABANDONED') {
      throw new SimulationDomainError(
        'SIMULATION_NOT_IN_PROGRESS',
        'Este simulado foi abandonado e não aceita respostas.',
        400
      );
    }

    // Iniciar automaticamente caso a primeira resposta venha com status CREATED
    if (simulation.status === 'CREATED') {
      const startedAt = new Date();
      await this.simulationRepository.update(validSimId, validUserId, {
        status: 'IN_PROGRESS',
        startedAt,
      });
      simulation.status = 'IN_PROGRESS';
      simulation.startedAt = startedAt;
    }

    // Checagem de tempo expirado
    const { isExpired } = this.calculateTimer(simulation);
    if (isExpired) {
      await this.finalizeInternal(
        { ...simulation, attempts: [] },
        validUserId,
        'EXPIRED'
      );
      throw new SimulationDomainError(
        'SIMULATION_EXPIRED',
        'O tempo limite do simulado expirou.',
        410
      );
    }

    // Localizar a questão no simulado
    const simQuestion = simulation.questions.find(
      (sq) => sq.questionId === validQId
    );

    if (!simQuestion) {
      throw new SimulationDomainError(
        'SIMULATION_QUESTION_MISMATCH',
        'A questão informada não pertence a este simulado.',
        400
      );
    }

    let selectedAlternativeId: string | null = null;
    let selectedLetter: string | null = null;
    let isCorrect: boolean | null = null;

    if (
      request.selectedAlternativeId !== null &&
      request.selectedAlternativeId !== undefined &&
      request.selectedAlternativeId.trim() !== ''
    ) {
      const cleanAltId = request.selectedAlternativeId.trim();

      // Validação: a alternativa deve pertencer à questão respondida (Resolve ACH-02 da auditoria)
      const foundAlt = simQuestion.question.alternatives.find(
        (a) => a.id === cleanAltId
      );

      if (!foundAlt) {
        throw new SimulationDomainError(
          'ALTERNATIVE_MISMATCH',
          'A alternativa selecionada não pertence a esta questão ou não existe.',
          400
        );
      }

      selectedAlternativeId = foundAlt.id;
      // Letra extraída diretamente da alternativa validada no banco
      selectedLetter = foundAlt.letter.trim().toUpperCase();

      // Cálculo de correção no backend usando o snapshot do simulado
      if (simQuestion.isAnnulledSnapshot) {
        // Questão anulada atribui ponto a todos os candidatos
        isCorrect = true;
      } else if (simQuestion.answerKeySnapshot) {
        isCorrect =
          selectedLetter === simQuestion.answerKeySnapshot.trim().toUpperCase();
      } else {
        isCorrect = false;
      }
    } else {
      // Resposta em branco ou desmarcada
      selectedAlternativeId = null;
      selectedLetter = null;
      isCorrect = null;
    }

    const attempt = await this.questionAttemptRepository.upsertAttempt({
      userId: validUserId,
      simulationId: validSimId,
      questionId: validQId,
      selectedAlternativeId,
      selectedLetter,
      isCorrect,
      timeSpentSeconds: request.timeSpentSeconds ?? null,
      answeredAt: new Date(),
    });

    logger.info('simulation_answer_submitted', {
      simulationId: validSimId,
      questionId: validQId,
      userId: validUserId,
      hasAnswer: selectedAlternativeId !== null,
    });

    return attempt;
  }

  /**
   * Finaliza o simulado, calcula os resultados consolidados e os persiste no PostgreSQL.
   */
  async finishSimulation(
    actorUserId: string,
    simulationId: string
  ): Promise<SimulationResultDTO> {
    const validUserId = this.assertValidActorUserId(actorUserId);
    const validSimId = this.assertValidId(simulationId, 'simulationId');

    const simulation = await this.simulationRepository.findByIdWithFullDetails(
      validSimId,
      validUserId
    );

    if (!simulation) {
      throw new SimulationDomainError(
        'SIMULATION_NOT_FOUND',
        'Simulado não encontrado.',
        404
      );
    }

    // Idempotência
    if (simulation.status === 'COMPLETED' || simulation.status === 'EXPIRED') {
      return this.toSimulationResultDTO(simulation);
    }

    if (simulation.status === 'ABANDONED') {
      throw new SimulationDomainError(
        'SIMULATION_NOT_IN_PROGRESS',
        'Um simulado abandonado não pode ser finalizado.',
        400
      );
    }

    const { isExpired } = this.calculateTimer(simulation);
    const targetStatus = isExpired ? 'EXPIRED' : 'COMPLETED';

    return this.finalizeInternal(simulation, validUserId, targetStatus);
  }

  /**
   * Executa a apuração e persistência atômica da finalização do simulado.
   */
  private async finalizeInternal(
    simulation: SimulationWithFullDetails,
    actorUserId: string,
    targetStatus: 'COMPLETED' | 'EXPIRED'
  ): Promise<SimulationResultDTO> {
    const attemptsMap = new Map<string, QuestionAttemptWithAlternative>();
    for (const att of simulation.attempts) {
      attemptsMap.set(att.questionId, att);
    }

    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;

    for (const sq of simulation.questions) {
      const attempt = attemptsMap.get(sq.questionId);
      const hasAnswer =
        attempt &&
        attempt.selectedAlternativeId !== null &&
        attempt.selectedAlternativeId !== undefined;

      if (sq.isAnnulledSnapshot) {
        // Questão anulada: pontuação computada conforme decisão de produto
        correctCount++;
      } else if (hasAnswer) {
        if (attempt.isCorrect === true) {
          correctCount++;
        } else {
          wrongCount++;
        }
      } else {
        // Questão não respondida e não anulada
        unansweredCount++;
      }
    }

    const totalQuestions = simulation.totalQuestions;
    const scorePercentage =
      totalQuestions > 0
        ? Number(((correctCount / totalQuestions) * 100).toFixed(2))
        : 0;

    const finishedAt = new Date();
    let durationSeconds = 0;
    if (simulation.startedAt) {
      const elapsed = Math.max(
        0,
        Math.round((finishedAt.getTime() - simulation.startedAt.getTime()) / 1000)
      );
      if (simulation.timeLimitSeconds && elapsed > simulation.timeLimitSeconds) {
        durationSeconds = simulation.timeLimitSeconds;
      } else {
        durationSeconds = elapsed;
      }
    }

    await this.simulationRepository.update(simulation.id, actorUserId, {
      status: targetStatus,
      finishedAt,
      durationSeconds,
      scorePercentage,
      correctCount,
      wrongCount,
      unansweredCount,
    });

    simulation.status = targetStatus;
    simulation.finishedAt = finishedAt;
    simulation.durationSeconds = durationSeconds;
    simulation.scorePercentage = scorePercentage;
    simulation.correctCount = correctCount;
    simulation.wrongCount = wrongCount;
    simulation.unansweredCount = unansweredCount;

    logger.info('simulation_finalized', {
      simulationId: simulation.id,
      userId: actorUserId,
      status: targetStatus,
      scorePercentage,
      correctCount,
      wrongCount,
      unansweredCount,
    });

    return this.toSimulationResultDTO(simulation);
  }

  /**
   * Abandona o simulado em andamento.
   */
  async abandonSimulation(
    actorUserId: string,
    simulationId: string
  ): Promise<SimulationSummaryDTO> {
    const validUserId = this.assertValidActorUserId(actorUserId);
    const validSimId = this.assertValidId(simulationId, 'simulationId');

    const simulation = await this.simulationRepository.findByIdAndUser(
      validSimId,
      validUserId
    );

    if (!simulation) {
      throw new SimulationDomainError(
        'SIMULATION_NOT_FOUND',
        'Simulado não encontrado.',
        404
      );
    }

    if (simulation.status === 'COMPLETED' || simulation.status === 'EXPIRED') {
      throw new SimulationDomainError(
        'SIMULATION_ALREADY_COMPLETED',
        'Este simulado já foi finalizado e não pode ser abandonado.',
        409
      );
    }

    if (simulation.status === 'ABANDONED') {
      return this.toSimulationSummaryDTO(simulation);
    }

    const finishedAt = new Date();
    const updated = await this.simulationRepository.update(validSimId, validUserId, {
      status: 'ABANDONED',
      finishedAt,
    });

    logger.info('simulation_abandoned', {
      simulationId: validSimId,
      userId: validUserId,
    });

    return this.toSimulationSummaryDTO(updated);
  }

  /**
   * Lista simulados do usuário com paginação e filtro opcional de status.
   */
  async listUserSimulations(
    actorUserId: string,
    filters?: SimulationFilterParams
  ): Promise<PaginatedSimulationsResult> {
    const validUserId = this.assertValidActorUserId(actorUserId);
    return this.simulationRepository.findManyByUser(validUserId, filters);
  }

  /**
   * Exclui um simulado e suas tentativas de forma segura e contextual.
   */
  async deleteSimulation(
    actorUserId: string,
    simulationId: string
  ): Promise<boolean> {
    const validUserId = this.assertValidActorUserId(actorUserId);
    const validSimId = this.assertValidId(simulationId, 'simulationId');

    const existing = await this.simulationRepository.findByIdAndUser(
      validSimId,
      validUserId
    );

    if (!existing) {
      throw new SimulationDomainError(
        'SIMULATION_NOT_FOUND',
        'Simulado não encontrado.',
        404
      );
    }

    await this.questionAttemptRepository.deleteBySimulation(validSimId);
    return this.simulationRepository.delete(validSimId, validUserId);
  }

  // ============================================================================
  // Mapeadores de DTO
  // ============================================================================

  private toSimulationSummaryDTO(simulation: Simulation): SimulationSummaryDTO {
    return {
      id: simulation.id,
      userId: simulation.userId,
      title: simulation.title,
      status: simulation.status,
      totalQuestions: simulation.totalQuestions,
      timeLimitSeconds: simulation.timeLimitSeconds,
      startedAt: simulation.startedAt,
      finishedAt: simulation.finishedAt,
      durationSeconds: simulation.durationSeconds,
      scorePercentage: simulation.scorePercentage,
      correctCount: simulation.correctCount,
      wrongCount: simulation.wrongCount,
      unansweredCount: simulation.unansweredCount,
      createdAt: simulation.createdAt,
    };
  }

  private toSimulationDetailDTO(
    simulation: SimulationWithFullDetails
  ): SimulationDetailDTO {
    const { isExpired, timeRemainingSeconds } = this.calculateTimer(simulation);
    const summary = this.toSimulationSummaryDTO(simulation);

    const attemptsMap = new Map<string, QuestionAttemptWithAlternative>();
    for (const att of simulation.attempts) {
      attemptsMap.set(att.questionId, att);
    }

    const isFinished =
      simulation.status === 'COMPLETED' ||
      simulation.status === 'EXPIRED' ||
      isExpired;

    const questions = simulation.questions.map((sq) => {
      const attempt = attemptsMap.get(sq.questionId);
      const currentAttempt = attempt
        ? {
            selectedAlternativeId: attempt.selectedAlternativeId,
            selectedLetter: attempt.selectedLetter,
            answeredAt: attempt.answeredAt,
            timeSpentSeconds: attempt.timeSpentSeconds,
          }
        : null;

      const basePublic: SimulationPublicQuestionDTO = {
        id: sq.id,
        simulationId: sq.simulationId,
        questionId: sq.questionId,
        position: sq.position,
        statement: sq.question.statement,
        type: sq.question.type,
        subject: sq.question.subject,
        topic: sq.question.topic,
        subtopic: sq.question.subtopic,
        board: sq.question.board,
        examTitle: sq.question.examTitle,
        year: sq.question.year,
        difficulty: sq.question.difficulty,
        alternatives: sq.question.alternatives.map((alt) => ({
          id: alt.id,
          letter: alt.letter,
          text: alt.text,
          position: alt.position,
        })),
        currentAttempt,
      };

      if (!isFinished) {
        return basePublic;
      }

      const review: SimulationReviewQuestionDTO = {
        ...basePublic,
        answerKeySnapshot: sq.answerKeySnapshot,
        isAnnulledSnapshot: sq.isAnnulledSnapshot,
        snapshotSource: sq.snapshotSource,
        officialAnswerKeyVersion: sq.officialAnswerKeyVersion,
        explanation: sq.question.explanation,
        isCorrect: sq.isAnnulledSnapshot ? true : (attempt?.isCorrect ?? null),
      };

      return review;
    });

    return {
      ...summary,
      timeRemainingSeconds,
      isExpired,
      questions,
    };
  }

  private toSimulationResultDTO(
    simulation: SimulationWithFullDetails
  ): SimulationResultDTO {
    const detail = this.toSimulationDetailDTO(simulation);
    return {
      ...detail,
      scorePercentage: simulation.scorePercentage ?? 0,
      correctCount: simulation.correctCount ?? 0,
      wrongCount: simulation.wrongCount ?? 0,
      unansweredCount: simulation.unansweredCount ?? 0,
      durationSeconds: simulation.durationSeconds ?? 0,
      questions: detail.questions as SimulationReviewQuestionDTO[],
    };
  }
}
