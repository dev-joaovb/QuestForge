import type {
  AuthSessionResponse,
  CreateOfficialAnswerKeyDraftPayload,
  CreateOfficialAnswerKeyItemPayload,
  CreateOrUpdateQuestionPayload,
  CreateSimulationPayload,
  HealthApiResponse,
  ListAnswerKeyItemsParams,
  ListAnswerKeyVersionsParams,
  ListPdfDocumentsParams,
  ListQuestionsParams,
  ListSimulationsParams,
  LoginRequestPayload,
  OfficialAnswerKeyDTO,
  OfficialAnswerKeyItemDTO,
  PaginatedPdfDocumentsResponse,
  PaginatedQuestionsResponse,
  PaginatedSimulationsResponse,
  PdfDocumentDTO,
  PublicQuestionAttemptDTO,
  PublishOfficialAnswerKeyPayload,
  QuestionOwnerDetailDTO,
  QuestionResponseDTO,
  RegisterRequestPayload,
  ReplaceOfficialAnswerKeyItemsPayload,
  SimulationDetailDTO,
  SimulationResultDTO,
  SimulationSummaryDTO,
  SubmitAnswerPayload,
  UpdateOfficialAnswerKeyDraftPayload,
  UpdateOfficialAnswerKeyItemPayload,
} from '../types/index.ts';

export const CSRF_HEADER_NAME = 'X-Requested-With';
export const CSRF_HEADER_VALUE = 'QuestForge-Client';

export class ApiHttpError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
    this.code = code;
  }
}

export interface HealthCheckClientResult {
  httpStatus: number;
  data: HealthApiResponse;
}

function isValidHealthResponse(payload: unknown): payload is HealthApiResponse {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as Record<string, unknown>;
  if (candidate.status !== 'healthy' && candidate.status !== 'degraded') return false;
  if (!candidate.app || typeof candidate.app !== 'object') return false;
  if (!candidate.dependencies || typeof candidate.dependencies !== 'object') return false;

  const deps = candidate.dependencies as Record<string, unknown>;
  if (!deps.database || typeof deps.database !== 'object') return false;
  if (!deps.environment || typeof deps.environment !== 'object') return false;

  return true;
}

function isValidAuthSessionResponse(payload: unknown): payload is AuthSessionResponse {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as Record<string, unknown>;
  if (!candidate.user || typeof candidate.user !== 'object') return false;
  if (!candidate.session || typeof candidate.session !== 'object') return false;

  const user = candidate.user as Record<string, unknown>;
  return typeof user.id === 'string' && typeof user.email === 'string' && typeof user.name === 'string';
}

async function parseJsonOrThrow(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new ApiHttpError(
      response.status,
      'INVALID_CONTENT_TYPE',
      `Resposta inválida do servidor (HTTP ${response.status}): Content-Type não é JSON.`
    );
  }

  try {
    return await response.json();
  } catch {
    throw new ApiHttpError(
      response.status,
      'INVALID_JSON',
      `Não foi possível decodificar a resposta JSON do servidor (HTTP ${response.status}).`
    );
  }
}

async function extractApiError(response: Response, fallbackMessage: string): Promise<ApiHttpError> {
  try {
    const body = (await parseJsonOrThrow(response)) as Record<string, unknown>;
    const code = typeof body.error === 'string' ? body.error : `HTTP_${response.status}`;
    const message = typeof body.message === 'string' ? body.message : fallbackMessage;
    return new ApiHttpError(response.status, code, message);
  } catch (err) {
    if (err instanceof ApiHttpError) {
      return new ApiHttpError(response.status, err.code, fallbackMessage);
    }
    return new ApiHttpError(response.status, `HTTP_${response.status}`, fallbackMessage);
  }
}

/**
 * Consulta o endpoint real GET /api/health do backend Express.
 * Não utiliza dados fictícios nem mascara falhas de rede, erros HTTP (500/502/404) ou JSON inválido.
 */
export async function fetchFoundationHealth(
  signal?: AbortSignal
): Promise<HealthCheckClientResult> {
  const response = await fetch('/api/health', {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      `Resposta inválida de /api/health (HTTP ${response.status}): Content-Type não é JSON.`
    );
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new Error(`Falha ao decodificar JSON de /api/health (HTTP ${response.status}).`);
  }

  if (!isValidHealthResponse(parsed)) {
    throw new Error(
      `Contrato inesperado recebido de /api/health (HTTP ${response.status}).`
    );
  }

  const normalizedData: HealthApiResponse = {
    ...parsed,
    status: response.status === 200 && parsed.status === 'healthy' ? 'healthy' : 'degraded',
  };

  return {
    httpStatus: response.status,
    data: normalizedData,
  };
}

