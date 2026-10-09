import type { CookieOptions, Response } from 'express';

export const SESSION_COOKIE_NAME = 'qf_session';

/**
 * Gera os atributos seguros para o cookie de sessão.
 * - HttpOnly: impede leitura via document.cookie no JavaScript
 * - SameSite=Lax: proteção base contra envio cross-site em submissões de terceiros
 * - Path=/: escopo global para a API e aplicação
 * - Secure: habilitado obrigatoriamente em produção (HTTPS)
 * - Domain: omitido intencionalmente (host-only cookie, mais restrito e seguro)
 */
export function getBaseSessionCookieOptions(
  nodeEnv: string = process.env.NODE_ENV ?? 'development'
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: nodeEnv === 'production',
  };
}

/**
 * Define o cookie de sessão HttpOnly na resposta HTTP com expiração sincronizada ao banco.
 */
export function setSessionCookie(
  res: Response,
  rawToken: string,
  expiresAt: Date,
  nodeEnv: string = process.env.NODE_ENV ?? 'development'
): void {
  const baseOptions = getBaseSessionCookieOptions(nodeEnv);
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    ...baseOptions,
    expires: expiresAt,
  });
}

/**
 * Limpa o cookie de sessão utilizando exatamente os mesmos atributos base (HttpOnly, SameSite, Path, Secure)
 * usados na emissão para garantir remoção efetiva pelo navegador.
 */
export function clearSessionCookie(
  res: Response,
  nodeEnv: string = process.env.NODE_ENV ?? 'development'
): void {
  const baseOptions = getBaseSessionCookieOptions(nodeEnv);
  res.clearCookie(SESSION_COOKIE_NAME, baseOptions);
}
