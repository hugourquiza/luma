// Enrutador de la API /api/* del Worker de Isla de las Letras.
// Reglas de la API:
//   - JSON de entrada/salida; errores con cuerpo `{ error, code }`.
//   - SQL parametrizado en todo momento (nunca interpolación).
//   - Verificación de pertenencia del perfil al propietario autenticado.
//   - Idempotencia por opId en las mutaciones.
//   - Respuestas privadas siempre Cache-Control: no-store.
import type { Env } from './env';
import {
  authenticate, createOwner, recoverOwner, refreshRecovery,
  invalidateSession, sessionCookie, ownerCookie, clearSessionCookies,
} from './auth';
import { uuid } from './crypto';
import {
  validateDisplayName, validateAvatarId, isValidUuid,
  validateAttemptOutcome, normalizeDisplayName, validateId,
} from '../../src/shared/validate';
import type {
  OwnerIdentityDTO, ProfileDTO, SaveCheckpointRequest, CompleteLessonRequest,
  AttemptDTO, SkillProgressDTO, ImportRequest,
} from '../../src/shared/schema';
import {
  getOwnedProfile, listProfiles, readProfileState,
  findResumableSession, readSessionById, sessionToDTO, profileToDTO,
} from './profile-repo';

export interface HandlerCtx {
  env: Env;
  ownerId: string;
  url: URL;
}

// ---------- utilidades de respuesta ----------

type JsonBody = unknown;
function json(data: JsonBody, status = 200, extraHeaders?: Record<string, string>): Response {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  if (extraHeaders) for (const [k, v] of Object.entries(extraHeaders)) headers.append(k, v);
  return new Response(JSON.stringify(data), { status, headers });
}

function error(status: number, code: string, message?: string): Response {
  return json({ error: code, message, code }, status);
}

async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

// ---------- helpers de mutación idempotente ----------

/** Marca un opId como aplicado; devuelve false si ya estaba aplicado. */
async function markApplied(env: Env, profileId: string, opId: string, kind: string): Promise<boolean> {
  try {
    await env.DB.prepare('INSERT INTO mutations (op_id, profile_id, kind, applied_at) VALUES (?, ?, ?, ?)')
      .bind(opId, profileId, kind, Date.now()).run();
    return true;
  } catch {
    return false; // ya existía → operación repetida
  }
}

/** Convierte un Set de session ids a array para transporte (no perder con JSON). */
function sessionsSetToArray(sessions: Set<string>): string[] {
  return [...sessions];
}

// ---------- Handlers de identidad ----------

async function handleCreateIdentity(env: Env, req: Request): Promise<Response> {
  const body = await readJson<{ recoveryCode?: string }>(req);
  if (!body || typeof body.recoveryCode !== 'string' || body.recoveryCode.length < 16) {
    return error(400, 'invalid_recovery', 'Código de recuperación inválido');
  }
  const { ownerId, sessionToken } = await createOwner(env, body.recoveryCode);
  const env2 = { ...env, ENVIRONMENT: env.ENVIRONMENT ?? 'production' } as Env;
  const headers = new Headers();
  headers.append('Set-Cookie', sessionCookie(sessionToken, env2));
  headers.append('Set-Cookie', ownerCookie(ownerId, env2));
  headers.set('Cache-Control', 'no-store');
  const dto: OwnerIdentityDTO = { ownerId, createdAt: Date.now(), isNew: true };
  return json(dto, 201, { 'Set-Cookie': headers.get('Set-Cookie') ?? '' });
}

