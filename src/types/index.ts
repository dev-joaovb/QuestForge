export interface HealthApiResponse {
  status: 'healthy' | 'degraded';
  timestamp: string;
  app: {
    name: string;
    status: 'up' | 'down';
    environment: string;
  };
  dependencies: {
    database: {
      provider: 'postgresql';
      status: 'up' | 'down' | 'unconfigured';
      latencyMs: number | null;
      message: string;
    };
    environment: {
      status: 'configured' | 'incomplete';
      missingOrInvalidCount: number;
      issues: string[];
    };
  };
}

export type HealthFetchState =
  | { state: 'loading' }
  | { state: 'loaded'; data: HealthApiResponse; httpStatus: number }
  | { state: 'error'; message: string };

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSessionInfo {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
  lastUsedAt: string;
}

export interface AuthSessionResponse {
  user: AuthUser;
  session: AuthSessionInfo;
}

export interface RegisterRequestPayload {
  name: string;
  email: string;
  password: string;
}

export interface LoginRequestPayload {
  email: string;
  password: string;
}

