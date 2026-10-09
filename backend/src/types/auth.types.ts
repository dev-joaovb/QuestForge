/**
 * Tipos de domínio e DTOs públicos do módulo de Autenticação (Sprint 1).
 * Nenhuma interface pública contém `passwordHash` ou `tokenHash`.
 */

export interface PublicUserDTO {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionInfoDTO {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  lastUsedAt: Date;
}

export interface AuthenticatedSessionResult {
  user: PublicUserDTO;
  session: SessionInfoDTO;
  rawSessionToken: string;
}

export interface ValidatedSessionResult {
  user: PublicUserDTO;
  session: SessionInfoDTO;
}

export type AuthErrorCode =
  | 'EMAIL_ALREADY_IN_USE'
  | 'INVALID_CREDENTIALS'
  | 'SESSION_INVALID_OR_EXPIRED'
  | 'VALIDATION_ERROR'
  | 'CONFIGURATION_ERROR';

export class AuthDomainError extends Error {
  public readonly code: AuthErrorCode;
  public readonly statusCode: number;

  constructor(code: AuthErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = 'AuthDomainError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