async function handleRecoverIdentity(env: Env, req: Request): Promise<Response> {
  const body = await readJson<{ recoveryCode?: string }>(req);
  if (!body || typeof body.recoveryCode !== 'string' || body.recoveryCode.length < 16) {
    return error(400, 'invalid_recovery', 'Código de recuperación inválido');
  }
  const result = await recoverOwner(env, body.recoveryCode);
  if (!result) return error(401, 'invalid_code', 'El código de recuperación no es correcto');
  const env2 = { ...env, ENVIRONMENT: env.ENVIRONMENT ?? 'production' } as Env;
  const headers = new Headers();
  headers.append('Set-Cookie', sessionCookie(result.sessionToken, env2));
  headers.append('Set-Cookie', ownerCookie(result.ownerId, env2));
  headers.set('Cache-Control', 'no-store');
  const dto: OwnerIdentityDTO = { ownerId: result.ownerId, createdAt: Date.now(), isNew: false };
  return json(dto, 200, { 'Set-Cookie': headers.get('Set-Cookie') ?? '' });
}

async function handleRefreshRecovery(env: Env, ownerId: string, req: Request): Promise<Response> {
  const body = await readJson<{ currentCode?: string; newCode?: string }>(req);
  if (!body || typeof body.currentCode !== 'string' || typeof body.newCode !== 'string' ||
      body.newCode.length < 16) {
    return error(400, 'invalid_recovery');
  }
  const ok = await refreshRecovery(env, ownerId, body.currentCode, body.newCode);
  if (!ok) return error(401, 'invalid_current_code', 'El código actual no es correcto');
  return json({ recovered: true });
}

async function handleLogout(env: Env, req: Request): Promise<Response> {
  await invalidateSession(env, req);
  const headers = clearSessionCookies();
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...Object.fromEntries(headers) } });
}

// ---------- Handlers de perfiles ----------

async function handleListProfiles(env: Env, ownerId: string): Promise<Response> {
  const profiles = await listProfiles(env, ownerId);
  return json({ profiles });
}

async function handleCreateProfile(env: Env, ownerId: string, req: Request): Promise<Response> {
  const body = await readJson<{ displayName?: string; avatarId?: string; id?: string }>(req);
  if (!body) return error(400, 'invalid_body');
  const name = normalizeDisplayName(body.displayName ?? '');
  const nameCheck = validateDisplayName(name);
  if (!nameCheck.ok) return error(400, 'invalid_name', nameCheck.error);
  if (!validateAvatarId(body.avatarId ?? '')) return error(400, 'invalid_avatar');
  let profileId = uuid();
  if (body.id) {
    // El cliente puede proponer su id (alineado con la caché local).
    if (!isValidUuid(body.id)) return error(400, 'invalid_profile_id');
    profileId = body.id;
    const exists = await getOwnedProfile(env, ownerId, profileId);
    if (exists) return json(profileToDTO(exists)); // idempotente: ya creado
  }
  const now = Date.now();
  const dto: ProfileDTO = {
    id: profileId, ownerId, displayName: name, avatarId: body.avatarId!,
    createdAt: now, updatedAt: now,
  };
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO profiles (id, owner_id, display_name, avatar_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(profileId, ownerId, name, body.avatarId!, now, now),
    env.DB.prepare('INSERT INTO profile_resources (profile_id, revision, updated_at) VALUES (?, 1, ?)')
      .bind(profileId, now),
  ]);
  return json(dto, 201);
}

async function handleUpdateProfile(env: Env, ownerId: string, profileId: string, req: Request): Promise<Response> {
  const profile = await getOwnedProfile(env, ownerId, profileId);
  if (!profile) return error(404, 'not_found');
  const body = await readJson<{ displayName?: string; avatarId?: string }>(req);
  if (!body || (body.displayName === undefined && body.avatarId === undefined)) {
    return error(400, 'nothing_to_update');
  }
  const nextName = body.displayName !== undefined ? normalizeDisplayName(body.displayName) : profile.display_name;
  if (body.displayName !== undefined) {
    const check = validateDisplayName(nextName);
    if (!check.ok) return error(400, 'invalid_name', check.error);
  }
  const nextAvatar = body.avatarId !== undefined ? body.avatarId : profile.avatar_id;
  if (body.avatarId !== undefined && !validateAvatarId(nextAvatar)) return error(400, 'invalid_avatar');
  const now = Date.now();
  await env.DB.prepare(
    'UPDATE profiles SET display_name = ?, avatar_id = ?, updated_at = ? WHERE id = ?',
  ).bind(nextName, nextAvatar, now, profileId).run();
  return json({
    id: profileId, ownerId, displayName: nextName, avatarId: nextAvatar,
    createdAt: profile.created_at, updatedAt: now,
  } satisfies ProfileDTO);
}