/**
 * Consulta GET /api/auth/me usando o cookie HttpOnly gerenciado pelo navegador.
 * Retorna null quando o status é 401 (não autenticado) e lança erro em falhas de infraestrutura (500/503).
 */
export async function fetchCurrentSession(
  signal?: AbortSignal
): Promise<AuthSessionResponse | null> {
  const response = await fetch('/api/auth/me', {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw await extractApiError(
      response,
      'Não foi possível verificar a sessão atual no servidor.'
    );
  }

  const parsed = await parseJsonOrThrow(response);
  if (!isValidAuthSessionResponse(parsed)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_AUTH_PAYLOAD',
      'Formato inválido retornado por /api/auth/me.'
    );
  }

  return parsed;
}

/**
 * Envia POST /api/auth/register com cabeçalho CSRF X-Requested-With: QuestForge-Client.
 */
export async function registerUser(
  payload: RegisterRequestPayload
): Promise<AuthSessionResponse> {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await extractApiError(response, 'Não foi possível concluir o cadastro.');
  }

  const parsed = await parseJsonOrThrow(response);
  if (!isValidAuthSessionResponse(parsed)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_AUTH_PAYLOAD',
      'Resposta inesperada do servidor ao concluir cadastro.'
    );
  }

  return parsed;
}

/**
 * Envia POST /api/auth/login com cabeçalho CSRF X-Requested-With: QuestForge-Client.
 */
export async function loginUser(
  payload: LoginRequestPayload
): Promise<AuthSessionResponse> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await extractApiError(response, 'Não foi possível realizar o login.');
  }

  const parsed = await parseJsonOrThrow(response);
  if (!isValidAuthSessionResponse(parsed)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_AUTH_PAYLOAD',
      'Resposta inesperada do servidor ao autenticar.'
    );
  }

  return parsed;
}

/**
 * Envia POST /api/auth/logout com cabeçalho CSRF X-Requested-With: QuestForge-Client.
 */
export async function logoutUser(): Promise<void> {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
    },
  });

  if (!response.ok) {
    throw await extractApiError(response, 'Não foi possível encerrar a sessão no servidor.');
  }
}

function isValidQuestionDTO(payload: unknown): payload is QuestionResponseDTO {
  if (!payload || typeof payload !== 'object') return false;
  const q = payload as Record<string, unknown>;
  return (
    typeof q.id === 'string' &&
    typeof q.statement === 'string' &&
    typeof q.subject === 'string' &&
    typeof q.answerKeyRevealed === 'boolean' &&
    Array.isArray(q.alternatives)
  );
}

function isValidPaginatedQuestionsResponse(
  payload: unknown
): payload is PaginatedQuestionsResponse {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as Record<string, unknown>;
  if (!Array.isArray(candidate.items)) return false;
  if (typeof candidate.total !== 'number') return false;
  if (typeof candidate.currentPage !== 'number') return false;
  if (typeof candidate.totalPages !== 'number') return false;
  return candidate.items.every((item) => isValidQuestionDTO(item));
}

/**
 * Consulta GET /api/questions com filtros e paginação reais.
 */
export async function fetchQuestions(
  params: ListQuestionsParams = {},
  signal?: AbortSignal
): Promise<PaginatedQuestionsResponse> {
  const searchParams = new URLSearchParams();
  if (params.page !== undefined) searchParams.set('page', String(params.page));
  if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
  if (params.search && params.search.trim()) searchParams.set('search', params.search.trim());
  if (params.subject && params.subject.trim()) searchParams.set('subject', params.subject.trim());
  if (params.topic && params.topic.trim()) searchParams.set('topic', params.topic.trim());
  if (params.board && params.board.trim()) searchParams.set('board', params.board.trim());
  if (params.examTitle && params.examTitle.trim()) {
    searchParams.set('examTitle', params.examTitle.trim());
  }
  if (params.type) searchParams.set('type', params.type);
  if (params.difficulty) searchParams.set('difficulty', params.difficulty);
  if (params.includeAnswer !== undefined) {
    searchParams.set('includeAnswer', params.includeAnswer ? 'true' : 'false');
  }

  const queryString = searchParams.toString();
  const url = queryString ? `/api/questions?${queryString}` : '/api/questions';

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw await extractApiError(
      response,
      'Não foi possível carregar o banco de questões.'
    );
  }

  const parsed = await parseJsonOrThrow(response);
  if (!isValidPaginatedQuestionsResponse(parsed)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_QUESTIONS_PAYLOAD',
      'Formato inválido retornado por /api/questions.'
    );
  }

  return parsed;
}

