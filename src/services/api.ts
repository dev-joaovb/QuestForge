import type {
  AuthSessionResponse,
  HealthApiResponse,
  LoginRequestPayload,
  RegisterRequestPayload,
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