async function handleGetProfileState(env: Env, ownerId: string, profileId: string): Promise<Response> {
  const state = await readProfileState(env, ownerId, profileId);
  if (!state) return error(404, 'not_found');
  return json(state);
}

async function handleResume(env: Env, ownerId: string, profileId: string, req: Request): Promise<Response> {
  const lessonId = new URL(req.url).searchParams.get('lessonId');
  if (!lessonId || !validateId(lessonId)) return error(400, 'invalid_lesson');
  if (!(await getOwnedProfile(env, ownerId, profileId))) return error(404, 'not_found');
  const session = await findResumableSession(env, profileId, lessonId);
  return json({ session: session ? sessionToDTO(session) : null });
}

// ---------- Checkpoint y cierre de lección ----------

function validateAttempt(a: AttemptDTO): boolean {
  return typeof a.id === 'string' && validateId(a.id) &&
    typeof a.sessionId === 'string' && isValidUuid(a.sessionId) &&
    typeof a.activityId === 'string' &&
    validateAttemptOutcome(a.outcome) &&
    Number.isInteger(a.retries) && a.retries >= 0 &&
    Number.isInteger(a.assists) && a.assists >= 0 &&
    typeof a.timestamp === 'number';
}

async function handleSaveCheckpoint(env: Env, ownerId: string, profileId: string, req: Request): Promise<Response> {
  const body = await readJson<SaveCheckpointRequest>(req);
  if (!body) return error(400, 'invalid_body');
  if (!isValidUuid(body.sessionId) || !isValidUuid(profileId) ||
      !(await getOwnedProfile(env, ownerId, profileId))) return error(404, 'not_found');
  if (!Array.isArray(body.activityOrder) || !Array.isArray(body.attempts)) return error(400, 'invalid_body');
  if (!Number.isInteger(body.currentIndex) || body.currentIndex < 0) return error(400, 'invalid_index');

  // Idempotencia: aplicar una vez.
  if (!(await markApplied(env, profileId, body.opId, 'checkpoint'))) {
    return json({ ok: true, idempotent: true });
  }

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO game_sessions (id, profile_id, region_id, lesson_id, activity_order, current_index, status, started_at, updated_at, checkpoint)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       lesson_id=excluded.lesson_id, activity_order=excluded.activity_order,
       current_index=excluded.current_index, updated_at=excluded.updated_at, checkpoint=excluded.checkpoint`,
  ).bind(
    body.sessionId, profileId, body.regionId, body.lessonId,
    JSON.stringify(body.activityOrder), body.currentIndex, now, now,
    JSON.stringify(body.attempts),
  ).run();

  // intentos de checkpoint
  await upsertAttempts(env, profileId, body.sessionId, body.attempts);
  await env.DB.prepare('UPDATE profile_resources SET updated_at = ?, revision = revision WHERE profile_id = ?').bind(now, profileId).run();
  return json({ ok: true });
}

async function upsertAttempts(env: Env, profileId: string, sessionId: string, attempts: AttemptDTO[]): Promise<void> {
  const stmts = attempts
    .filter((a) => a.sessionId === sessionId && validateAttempt(a))
    .map((a) => env.DB.prepare(
      `INSERT INTO attempts (id, session_id, profile_id, activity_id, outcome, retries, assists, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    ).bind(a.id, a.sessionId, profileId, a.activityId, a.outcome, a.retries, a.assists, a.timestamp));
  if (stmts.length) await env.DB.batch(stmts);
}

/**
 * Cierre atómico e idempotente de una lección. Persiste sesión completada,
 * progreso de habilidades, lección completada y pegatina en UNA operación
 * marcada por opId: reenviar no duplica intentos, premios ni contadores.
 */
