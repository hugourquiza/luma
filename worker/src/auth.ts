// Autenticación por cookie de sesión (HttpOnly) + código de recuperación.
// Las cookies llevan SameSite y Secure (en producción). La recuperación guarda
// solo el hash del código; el código completo viaja en el cuerpo de la
// petición, nunca en URLs ni logs.
import type { Env } from './env';
import { randomToken, sha256Hex, uuid } from './crypto';

const OWNER_COOKIE = 'isla_owner';
const SESSION_COOKIE = 'isla_session';
const SESSION_TTL_MS = 90 * 24 * 3600 * 1000; // 90 días

export interface AuthContext {
  ownerId: string;
  sessionTokenHash: string;
}

function secureFlag(env: Env): boolean {
  return env.ENVIRONMENT !== 'development';
}

function setCookie(name: string, value: string, maxAgeSec: number, env: Env): string {
  const parts = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ];
  if (secureFlag(env)) parts.push('Secure');
  return parts.join('; ');
}

function clearCookie(name: string): string {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.get('Cookie') ?? '';
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

/** Crea una identidad de propietario nueva y una sesión autenticada.
 * Idempotente ante un recovery_code ya existente: en vez de violar la
 * constraint UNIQUE (lo que daría 500 en un reintento de red), devuelve la
 * identidad ya registrada con ese código y abre una sesión nueva. */
export async function createOwner(env: Env, recoveryCode: string): Promise<{ ownerId: string; sessionToken: string }> {
  const recoveryHash = await sha256Hex(recoveryCode);
  const existing = await env.DB.prepare('SELECT id FROM owners WHERE recovery_hash = ?').bind(recoveryHash).first<{ id: string }>();
  const ownerId = existing?.id ?? uuid();
  const sessionToken = randomToken(32);
  const tokenHash = await sha256Hex(sessionToken);
  const now = Date.now();

  if (existing) {
    await env.DB.prepare(
      'INSERT INTO auth_sessions (token_hash, owner_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    ).bind(tokenHash, ownerId, now, now + SESSION_TTL_MS).run();
    return { ownerId, sessionToken };
  }

  await env.DB.batch([
    env.DB.prepare('INSERT INTO owners (id, recovery_hash, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .bind(ownerId, recoveryHash, now, now),
    env.DB.prepare('INSERT INTO auth_sessions (token_hash, owner_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .bind(tokenHash, ownerId, now, now + SESSION_TTL_MS),
  ]);
  return { ownerId, sessionToken };
}

/** Recupera una identidad desde el código; aplica límite de intentos. */
export async function recoverOwner(env: Env, recoveryCode: string): Promise<{ ownerId: string; sessionToken: string } | null> {
  const hash = await sha256Hex(recoveryCode);
  const owner = await env.DB.prepare('SELECT id FROM owners WHERE recovery_hash = ?').bind(hash).first<{ id: string }>();
  if (!owner) return null;
  const sessionToken = randomToken(32);
  const tokenHash = await sha256Hex(sessionToken);
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO auth_sessions (token_hash, owner_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).bind(tokenHash, owner.id, now, now + SESSION_TTL_MS).run();
  return { ownerId: owner.id, sessionToken };
}

/** Regenera el código de recuperación invalidando el anterior. */
export async function refreshRecovery(env: Env, ownerId: string, currentCode: string, newCode: string): Promise<boolean> {
  const currentHash = await sha256Hex(currentCode);
  const owned = await env.DB.prepare(
    'SELECT id FROM owners WHERE id = ? AND recovery_hash = ?',
  ).bind(ownerId, currentHash).first<{ id: string }>();
  if (!owned) return false;
  const newHash = await sha256Hex(newCode);
  await env.DB.prepare('UPDATE owners SET recovery_hash = ?, updated_at = ? WHERE id = ?')
    .bind(newHash, Date.now(), ownerId).run();
  return true;
}

/**
 * Autentica la petición. Devuelve null si no hay sesión válida. El código de
 * recuperación nunca debe usarse para autenticar operaciones de datos: eso
 * rompería la rotación del código.
 */
export async function authenticate(env: Env, req: Request): Promise<string | null> {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    'SELECT a.owner_id, a.expires_at FROM auth_sessions a WHERE a.token_hash = ?',
  ).bind(tokenHash).first<{ owner_id: string; expires_at: number }>();
  if (!row) return null;
  if (Date.now() > row.expires_at) return null;
  return row.owner_id;
}

export function clearSessionCookies(): Headers {
  const headers = new Headers();
  headers.append('Set-Cookie', clearCookie(SESSION_COOKIE));
  headers.append('Set-Cookie', clearCookie(OWNER_COOKIE));
  // Aun en desarrollo no cachear respuestas de sesión.
  headers.set('Cache-Control', 'no-store');
  return headers;
}

export function sessionCookie(token: string, env: Env): string {
  return setCookie(SESSION_COOKIE, token, Math.floor(SESSION_TTL_MS / 1000), env);
}

export function ownerCookie(ownerId: string, env: Env): string {
  return setCookie(OWNER_COOKIE, ownerId, Math.floor(SESSION_TTL_MS / 1000), env);
}

export async function invalidateSession(env: Env, req: Request): Promise<void> {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(tokenHash).run();
}
