import crypto from 'node:crypto';

/**
 * Parâmetros explícitos e versionados do algoritmo scrypt (OWASP / NIST):
 * - N (cost): 16384 (2^14)
 * - r (blockSize): 8
 * - p (parallelization): 1
 * - keylen: 64 bytes (512 bits)
 * - maxmem: 32 MB
 */
const SCRYPT_VERSION = 'scrypt-v1';
const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  keylen: 64,
  saltBytes: 16,
  maxmem: 32 * 1024 * 1024,
} as const;

const MAX_PASSWORD_BYTES = 256;
const SESSION_TOKEN_BYTES = 32; // 256 bits de entropia

function runScrypt(
  passwordBuffer: Buffer,
  saltBuffer: Buffer,
  keylen: number,
  options: crypto.ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(passwordBuffer, saltBuffer, keylen, options, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey);
    });
  });
}

/**
 * Gera um hash seguro e versionado para a senha informada usando `node:crypto` scrypt.
 * Formato persistido: `scrypt-v1$N=16384,r=8,p=1$<salt_hex>$<hash_hex>`
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  if (!plainPassword || typeof plainPassword !== 'string') {
    throw new Error('Senha inválida para geração de hash.');
  }

  const passwordBuffer = Buffer.from(plainPassword.normalize('NFKC'), 'utf-8');
  if (passwordBuffer.byteLength === 0 || passwordBuffer.byteLength > MAX_PASSWORD_BYTES) {
    throw new Error(`A senha deve ter entre 1 e ${MAX_PASSWORD_BYTES} bytes.`);
  }

  const salt = crypto.randomBytes(SCRYPT_PARAMS.saltBytes);
  const derivedKey = await runScrypt(passwordBuffer, salt, SCRYPT_PARAMS.keylen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    maxmem: SCRYPT_PARAMS.maxmem,
  });

  const paramString = `N=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}`;
  return `${SCRYPT_VERSION}$${paramString}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

/**
 * Verifica uma senha em texto puro contra um hash versionado usando comparação em tempo constante
 * (`crypto.timingSafeEqual`) para mitigar timing attacks.
 */
export async function verifyPassword(plainPassword: string, storedHash: string): Promise<boolean> {
  if (!plainPassword || !storedHash || typeof plainPassword !== 'string' || typeof storedHash !== 'string') {
    return false;
  }

  const passwordBuffer = Buffer.from(plainPassword.normalize('NFKC'), 'utf-8');
  if (passwordBuffer.byteLength === 0 || passwordBuffer.byteLength > MAX_PASSWORD_BYTES) {
    return false;
  }

  const parts = storedHash.split('$');
  if (parts.length !== 4) {
    return false;
  }

  const [version, paramString, saltHex, hashHex] = parts;
  if (version !== SCRYPT_VERSION || !saltHex || !hashHex) {
    return false;
  }

  // Valida que saltHex (32 chars = 16 bytes) e hashHex (128 chars = 64 bytes) são hexadecimais estritos
  if (!/^[0-9a-f]{32}$/i.test(saltHex) || !/^[0-9a-f]{128}$/i.test(hashHex)) {
    return false;
  }

  const parsedParams = new Map<string, number>();
  for (const pair of paramString.split(',')) {
    const [k, v] = pair.split('=');
    const num = Number(v);
    if (!k || !Number.isInteger(num) || num <= 0) {
      return false;
    }
    parsedParams.set(k, num);
  }

  const N = parsedParams.get('N');
  const r = parsedParams.get('r');
  const p = parsedParams.get('p');

  // Aceita exclusivamente os parâmetros aprovados da versão scrypt-v1
  if (N !== SCRYPT_PARAMS.N || r !== SCRYPT_PARAMS.r || p !== SCRYPT_PARAMS.p) {
    return false;
  }

  try {
    const saltBuffer = Buffer.from(saltHex, 'hex');
    const expectedHashBuffer = Buffer.from(hashHex, 'hex');

    if (
      saltBuffer.byteLength !== SCRYPT_PARAMS.saltBytes ||
      expectedHashBuffer.byteLength !== SCRYPT_PARAMS.keylen
    ) {
      return false;
    }

    const derivedKey = await runScrypt(passwordBuffer, saltBuffer, expectedHashBuffer.byteLength, {
      N,
      r,
      p,
      maxmem: SCRYPT_PARAMS.maxmem,
    });

    if (derivedKey.byteLength !== expectedHashBuffer.byteLength) {
      return false;
    }

    return crypto.timingSafeEqual(derivedKey, expectedHashBuffer);
  } catch {
    return false;
  }
}

/**
 * Gera um token de sessão opaco de alta entropia (256 bits) codificado em base64url.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

/**
 * Calcula o hash HMAC-SHA256 de um token de sessão usando `SESSION_SECRET`.
 * Apenas este hash (`tokenHash`) é armazenado no PostgreSQL.
 */
export function hashSessionToken(rawToken: string, sessionSecret?: string): string {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.trim() === '') {
    throw new Error('Token de sessão inválido.');
  }

  const secret = sessionSecret ?? process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET ausente ou inválida (mínimo de 32 caracteres obrigatório para assinar hashes de sessão).'
    );
  }

  return crypto.createHmac('sha256', secret).update(rawToken, 'utf-8').digest('hex');
}