/**
 * Consulta GET /api/questions/:id (com proteção de gabarito por padrão).
 */
export async function fetchQuestionById(
  id: string,
  options?: { includeAnswer?: boolean; signal?: AbortSignal }
): Promise<QuestionResponseDTO> {
  const encodedId = encodeURIComponent(id);
  const query = options?.includeAnswer ? '?includeAnswer=true' : '';
  const response = await fetch(`/api/questions/${encodedId}${query}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
    signal: options?.signal,
  });

  if (!response.ok) {
    throw await extractApiError(
      response,
      'Não foi possível carregar os detalhes da questão.'
    );
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  if (!parsed || !isValidQuestionDTO(parsed.question)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_QUESTION_DETAIL_PAYLOAD',
      'Formato inválido retornado ao consultar a questão.'
    );
  }

  return parsed.question;
}

/**
 * Envia POST /api/questions com cabeçalho CSRF X-Requested-With: QuestForge-Client.
 */
export async function createQuestion(
  payload: CreateOrUpdateQuestionPayload
): Promise<QuestionOwnerDetailDTO> {
  const response = await fetch('/api/questions', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await extractApiError(response, 'Não foi possível cadastrar a questão.');
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  if (!parsed || !isValidQuestionDTO(parsed.question)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_QUESTION_CREATE_PAYLOAD',
      'Resposta inesperada do servidor ao cadastrar questão.'
    );
  }

  return parsed.question as QuestionOwnerDetailDTO;
}

/**
 * Envia PUT /api/questions/:id com cabeçalho CSRF X-Requested-With: QuestForge-Client.
 */
export async function updateQuestion(
  id: string,
  payload: Partial<CreateOrUpdateQuestionPayload>
): Promise<QuestionOwnerDetailDTO> {
  const encodedId = encodeURIComponent(id);
  const response = await fetch(`/api/questions/${encodedId}`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await extractApiError(response, 'Não foi possível atualizar a questão.');
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  if (!parsed || !isValidQuestionDTO(parsed.question)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_QUESTION_UPDATE_PAYLOAD',
      'Resposta inesperada do servidor ao atualizar questão.'
    );
  }

  return parsed.question as QuestionOwnerDetailDTO;
}

/**
 * Envia DELETE /api/questions/:id com cabeçalho CSRF X-Requested-With: QuestForge-Client.
 */
export async function deleteQuestion(id: string): Promise<{ message: string }> {
  const encodedId = encodeURIComponent(id);
  const response = await fetch(`/api/questions/${encodedId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
    },
  });

  if (!response.ok) {
    throw await extractApiError(response, 'Não foi possível excluir a questão.');
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  return {
    message:
      typeof parsed?.message === 'string'
        ? parsed.message
        : 'Questão excluída com sucesso.',
  };
}

function isValidPdfDocumentDTO(payload: unknown): payload is PdfDocumentDTO {
  if (!payload || typeof payload !== 'object') return false;
  const doc = payload as Record<string, unknown>;
  return (
    typeof doc.id === 'string' &&
    typeof doc.userId === 'string' &&
    typeof doc.originalName === 'string' &&
    typeof doc.mimeType === 'string' &&
    typeof doc.sizeBytes === 'number' &&
    typeof doc.checksumSha256 === 'string' &&
    typeof doc.status === 'string' &&
    typeof doc.requiresOcr === 'boolean' &&
    typeof doc.createdAt === 'string'
  );
}

function isValidPaginatedPdfDocumentsResponse(
  payload: unknown
): payload is PaginatedPdfDocumentsResponse {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as Record<string, unknown>;
  if (!Array.isArray(candidate.items)) return false;
  if (typeof candidate.total !== 'number') return false;
  if (typeof candidate.currentPage !== 'number') return false;
  if (typeof candidate.totalPages !== 'number') return false;
  return candidate.items.every((item) => isValidPdfDocumentDTO(item));
}

/**
 * Consulta GET /api/documents com paginação e filtro opcional de status.
 */
export async function fetchPdfDocuments(
  params: ListPdfDocumentsParams = {},
  signal?: AbortSignal
): Promise<PaginatedPdfDocumentsResponse> {
  const searchParams = new URLSearchParams();
  if (params.page !== undefined) searchParams.set('page', String(params.page));
  if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
  if (params.status) searchParams.set('status', params.status);

  const queryString = searchParams.toString();
  const url = queryString ? `/api/documents?${queryString}` : '/api/documents';

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw await extractApiError(
      response,
      'Não foi possível carregar a lista de documentos PDF.'
    );
  }

  const parsed = await parseJsonOrThrow(response);
  if (!isValidPaginatedPdfDocumentsResponse(parsed)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_DOCUMENTS_PAYLOAD',
      'Formato inválido retornado por /api/documents.'
    );
  }

  return parsed;
}

