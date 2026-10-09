/**
 * Utilitário de observabilidade e logs estruturados do QuestForge.
 * Garante higienização contra exposição acidental de senhas, tokens, cookies ou secrets.
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'secret',
  'session_secret',
  'token',
  'tokenhash',
  'cookie',
  'authorization',
  'database_url',
  'minio_secret_key',
  'minio_access_key',
  'apikey',
  'gemini_api_key',
]);

export function sanitizeLogMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeLogMeta(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export const logger = {
  info(event: string, meta?: Record<string, unknown>) {
    const payload = {
      level: 'info',
      timestamp: new Date().toISOString(),
      event,
      ...(meta ? { meta: sanitizeLogMeta(meta) } : {}),
    };
    console.info(JSON.stringify(payload));
  },
  warn(event: string, meta?: Record<string, unknown>) {
    const payload = {
      level: 'warn',
      timestamp: new Date().toISOString(),
      event,
      ...(meta ? { meta: sanitizeLogMeta(meta) } : {}),
    };
    console.warn(JSON.stringify(payload));
  },
  error(event: string, meta?: Record<string, unknown>) {
    const payload = {
      level: 'error',
      timestamp: new Date().toISOString(),
      event,
      ...(meta ? { meta: sanitizeLogMeta(meta) } : {}),
    };
    console.error(JSON.stringify(payload));
  },
};