async function handleCompleteLesson(env: Env, ownerId: string, profileId: string, req: Request): Promise<Response> {
  const body = await readJson<CompleteLessonRequest>(req);
  if (!body) return error(400, 'invalid_body');
  if (!isValidUuid(body.sessionId) || !isValidUuid(profileId) ||
      !(await getOwnedProfile(env, ownerId, profileId))) return error(404, 'not_found');

  // Idempotencia: un mismo opId de cierre no debe aplicarse dos veces.
  if (!(await markApplied(env, profileId, body.opId, 'complete'))) {
    const st = await readSessionById(env, profileId, body.sessionId);
    return json({ ok: true, idempotent: true, status: st ? st.status : 'completed' });
  }

  const now = Date.now();

  // 1. Marcar la sesión como completada.
  await env.DB.prepare(
    `UPDATE game_sessions SET status='completed', current_index = ?, updated_at = ?, checkpoint = ?
     WHERE id = ? AND profile_id = ?`,
  ).bind(body.currentIndex, now, JSON.stringify(body.results ?? []), body.sessionId, profileId).run();

  // 2. Intentos finales (los del cierre ya pueden ser finales).
  await upsertAttempts(env, profileId, body.sessionId, body.results ?? []);

  // 3. Progreso de habilidades (contadores + últimos 5 + sesiones).
  if (Array.isArray(body.skillProgress)) {
    const stmts = body.skillProgress
      .filter((s: SkillProgressDTO) => typeof s.skillId === 'string')
      .map((s: SkillProgressDTO) => env.DB.prepare(
        `INSERT INTO skill_progress (profile_id, skill_id, independent, assisted, errors, last5, sessions_in, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(profile_id, skill_id) DO UPDATE SET
           independent = skill_progress.independent + excluded.independent,
           assisted    = skill_progress.assisted + excluded.assisted,
           errors      = skill_progress.errors + excluded.errors,
           last5       = excluded.last5,
           sessions_in = excluded.sessions_in,
           updated_at  = excluded.updated_at`,
      ).bind(profileId, s.skillId, s.independent, s.assisted, s.errors,
        JSON.stringify(s.last5), JSON.stringify(s.sessionsIn), now));
    if (stmts.length) await env.DB.batch(stmts);
  }

  // 4. Lección completada (solo avanza; nunca decrece los contadores).
  if (body.lessonProgress) {
    await env.DB.prepare(
      `INSERT INTO lesson_progress (profile_id, lesson_id, completed, last_completed_at, independent_count)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(profile_id, lesson_id) DO UPDATE SET
         completed=1,
         last_completed_at = COALESCE(NULLIF(lesson_progress.last_completed_at, 0), excluded.last_completed_at),
         independent_count = MAX(lesson_progress.independent_count, excluded.independent_count)`,
    ).bind(profileId, body.lessonProgress.lessonId, now, body.lessonProgress.independentCount).run();
  }

  // 5. Pegatina (sin duplicados por perfil).
  if (body.sticker && typeof body.sticker.stickerId === 'string') {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO collection (profile_id, sticker_id, earned_at) VALUES (?, ?, ?)',
    ).bind(profileId, body.sticker.stickerId, now).run();
  }

  await env.DB.prepare('UPDATE profile_resources SET updated_at = ?, revision = revision WHERE profile_id = ?').bind(now, profileId).run();
  return json({ ok: true });
}

// ---------- Import / export / borrado ----------