/**
 * Consulta GET /api/documents/:id para inspecionar os metadados do documento PDF.
 */
export async function fetchPdfDocumentById(
  id: string,
  signal?: AbortSignal
): Promise<PdfDocumentDTO> {
  const encodedId = encodeURIComponent(id);
  const response = await fetch(`/api/documents/${encodedId}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw await extractApiError(
      response,
      'Não foi possível carregar os metadados do documento PDF.'
    );
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  if (!parsed || !isValidPdfDocumentDTO(parsed.document)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_DOCUMENT_DETAIL_PAYLOAD',
      'Formato inválido retornado ao consultar o documento PDF.'
    );
  }

  return parsed.document;
}

/**
 * Envia POST /api/documents usando multipart/form-data com cabeçalho CSRF X-Requested-With: QuestForge-Client.
 */
export async function uploadPdfDocument(
  file: File,
  options?: { examId?: string | null }
): Promise<PdfDocumentDTO> {
  const formData = new FormData();
  formData.append('file', file, file.name);
  if (options?.examId && options.examId.trim()) {
    formData.append('examId', options.examId.trim());
  }

  const response = await fetch('/api/documents', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
    },
    body: formData,
  });

  if (!response.ok) {
    throw await extractApiError(
      response,
      'Não foi possível enviar ou processar o documento PDF.'
    );
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  if (!parsed || !isValidPdfDocumentDTO(parsed.document)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_DOCUMENT_UPLOAD_PAYLOAD',
      'Resposta inesperada do servidor ao processar o documento PDF.'
    );
  }

  return parsed.document;
}

/**
 * Envia DELETE /api/documents/:id com cabeçalho CSRF X-Requested-With: QuestForge-Client.
 */
export async function deletePdfDocument(id: string): Promise<{ message: string }> {
  const encodedId = encodeURIComponent(id);
  const response = await fetch(`/api/documents/${encodedId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
    },
  });

  if (!response.ok) {
    throw await extractApiError(response, 'Não foi possível excluir o documento PDF.');
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  return {
    message:
      typeof parsed?.message === 'string'
        ? parsed.message
        : 'Documento PDF excluído com sucesso.',
  };
}

// ============================================================================
// Métodos de Gabaritos Oficiais (/api/official-answer-keys e /api/answer-keys)
// ============================================================================

function isValidOfficialAnswerKeyDTO(payload: unknown): payload is OfficialAnswerKeyDTO {
  if (!payload || typeof payload !== 'object') return false;
  const k = payload as Record<string, unknown>;
  return (
    typeof k.id === 'string' &&
    typeof k.userId === 'string' &&
    typeof k.examId === 'string' &&
    typeof k.type === 'string' &&
    typeof k.status === 'string' &&
    typeof k.version === 'number' &&
    typeof k.isCurrent === 'boolean'
  );
}

function isValidOfficialAnswerKeyItemDTO(payload: unknown): payload is OfficialAnswerKeyItemDTO {
  if (!payload || typeof payload !== 'object') return false;
  const item = payload as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.answerKeyId === 'string' &&
    typeof item.questionNumber === 'number' &&
    typeof item.status === 'string' &&
    typeof item.isAnnulled === 'boolean'
  );
}

/**
 * Cria um novo rascunho de gabarito oficial em estado DRAFT.
 * POST /api/official-answer-keys
 */
export async function createOfficialAnswerKeyDraft(
  payload: CreateOfficialAnswerKeyDraftPayload
): Promise<OfficialAnswerKeyDTO> {
  const response = await fetch('/api/official-answer-keys', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await extractApiError(
      response,
      'Não foi possível criar o rascunho de gabarito oficial.'
    );
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  if (!parsed || !isValidOfficialAnswerKeyDTO(parsed.answerKey)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_ANSWER_KEY_PAYLOAD',
      'Resposta inesperada do servidor ao criar rascunho de gabarito oficial.'
    );
  }

  return parsed.answerKey;
}

/**
 * Consulta um gabarito oficial por ID.
 * GET /api/official-answer-keys/:id
 */
