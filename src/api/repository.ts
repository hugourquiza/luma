// Repositorio del cliente: coordina la API remota (D1), la caché local en
// IndexedDB y la cola de operaciones pendientes. Los componentes usan este
// repositorio y NO hacen `fetch` directos.

import { profileApi, identityApi, OfflineError } from './client';
import { enqueueOp, flushQueue, startSync } from './sync';
import { getLocalIdentity, saveLocalIdentity, clearLocalIdentity, generateRecoveryCode } from '../storage/identity';
import {
  getProfiles, saveProfile, type Profile,
  getSession, type Session, type SkillProgress, type Attempt,
  getSkillProgress, addSticker,
  saveLessonProgress, saveSkillProgress, saveSessionProgress,
  exportProfileData,
} from '../storage/db';
import type {
  ProfileDTO, ProfileStateDTO, GameSessionDTO,
  SaveCheckpointRequest, CompleteLessonRequest, ImportRequest,
} from '../shared/schema';

export interface RemoteResult {
  online: boolean;
  /** true cuando este dispositivo tiene una identidad remota configurada. */
  hasLocalIdentity: boolean;
  /** true si quedan operaciones pendientes por sincronizar. */
  hasPending: boolean;
}

export type ProfileLocalWithRemote = Profile;

let hasPending = false;

export class NotInitializedError extends Error {
  constructor() { super('No hay identidad remota en este dispositivo'); this.name = 'NotInitializedError'; }
}

export function setPendingFlag(v: boolean): void { hasPending = v; }
export function isOnline(): boolean { return navigator.onLine; }

/** Comprueba si hay una identidad local (remota configurada). */
export async function hasIdentityRemote(): Promise<boolean> {
  return !!(await getLocalIdentity());
}

/**
 * Inicializa la identidad: crea una nueva (y guarda el código de recuperación
 * local) o la recupera desde el código existente. Es la puerta de entrada a la
 * parte remota; requiere conexión.
 */
export async function ensureIdentity(): Promise<{ identity: { ownerId: string; createdAt: number; recoveryCode: string } | null; created: boolean }> {
  const existing = await getLocalIdentity();
  if (existing) {
    // Reutiliza la identidad guardada; la sesión remota se valida con /api/me.
    try {
      const me = await identityApi.me();
      if (me.ownerId !== existing.ownerId) {
        // Identidad local desalineada con remota: limpiar y recrear.
        await clearLocalIdentity();
        return ensureIdentity();
      }
      return { identity: { ...existing, ownerId: me.ownerId }, created: false };
    } catch (e) {
      if (e instanceof OfflineError) {
        // Sin conexión: devolvemos la identidad local para uso offline.
        return { identity: { ownerId: existing.ownerId, createdAt: existing.createdAt, recoveryCode: existing.recoveryCode }, created: false };
      }
      // Error de API (401): la sesión expiró; reintentamos recuperando desde el código.
      // Si el código también falla, re-creamos.
      throw e;
    }
  }
  const code = generateRecoveryCode();
  const dto = await identityApi.createIdentity(code);
  await saveLocalIdentity({ ownerId: dto.ownerId, recoveryCode: code, createdAt: dto.createdAt });
  setPendingFlag(false);
  return { identity: { ownerId: dto.ownerId, createdAt: dto.createdAt, recoveryCode: code }, created: true };
}

/** Recupera una identidad desde un código escrito por el adulto. */
export async function recoverIdentityFromCode(code: string): Promise<{ ownerId: string; createdAt: number } | null> {
  try {
    const dto = await identityApi.recoverIdentity(code);
    await saveLocalIdentity({ ownerId: dto.ownerId, recoveryCode: code, createdAt: dto.createdAt });
    setPendingFlag(false);
    return { ownerId: dto.ownerId, createdAt: dto.createdAt };
  } catch {
    return null;
  }
}

