import { describe, it, expect } from 'vitest';
import { validateEnv, loadStrictEnv } from '../src/config/env.ts';
import { sanitizeLogMeta } from '../src/utils/logger.ts';

describe('Environment Validation (backend/src/config/env.ts)', () => {
  it('deve validar com sucesso quando todas as variáveis obrigatórias estão presentes e válidas', () => {
    const validRawEnv: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      PORT: '3333',
      FRONTEND_URL: 'http://localhost:5173',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/questforge',
      SESSION_SECRET: 'chave_secreta_de_teste_com_mais_de_32_caracteres_12345',
      OLLAMA_BASE_URL: 'http://localhost:11434',
      MINIO_ENDPOINT: 'localhost',
      MINIO_PORT: '9000',
      MINIO_BUCKET: 'questforge-documents',
      MINIO_USE_SSL: 'false',
    };

    const result = validateEnv(validRawEnv);
    expect(result.isValid).toBe(true);
    expect(result.missingOrInvalidVars).toHaveLength(0);
    expect(result.config.PORT).toBe(3333);
    expect(result.config.MINIO_USE_SSL).toBe(false);
  });

  it('deve reportar claramente variáveis obrigatórias ausentes sem expor valores sensíveis', () => {
    const emptyEnv: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
    };

    const result = validateEnv(emptyEnv);
    expect(result.isValid).toBe(false);
    expect(result.missingOrInvalidVars.some((msg) => msg.includes('DATABASE_URL'))).toBe(true);
    expect(result.missingOrInvalidVars.some((msg) => msg.includes('SESSION_SECRET'))).toBe(true);
  });

  it('deve rejeitar SESSION_SECRET curta (< 32 caracteres) em loadStrictEnv', () => {
    const weakSecretEnv: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/questforge',
      SESSION_SECRET: 'curta',
    };

    expect(() => loadStrictEnv(weakSecretEnv)).toThrow(/SESSION_SECRET/);
  });

  it('deve higienizar chaves sensíveis no logger para impedir vazamento de credenciais', () => {
    const rawMeta = {
      userId: 'user-123',
      password: 'plain_password',
      passwordHash: '$2b$10$hash',
      DATABASE_URL: 'postgresql://secret@localhost:5432/db',
      SESSION_SECRET: 'my-secret-value',
      nested: {
        token: 'jwt-or-session-token',
        safeField: 'ok',
      },
    };

    const sanitized = sanitizeLogMeta(rawMeta);
    expect(sanitized?.userId).toBe('user-123');
    expect(sanitized?.password).toBe('[REDACTED]');
    expect(sanitized?.passwordHash).toBe('[REDACTED]');
    expect(sanitized?.DATABASE_URL).toBe('[REDACTED]');
    expect(sanitized?.SESSION_SECRET).toBe('[REDACTED]');
    expect((sanitized?.nested as Record<string, unknown>).token).toBe('[REDACTED]');
    expect((sanitized?.nested as Record<string, unknown>).safeField).toBe('ok');
  });
});