export async function fetchOfficialAnswerKeyById(
  id: string,
  options?: { includeItems?: boolean; signal?: AbortSignal }
): Promise<OfficialAnswerKeyDTO> {
  const encodedId = encodeURIComponent(id.trim());
  const query = options?.includeItems ? '?includeItems=true' : '';
  const response = await fetch(`/api/official-answer-keys/${encodedId}${query}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
    signal: options?.signal,
  });

  if (!response.ok) {
    throw await extractApiError(
      response,
      'Não foi possível carregar o gabarito oficial.'
    );
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  if (!parsed || !isValidOfficialAnswerKeyDTO(parsed.answerKey)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_ANSWER_KEY_PAYLOAD',
      'Formato inválido retornado ao consultar o gabarito oficial.'
    );
  }

  return parsed.answerKey;
}

/**
 * Consulta o gabarito oficial vigente de uma prova específica.
 * GET /api/official-answer-keys/exams/:examId/current
 */
export async function fetchCurrentOfficialAnswerKeyByExamId(
  examId: string,
  options?: { includeItems?: boolean; signal?: AbortSignal }
): Promise<OfficialAnswerKeyDTO | null> {
  const encodedExamId = encodeURIComponent(examId.trim());
  const query = options?.includeItems ? '?includeItems=true' : '';
  const response = await fetch(
    `/api/official-answer-keys/exams/${encodedExamId}/current${query}`,
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
      signal: options?.signal,
    }
  );

  if (!response.ok) {
    throw await extractApiError(
      response,
      'Não foi possível carregar o gabarito vigente da prova.'
    );
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  if (parsed.answerKey === null) {
    return null;
  }

  if (!isValidOfficialAnswerKeyDTO(parsed.answerKey)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_ANSWER_KEY_PAYLOAD',
      'Formato inválido retornado ao consultar o gabarito vigente da prova.'
    );
  }

  return parsed.answerKey;
}

/**
 * Consulta o histórico de versões de gabaritos oficiais de uma prova.
 * GET /api/official-answer-keys/exams/:examId/versions
 */
export async function fetchOfficialAnswerKeyVersions(
  examId: string,
  params?: ListAnswerKeyVersionsParams,
  signal?: AbortSignal
): Promise<OfficialAnswerKeyDTO[]> {
  const encodedExamId = encodeURIComponent(examId.trim());
  const searchParams = new URLSearchParams();
  if (params?.type) searchParams.set('type', params.type);

  const queryString = searchParams.toString();
  const url = queryString
    ? `/api/official-answer-keys/exams/${encodedExamId}/versions?${queryString}`
    : `/api/official-answer-keys/exams/${encodedExamId}/versions`;

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw await extractApiError(
      response,
      'Não foi possível carregar o histórico de versões do gabarito oficial.'
    );
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  if (!parsed || !Array.isArray(parsed.versions)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_ANSWER_KEY_VERSIONS_PAYLOAD',
      'Formato inválido retornado pelo histórico de versões.'
    );
  }

  return parsed.versions as OfficialAnswerKeyDTO[];
}

/**
 * Consulta os itens de um gabarito oficial com filtros opcionais.
 * GET /api/official-answer-keys/:id/items
 */
export async function fetchOfficialAnswerKeyItems(
  id: string,
  params?: ListAnswerKeyItemsParams,
  signal?: AbortSignal
): Promise<OfficialAnswerKeyItemDTO[]> {
  const encodedId = encodeURIComponent(id.trim());
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);

  const queryString = searchParams.toString();
  const url = queryString
    ? `/api/official-answer-keys/${encodedId}/items?${queryString}`
    : `/api/official-answer-keys/${encodedId}/items`;

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw await extractApiError(
      response,
      'Não foi possível carregar os itens do gabarito oficial.'
    );
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  if (!parsed || !Array.isArray(parsed.items)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_ANSWER_KEY_ITEMS_PAYLOAD',
      'Formato inválido retornado ao listar itens do gabarito oficial.'
    );
  }

  return parsed.items as OfficialAnswerKeyItemDTO[];
}

/**
 * Consulta um item específico por número de questão.
 * GET /api/official-answer-keys/:id/items/:questionNumber
 */
export async function fetchOfficialAnswerKeyItemByQuestion(
  id: string,
  questionNumber: number,
  signal?: AbortSignal
): Promise<OfficialAnswerKeyItemDTO> {
  const encodedId = encodeURIComponent(id.trim());
  const response = await fetch(
    `/api/official-answer-keys/${encodedId}/items/${questionNumber}`,
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
      signal,
    }
  );

  if (!response.ok) {
    throw await extractApiError(
      response,
      `Não foi possível carregar o item da questão ${questionNumber}.`
    );
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  if (!parsed || !isValidOfficialAnswerKeyItemDTO(parsed.item)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_ANSWER_KEY_ITEM_PAYLOAD',
      'Formato inválido retornado ao consultar o item do gabarito oficial.'
    );
  }

  return parsed.item;
}

/**
 * Atualiza metadados e/ou itens de um rascunho de gabarito oficial.
 * PATCH /api/official-answer-keys/:id
 */
export async function updateOfficialAnswerKeyDraft(
  id: string,
  payload: UpdateOfficialAnswerKeyDraftPayload
): Promise<OfficialAnswerKeyDTO> {
  const encodedId = encodeURIComponent(id.trim());
  const response = await fetch(`/api/official-answer-keys/${encodedId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await extractApiError(
      response,
      'Não foi possível atualizar o rascunho de gabarito oficial.'
    );
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  if (!parsed || !isValidOfficialAnswerKeyDTO(parsed.answerKey)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_ANSWER_KEY_PAYLOAD',
      'Resposta inesperada do servidor ao atualizar rascunho de gabarito oficial.'
    );
  }

  return parsed.answerKey;
}

/**
 * Adiciona um novo item individual a um rascunho de gabarito oficial.
 * POST /api/official-answer-keys/:id/items
 */
export async function addOfficialAnswerKeyItem(
  id: string,
  payload: CreateOfficialAnswerKeyItemPayload
): Promise<OfficialAnswerKeyItemDTO> {
  const encodedId = encodeURIComponent(id.trim());
  const response = await fetch(`/api/official-answer-keys/${encodedId}/items`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await extractApiError(
      response,
      'Não foi possível adicionar o item ao rascunho de gabarito oficial.'
    );
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  if (!parsed || !isValidOfficialAnswerKeyItemDTO(parsed.item)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_ANSWER_KEY_ITEM_PAYLOAD',
      'Resposta inesperada do servidor ao adicionar item ao gabarito oficial.'
    );
  }

  return parsed.item;
}

/**
 * Atualiza um item individual pertencente a um rascunho de gabarito oficial.
 * PATCH /api/official-answer-keys/:id/items/:questionNumber
 */
export async function updateOfficialAnswerKeyItem(
  id: string,
  questionNumber: number,
  payload: UpdateOfficialAnswerKeyItemPayload
): Promise<OfficialAnswerKeyItemDTO> {
  const encodedId = encodeURIComponent(id.trim());
  const response = await fetch(
    `/api/official-answer-keys/${encodedId}/items/${questionNumber}`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    throw await extractApiError(
      response,
      `Não foi possível atualizar o item da questão ${questionNumber}.`
    );
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  if (!parsed || !isValidOfficialAnswerKeyItemDTO(parsed.item)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_ANSWER_KEY_ITEM_PAYLOAD',
      'Resposta inesperada do servidor ao atualizar item do gabarito oficial.'
    );
  }

  return parsed.item;
}

/**
 * Substitui atomicamente todos os itens de um rascunho de gabarito oficial.
 * PUT /api/official-answer-keys/:id/items
 */
export async function replaceOfficialAnswerKeyItems(
  id: string,
  payload: ReplaceOfficialAnswerKeyItemsPayload
): Promise<OfficialAnswerKeyItemDTO[]> {
  const encodedId = encodeURIComponent(id.trim());
  const response = await fetch(`/api/official-answer-keys/${encodedId}/items`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await extractApiError(
      response,
      'Não foi possível substituir os itens do gabarito oficial.'
    );
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  if (!parsed || !Array.isArray(parsed.items)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_ANSWER_KEY_ITEMS_PAYLOAD',
      'Resposta inesperada do servidor ao substituir itens do gabarito oficial.'
    );
  }

  return parsed.items as OfficialAnswerKeyItemDTO[];
}

/**
 * Exclui atomicamente um rascunho de gabarito oficial.
 * DELETE /api/official-answer-keys/:id
 */
export async function deleteOfficialAnswerKeyDraft(
  id: string
): Promise<{ message: string }> {
  const encodedId = encodeURIComponent(id.trim());
  const response = await fetch(`/api/official-answer-keys/${encodedId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
    },
  });

  if (!response.ok) {
    throw await extractApiError(
      response,
      'Não foi possível excluir o rascunho de gabarito oficial.'
    );
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  return {
    message:
      typeof parsed?.message === 'string'
        ? parsed.message
        : 'Rascunho de gabarito oficial excluído com sucesso.',
  };
}

/**
 * Publica atomicamente um gabarito oficial tornando-o vigente.
 * POST /api/official-answer-keys/:id/publish
 */
export async function publishOfficialAnswerKey(
  id: string,
  payload: PublishOfficialAnswerKeyPayload = {}
): Promise<OfficialAnswerKeyDTO> {
  const encodedId = encodeURIComponent(id.trim());
  const response = await fetch(`/api/official-answer-keys/${encodedId}/publish`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await extractApiError(
      response,
      'Não foi possível publicar o gabarito oficial.'
    );
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  if (!parsed || !isValidOfficialAnswerKeyDTO(parsed.answerKey)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_ANSWER_KEY_PAYLOAD',
      'Resposta inesperada do servidor ao publicar gabarito oficial.'
    );
  }

  return parsed.answerKey;
}

// ============================================================================
// Funções do Cliente HTTP para Motor de Simulados (Sprint 6.6)
// ============================================================================

function isValidSimulationSummaryDTO(payload: unknown): payload is SimulationSummaryDTO {
  if (!payload || typeof payload !== 'object') return false;
  const sim = payload as Record<string, unknown>;
  return (
    typeof sim.id === 'string' &&
    typeof sim.userId === 'string' &&
    typeof sim.status === 'string' &&
    typeof sim.totalQuestions === 'number' &&
    typeof sim.createdAt === 'string'
  );
}

function isValidSimulationDetailDTO(payload: unknown): payload is SimulationDetailDTO {
  if (!isValidSimulationSummaryDTO(payload)) return false;
  const sim = payload as unknown as Record<string, unknown>;
  return typeof sim.isExpired === 'boolean' && Array.isArray(sim.questions);
}

function isValidSimulationResultDTO(payload: unknown): payload is SimulationResultDTO {
  if (!isValidSimulationDetailDTO(payload)) return false;
  const sim = payload as unknown as Record<string, unknown>;
  return (
    typeof sim.scorePercentage === 'number' &&
    typeof sim.correctCount === 'number' &&
    typeof sim.wrongCount === 'number' &&
    typeof sim.unansweredCount === 'number' &&
    typeof sim.durationSeconds === 'number'
  );
}

function isValidPublicQuestionAttemptDTO(payload: unknown): payload is PublicQuestionAttemptDTO {
  if (!payload || typeof payload !== 'object') return false;
  const att = payload as Record<string, unknown>;
  return (
    typeof att.id === 'string' &&
    typeof att.simulationId === 'string' &&
    typeof att.questionId === 'string' &&
    typeof att.userId === 'string'
  );
}

/**
 * Cria um novo simulado personalizado via POST /api/simulations.
 */
export async function createSimulation(
  payload: CreateSimulationPayload
): Promise<SimulationDetailDTO> {
  const response = await fetch('/api/simulations', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await extractApiError(
      response,
      'Não foi possível criar o simulado.'
    );
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  if (!parsed || !isValidSimulationDetailDTO(parsed.simulation)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_SIMULATION_CREATE_PAYLOAD',
      'Resposta inesperada do servidor ao criar simulado.'
    );
  }

  return parsed.simulation;
}

/**
 * Lista os simulados do usuário autenticado com paginação via GET /api/simulations.
 */
export async function listSimulations(
  params: ListSimulationsParams = {}
): Promise<PaginatedSimulationsResponse> {
  const query = new URLSearchParams();
  if (params.status) {
    query.set('status', params.status);
  }
  if (params.limit !== undefined) {
    query.set('limit', String(params.limit));
  }
  if (params.offset !== undefined) {
    query.set('offset', String(params.offset));
  }
  if (params.page !== undefined) {
    query.set('page', String(params.page));
  }

  const queryString = query.toString();
  const url = queryString ? `/api/simulations?${queryString}` : '/api/simulations';

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw await extractApiError(
      response,
      'Não foi possível listar os simulados.'
    );
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  if (
    !parsed ||
    !Array.isArray(parsed.simulations) ||
    typeof parsed.total !== 'number'
  ) {
    throw new ApiHttpError(
      response.status,
      'INVALID_SIMULATIONS_LIST_PAYLOAD',
      'Resposta inesperada do servidor ao listar simulados.'
    );
  }

  return {
    simulations: parsed.simulations as SimulationSummaryDTO[],
    total: parsed.total,
    limit: typeof parsed.limit === 'number' ? parsed.limit : (params.limit ?? 20),
    offset: typeof parsed.offset === 'number' ? parsed.offset : (params.offset ?? 0),
  };
}

/**
 * Consulta os detalhes de um simulado específico via GET /api/simulations/:id.
 */
export async function getSimulation(id: string): Promise<SimulationDetailDTO> {
  const encodedId = encodeURIComponent(id.trim());
  const response = await fetch(`/api/simulations/${encodedId}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw await extractApiError(
      response,
      'Não foi possível carregar os dados do simulado.'
    );
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  if (!parsed || !isValidSimulationDetailDTO(parsed.simulation)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_SIMULATION_DETAIL_PAYLOAD',
      'Resposta inesperada do servidor ao consultar simulado.'
    );
  }

  return parsed.simulation;
}

/**
 * Inicia a contagem oficial de tempo do simulado no servidor via POST /api/simulations/:id/start.
 */
export async function startSimulation(id: string): Promise<SimulationDetailDTO> {
  const encodedId = encodeURIComponent(id.trim());
  const response = await fetch(`/api/simulations/${encodedId}/start`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
    },
  });

  if (!response.ok) {
    throw await extractApiError(
      response,
      'Não foi possível iniciar o simulado.'
    );
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  if (!parsed || !isValidSimulationDetailDTO(parsed.simulation)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_SIMULATION_START_PAYLOAD',
      'Resposta inesperada do servidor ao iniciar simulado.'
    );
  }

  return parsed.simulation;
}