/** Regenera el código de recuperación (invalida el anterior en el servidor). */
export async function regenerateRecovery(): Promise<string | null> {
  const id = await getLocalIdentity();
  if (!id) return null;
  const newCode = generateRecoveryCode();
  try {
    await identityApi.refreshRecovery(id.recoveryCode, newCode);
    await saveLocalIdentity({ ...id, recoveryCode: newCode });
    return newCode;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  try { await identityApi.logout(); } catch { /* offline */ }
  await clearLocalIdentity();
}

// ---------- Perfiles remotos + caché local ----------
// D1 es la fuente de verdad. IndexedDB es caché: al leer con conexión, usamos
// el remoto y refrescamos la caché local; sin conexión, la caché local.

async function refreshLocalCacheFromRemote(profiles: ProfileDTO[]): Promise<void> {
  for (const p of profiles) {
    await saveProfile({ id: p.id, avatarId: p.avatarId, displayName: p.displayName, createdAt: p.createdAt });
  }
}

/** Lista perfiles (remoto si hay conexión, caché local si no). */
export async function listProfilesWithCache(): Promise<{ profiles: Profile[]; result: RemoteResult }> {
  const id = await getLocalIdentity();
  if (!id) return { profiles: await getProfiles(), result: { online: isOnline(), hasLocalIdentity: false, hasPending } };
  try {
    const remotes = await profileApi.listProfiles();
    await refreshLocalCacheFromRemote(remotes);
    return {
      profiles: remotes.map((p) => ({ id: p.id, avatarId: p.avatarId, displayName: p.displayName, createdAt: p.createdAt })),
      result: { online: true, hasLocalIdentity: true, hasPending },
    };
  } catch {
    return {
      profiles: await getProfiles(),
      result: { online: false, hasLocalIdentity: true, hasPending },
    };
  }
}

/**
 * Crea un perfil local, lo alinea con id local en cache/cola y lo envía a la
 * nube. Recibe el perfil YA creado (con su id estable) para cache, cola y
 * subida; usa el mismo id que la app usa para navegar/select. No genera un id
 * nuevo: eso rompería la correspondencia caché↔D1 y duplicaría el perfil.
 */
export async function createProfileLocal(profile: Profile): Promise<void> {
  const { id, displayName, avatarId } = profile;
  await saveProfile(profile); // caché local (reflejo) — nunca bloquea en la red

  // Subida remota en segundo plano: no bloquea el flujo de juego. La identidad
  // remota se auto-crea la primera vez; sin conexión o sin backend el perfil
  // queda local (pendiente) y se sincroniza al recuperar red.
  void (async () => {
    let existing = await getLocalIdentity();
    if (!existing) {
      try { await ensureIdentity(); existing = await getLocalIdentity(); } catch { existing = null; }
    }
    if (existing) {
      await enqueueOp({ id: crypto.randomUUID(), kind: 'createProfile', profileId: id, payload: { displayName: displayName ?? 'Jugador', avatarId, id } });
      setPendingFlag(true);
      void flushQueue();
    }
  })();
}

/** Renombra un perfil (conserva ids y progreso). */
export async function renameProfile(profileId: string, displayName: string): Promise<void> {
  await profileApi.updateProfile(profileId, { displayName });
  const all = await getProfiles();
  const prof = all.find((x) => x.id === profileId);
  if (prof) await saveProfile({ ...prof, displayName });
}

/** Estado completo de un perfil desde el remoto (cacheado). */
export async function getProfileStateLocal(profileId: string): Promise<{ state: ProfileStateDTO | null; online: boolean }> {
  try {
    const state = await profileApi.getProfileState(profileId);
    return { state, online: true };
  } catch {
    return { state: null, online: false };
  }
}

/** Devuelve la sesión reanudable (perfil+lección) del remoto o de caché. */
export async function getResumeSession(profileId: string, lessonId: string): Promise<{ session: GameSessionDTO | null }> {
  try {
    return await profileApi.resumeSession(profileId, lessonId);
  } catch {
    const cached = await getSession(profileId);
    if (cached && cached.lessonId === lessonId && cached.currentIndex < cached.activityOrder.length) {
      return { session: { ...cached, status: 'active', checkpointAttempts: [], startedAt: cached.startedAt, updatedAt: cached.updatedAt, regionId: cached.regionId, profileId } as GameSessionDTO };
    }
    return { session: null };
  }
}

/** Guarda un checkpoint: durable en la cola, envío inmediato. */
export async function saveCheckpointRemote(profileId: string, req: SaveCheckpointRequest): Promise<void> {
  const id = await getLocalIdentity();
  if (!id) throw new NotInitializedError();
  await enqueueOp({ id: req.opId, kind: 'checkpoint', profileId, payload: req });
  setPendingFlag(true);
  void flushQueue();
  // Reflejo local del estado de sesión para reanudación sin conexión.
  await saveSessionProgress(profileId, {
    id: req.sessionId, profileId, regionId: req.regionId, lessonId: req.lessonId,
    activityOrder: req.activityOrder, currentIndex: req.currentIndex,
    startedAt: Date.now(), updatedAt: Date.now(),
  }, req.attempts.map((a) => ({
    id: a.id, sessionId: a.sessionId, activityId: a.activityId, profileId,
    outcome: a.outcome, retries: a.retries, assists: a.assists, timestamp: a.timestamp,
  })));
}

/** Cierra la lección de forma atómica e idempotente (opId) y encola. */
export async function completeLessonRemote(profileId: string, req: CompleteLessonRequest): Promise<void> {
  const id = await getLocalIdentity();
  if (!id) throw new NotInitializedError();
  await enqueueOp({ id: req.opId, kind: 'complete', profileId, payload: req });
  setPendingFlag(true);
  void flushQueue();
  // Reflejo local: marcar sesión completada + progreso/colección.
  const completedAttempts = req.results.map((a) => ({
    id: a.id, sessionId: a.sessionId, activityId: a.activityId, profileId,
    outcome: a.outcome, retries: a.retries, assists: a.assists, timestamp: a.timestamp,
  }));
  await saveSessionProgress(profileId, {
    id: req.sessionId, profileId, regionId: req.regionId, lessonId: req.lessonId,
    activityOrder: req.activityOrder, currentIndex: req.currentIndex,
    startedAt: Date.now(), updatedAt: Date.now(),
  }, completedAttempts);
  if (req.lessonProgress) await saveLessonProgress({
    lessonId: req.lessonProgress.lessonId, profileId,
    completed: req.lessonProgress.completed,
    lastCompletedAt: req.lessonProgress.lastCompletedAt,
    independentCount: req.lessonProgress.independentCount,
  });
  if (req.sticker) await addSticker(profileId, req.sticker.stickerId, Date.now());
  for (const sp of req.skillProgress) {
    const cur = (await getSkillProgress(profileId)).find((x) => x.skillId === sp.skillId);
    await saveSkillProgress({
      skillId: sp.skillId, profileId,
      independent: (cur?.independent ?? 0) + sp.independent,
      assisted: (cur?.assisted ?? 0) + sp.assisted,
      errors: (cur?.errors ?? 0) + sp.errors,
      last5: sp.last5,
      sessions: new Set([...(cur?.sessions ?? []), ...sp.sessionsIn]),
    });
  }
}

/** Importa un perfil local a remoto (adulto confirma). Conserva IDs cuando es seguro. */
export async function importLocalProfileRemote(profileId: string): Promise<void> {
  const id = await getLocalIdentity();
  if (!id) throw new NotInitializedError();
  const local = (await exportProfileData(profileId)) as {
    profile: { id: string; avatarId: string; displayName?: string; createdAt: number };
    sessions: Session[];
    attempts: Attempt[];
    skillProgress: SkillProgress[];
    lessonProgress: { lessonId: string; profileId: string; completed: boolean; lastCompletedAt?: number; independentCount: number }[];
    collection: { stickerId: string; earnedAt: number }[];
  };
  const dto: ImportRequest = {
    profile: {
      id: local.profile.id, ownerId: id.ownerId,
      displayName: local.profile.displayName ?? 'Jugador',
      avatarId: local.profile.avatarId,
      createdAt: local.profile.createdAt, updatedAt: Date.now(),
    },
    sessions: (local.sessions ?? []).map((s) => ({
      id: s.id, profileId: s.profileId, regionId: s.regionId, lessonId: s.lessonId,
      activityOrder: s.activityOrder, currentIndex: s.currentIndex, status: (s.currentIndex >= s.activityOrder.length ? 'completed' : 'active') as 'active' | 'completed',
      startedAt: s.startedAt, updatedAt: s.updatedAt, checkpointAttempts: [],
    })),
    attempts: (local.attempts ?? []).map((a) => ({
      id: a.id, sessionId: a.sessionId, activityId: a.activityId, profileId: a.profileId,
      outcome: a.outcome, retries: a.retries, assists: a.assists, timestamp: a.timestamp,
    })),
    skillProgress: (local.skillProgress ?? []).map((s) => ({
      skillId: s.skillId, independent: s.independent, assisted: s.assisted, errors: s.errors,
      last5: s.last5, sessionsIn: [...s.sessions],
    })),
    lessonProgress: (local.lessonProgress ?? []).map((l) => ({
      lessonId: l.lessonId, completed: l.completed, lastCompletedAt: l.lastCompletedAt, independentCount: l.independentCount,
    })),
    collection: (local.collection ?? []).map((c) => ({ stickerId: c.stickerId, earnedAt: c.earnedAt })),
  };
  await profileApi.importProfile(profileId, dto);
  // Marcar migración completa tras confirmación del servidor: la app lee de remoto.
}

export { startSync };