async function handleImport(env: Env, ownerId: string, profileId: string, req: Request): Promise<Response> {
  const body = await readJson<ImportRequest>(req);
  if (!body || !body.profile || !Array.isArray(body.sessions) || !Array.isArray(body.attempts) ||
      !Array.isArray(body.skillProgress) || !Array.isArray(body.lessonProgress) || !Array.isArray(body.collection)) {
    return error(400, 'invalid_import');
  }
  // Idempotente: si el perfil remoto ya existe y pertenece a este owner, devuelve éxito sin duplicar.
  const existing = await getOwnedProfile(env, ownerId, profileId);
  if (existing) return json({ ok: true, idempotent: true, profileId });

  const now = Date.now();
  const p = body.profile;
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(
      'INSERT INTO profiles (id, owner_id, display_name, avatar_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(p.id, ownerId, p.displayName, p.avatarId, p.createdAt || now, now),
    env.DB.prepare('INSERT INTO profile_resources (profile_id, revision, updated_at) VALUES (?, 1, ?)')
      .bind(p.id, now),
  ];
  for (const s of body.sessions) {
    stmts.push(env.DB.prepare(
      `INSERT OR IGNORE INTO game_sessions (id, profile_id, region_id, lesson_id, activity_order, current_index, status, started_at, updated_at, checkpoint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(s.id, p.id, s.regionId, s.lessonId, JSON.stringify(s.activityOrder ?? []), s.currentIndex ?? 0,
      s.status ?? 'completed', s.startedAt ?? now, s.updatedAt ?? now, null));
  }
  for (const a of body.attempts) {
    if (!validateAttempt(a)) continue;
    stmts.push(env.DB.prepare(
      `INSERT OR IGNORE INTO attempts (id, session_id, profile_id, activity_id, outcome, retries, assists, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(a.id, a.sessionId, p.id, a.activityId, a.outcome, a.retries, a.assists, a.timestamp));
  }
  for (const s of body.skillProgress) {
    stmts.push(env.DB.prepare(
      `INSERT OR IGNORE INTO skill_progress (profile_id, skill_id, independent, assisted, errors, last5, sessions_in, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(p.id, s.skillId, s.independent, s.assisted, s.errors, JSON.stringify(s.last5 ?? []), JSON.stringify(s.sessionsIn ?? []), now));
  }
  for (const l of body.lessonProgress) {
    stmts.push(env.DB.prepare(
      `INSERT OR IGNORE INTO lesson_progress (profile_id, lesson_id, completed, last_completed_at, independent_count) VALUES (?, ?, ?, ?, ?)`,
    ).bind(p.id, l.lessonId, l.completed ? 1 : 0, l.lastCompletedAt ?? null, l.independentCount ?? 0));
  }
  for (const c of body.collection) {
    stmts.push(env.DB.prepare('INSERT OR IGNORE INTO collection (profile_id, sticker_id, earned_at) VALUES (?, ?, ?)')
      .bind(p.id, c.stickerId, c.earnedAt ?? now));
  }
  await env.DB.batch(stmts);
  return json({ ok: true, profileId: p.id });
}

async function handleExport(env: Env, ownerId: string, profileId: string): Promise<Response> {
  const state = await readProfileState(env, ownerId, profileId);
  if (!state) return error(404, 'not_found');
  return json({
    format: 'isla-export',
    version: 1,
    exportedAt: Date.now(),
    profile: state.profile,
    sessions: state.sessions,
    attempts: state.attempts,
    skillProgress: state.skillProgress.map((s: SkillProgressDTO) => ({ ...s, last5: [...s.last5], sessionsIn: [...s.sessionsIn] })),
    lessonProgress: state.lessonProgress,
    collection: state.collection,
    revision: state.revision,
  });
}

async function handleDeleteProfile(env: Env, ownerId: string, profileId: string): Promise<Response> {
  if (!(await getOwnedProfile(env, ownerId, profileId))) return error(404, 'not_found');
  const now = Date.now();
  // Tombstone: una operación atrasada de otro dispositivo no debe resucitarlo.
  await env.DB.batch([
    env.DB.prepare('UPDATE profiles SET deleted_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
      .bind(now, now, profileId, ownerId),
    env.DB.prepare(`DELETE FROM game_sessions WHERE profile_id = ?`).bind(profileId),
    env.DB.prepare(`DELETE FROM attempts WHERE profile_id = ?`).bind(profileId),
    env.DB.prepare(`DELETE FROM skill_progress WHERE profile_id = ?`).bind(profileId),
    env.DB.prepare(`DELETE FROM lesson_progress WHERE profile_id = ?`).bind(profileId),
    env.DB.prepare(`DELETE FROM collection WHERE profile_id = ?`).bind(profileId),
    env.DB.prepare(`DELETE FROM profile_resources WHERE profile_id = ?`).bind(profileId),
  ]);
  return json({ ok: true });
}

// ---------- Router ----------

// Extrae el valor del segmento `:profileId` del pathname.
function profileIdFromPath(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  // esperado: ['api','profiles',profileId,'state'|...]
  if (parts[0] !== 'api' || parts[1] !== 'profiles') return null;
  return parts[2] ?? null;
}

class StatusError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

/** Rutas públicas, sin autenticación (crear/recuperar identidad). */
function isPublicRoute(method: string, pathname: string): boolean {
  return (method === 'POST' && pathname === '/api/identity') ||
    (method === 'POST' && pathname === '/api/recover');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // API nunca cae en el fallback SPA; cualquier /api/* que no matchee → 404 JSON.
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    const headers = new Headers();
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Cache-Control', 'no-store');

    try {
      // Rutas públicas de identidad.
      if (isPublicRoute(request.method, url.pathname)) {
        if (request.method === 'POST' && url.pathname === '/api/identity') {
          return await handleCreateIdentity(env, request);
        }
        if (request.method === 'POST' && url.pathname === '/api/recover') {
          return await handleRecoverIdentity(env, request);
        }
        return error(404, 'not_found');
      }

      // Autenticación para el resto.
      const ownerId = await authenticate(env, request);
      if (!ownerId) return error(401, 'unauthorized', 'Iniciá sesión o recuperá tu identidad');

      const method = request.method;
      const path = url.pathname;
      const pid = profileIdFromPath(url);

      if (method === 'POST' && path === '/api/refresh-recovery') {
        return await handleRefreshRecovery(env, ownerId, request);
      }
      if (method === 'POST' && path === '/api/logout') {
        return await handleLogout(env, request);
      }
      if (method === 'GET' && path === '/api/me') {
        return json({ ownerId, profiles: await listProfiles(env, ownerId) });
      }

      if (method === 'GET' && path === '/api/profiles') return await handleListProfiles(env, ownerId);
      if (method === 'POST' && path === '/api/profiles') return await handleCreateProfile(env, ownerId, request);

      // Rutas con :profileId
      if (pid) {
        if (!isValidUuid(pid)) return error(400, 'invalid_profile_id');

        if (method === 'GET' && path === `/api/profiles/${pid}/state`) {
          return await handleGetProfileState(env, ownerId, pid);
        }
        if (method === 'GET' && path === `/api/profiles/${pid}/resume`) {
          return await handleResume(env, ownerId, pid, request);
        }
        if (method === 'GET' && path === `/api/profiles/${pid}/export`) {
          return await handleExport(env, ownerId, pid);
        }
        if (method === 'PATCH' && path === `/api/profiles/${pid}`) {
          return await handleUpdateProfile(env, ownerId, pid, request);
        }
        if (method === 'POST' && path === `/api/profiles/${pid}/checkpoint`) {
          return await handleSaveCheckpoint(env, ownerId, pid, request);
        }
        if (method === 'POST' && path === `/api/profiles/${pid}/complete`) {
          return await handleCompleteLesson(env, ownerId, pid, request);
        }
        if (method === 'POST' && path === `/api/profiles/${pid}/import`) {
          return await handleImport(env, ownerId, pid, request);
        }
        if (method === 'DELETE' && path === `/api/profiles/${pid}`) {
          return await handleDeleteProfile(env, ownerId, pid);
        }
      }

      return error(404, 'not_found');
    } catch (e) {
      if (e instanceof StatusError) return error(e.status, e.code, e.message);
      console.error('error en la API', e);
      return error(500, 'internal');
    }
  },
};

// Reexportar helpers para tests.
export { json, error, sessionsSetToArray };