/**
 * Registra ou atualiza a resposta do usuário a uma questão do simulado via POST /api/simulations/:id/answers.
 * Suporta resposta em branco preservando selectedAlternativeId como null.
 */
export async function submitSimulationAnswer(
  simulationId: string,
  questionId: string,
  selectedAlternativeId: string | null,
  timeSpentSeconds?: number | null
): Promise<PublicQuestionAttemptDTO> {
  const encodedId = encodeURIComponent(simulationId.trim());
  const payload: Record<string, unknown> = {
    questionId: questionId.trim(),
    selectedAlternativeId: selectedAlternativeId,
  };

  if (timeSpentSeconds !== undefined) {
    payload.timeSpentSeconds = timeSpentSeconds;
  }

  const response = await fetch(`/api/simulations/${encodedId}/answers`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await extractApiError(
      response,
      'Não foi possível registrar a resposta no simulado.'
    );
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  if (!parsed || !isValidPublicQuestionAttemptDTO(parsed.attempt)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_SIMULATION_ANSWER_PAYLOAD',
      'Resposta inesperada do servidor ao registrar resposta.'
    );
  }

  return parsed.attempt;
}

/**
 * Finaliza o simulado e calcula nota e contadores oficiais no servidor via POST /api/simulations/:id/finish.
 */
export async function finishSimulation(id: string): Promise<SimulationResultDTO> {
  const encodedId = encodeURIComponent(id.trim());
  const response = await fetch(`/api/simulations/${encodedId}/finish`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
    },
  });

  if (!response.ok) {
    throw await extractApiError(
      response,
      'Não foi possível finalizar o simulado.'
    );
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  if (!parsed || !isValidSimulationResultDTO(parsed.result)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_SIMULATION_RESULT_PAYLOAD',
      'Resposta inesperada do servidor ao finalizar simulado.'
    );
  }

  return parsed.result;
}

/**
 * Abandona o simulado em andamento via POST /api/simulations/:id/abandon.
 */
export async function abandonSimulation(id: string): Promise<SimulationSummaryDTO> {
  const encodedId = encodeURIComponent(id.trim());
  const response = await fetch(`/api/simulations/${encodedId}/abandon`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
    },
  });

  if (!response.ok) {
    throw await extractApiError(
      response,
      'Não foi possível abandonar o simulado.'
    );
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  if (!parsed || !isValidSimulationSummaryDTO(parsed.simulation)) {
    throw new ApiHttpError(
      response.status,
      'INVALID_SIMULATION_ABANDON_PAYLOAD',
      'Resposta inesperada do servidor ao abandonar simulado.'
    );
  }

  return parsed.simulation;
}

/**
 * Exclui atomicamente um simulado via DELETE /api/simulations/:id.
 */
export async function deleteSimulation(id: string): Promise<{ message: string }> {
  const encodedId = encodeURIComponent(id.trim());
  const response = await fetch(`/api/simulations/${encodedId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
    },
  });

  if (!response.ok) {
    throw await extractApiError(
      response,
      'Não foi possível excluir o simulado.'
    );
  }

  const parsed = (await parseJsonOrThrow(response)) as Record<string, unknown>;
  return {
    message:
      typeof parsed?.message === 'string'
        ? parsed.message
        : 'Simulado excluído com sucesso.',
  };
}

