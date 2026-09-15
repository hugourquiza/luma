// Cliente HTTP del mismo origen hacia /api/*. Las cookies de sesión
// (HttpOnly) se envían automáticamente por ser same-origin. No se incluyen
// tokens ni credenciales de Cloudflare aquí. Errores unificados: lanza
// ApiError con status/code/body para que la UI muestre estados recuperables.

import type {
  OwnerIdentityDTO, ProfileDTO, ProfileStateDTO, GameSessionDTO,
  SaveCheckpointRequest, CompleteLessonRequest, ImportRequest,
} from '../shared/schema';

export class ApiError extends Error {
  status: number;
  code: string;
  body: unknown;
  constructor(status: number, code: string, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export class OfflineError extends Error {
  constructor() {
    super('Sin conexión');
    this.name = 'OfflineError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  try {
    res = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  } catch {
    throw new OfflineError();
  }
  if (!res.ok) {
    let code = 'error';
    let message = `HTTP ${res.status}`;
    let body: unknown = null;
    try {
      body = await res.json();
      if (body && typeof body === 'object') {
        const b = body as { code?: string; message?: string };
        if (b.code) code = b.code;
        if (b.message) message = b.message;
      }
    } catch {
      /* sin cuerpo JSON */
    }
    throw new ApiError(res.status, code, message, body);
  }
  return (await res.json()) as T;
}

export interface IdentityApi {
  /** Crea una identidad remota con el código de recuperación generado. */
  createIdentity(recoveryCode: string): Promise<OwnerIdentityDTO>;
  /** Recupera una identidad existente con el código. */
  recoverIdentity(recoveryCode: string): Promise<OwnerIdentityDTO>;
  /** Regenera el código de recuperación (invalida el anterior). */
  refreshRecovery(currentCode: string, newCode: string): Promise<void>;
  logout(): Promise<void>;
  me(): Promise<{ ownerId: string; profiles: ProfileDTO[] }>;
}

export interface ProfileApi {
  listProfiles(): Promise<ProfileDTO[]>;
  createProfile(displayName: string, avatarId: string, id?: string): Promise<ProfileDTO>;
  updateProfile(profileId: string, patch: { displayName?: string; avatarId?: string }): Promise<ProfileDTO>;
  getProfileState(profileId: string): Promise<ProfileStateDTO>;
  resumeSession(profileId: string, lessonId: string): Promise<{ session: GameSessionDTO | null }>;
  saveCheckpoint(profileId: string, req: SaveCheckpointRequest): Promise<{ ok: boolean; idempotent?: boolean }>;
  completeLesson(profileId: string, req: CompleteLessonRequest): Promise<{ ok: boolean; idempotent?: boolean }>;
  importProfile(profileId: string, req: ImportRequest): Promise<{ ok: boolean; profileId: string }>;
  exportProfile(profileId: string): Promise<unknown>;
  deleteProfile(profileId: string): Promise<void>;
}

export const identityApi: IdentityApi = {
  createIdentity: (recoveryCode) => request('/api/identity', { method: 'POST', body: JSON.stringify({ recoveryCode }) }),
  recoverIdentity: (recoveryCode) => request('/api/recover', { method: 'POST', body: JSON.stringify({ recoveryCode }) }),
  refreshRecovery: (currentCode, newCode) =>
    request('/api/refresh-recovery', { method: 'POST', body: JSON.stringify({ currentCode, newCode }) }),
  logout: () => request('/api/logout', { method: 'POST' }),
  me: () => request('/api/me'),
};

export const profileApi: ProfileApi = {
  listProfiles: () => request('/api/profiles'),
  createProfile: (displayName, avatarId, id) =>
    request('/api/profiles', { method: 'POST', body: JSON.stringify({ displayName, avatarId, id }) }),
  updateProfile: (profileId, patch) =>
    request(`/api/profiles/${profileId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  getProfileState: (profileId) => request(`/api/profiles/${profileId}/state`),
  resumeSession: (profileId, lessonId) =>
    request(`/api/profiles/${profileId}/resume?lessonId=${encodeURIComponent(lessonId)}`),
  saveCheckpoint: (profileId, req) =>
    request(`/api/profiles/${profileId}/checkpoint`, { method: 'POST', body: JSON.stringify(req) }),
  completeLesson: (profileId, req) =>
    request(`/api/profiles/${profileId}/complete`, { method: 'POST', body: JSON.stringify(req) }),
  importProfile: (profileId, req) =>
    request(`/api/profiles/${profileId}/import`, { method: 'POST', body: JSON.stringify(req) }),
  exportProfile: (profileId) => request(`/api/profiles/${profileId}/export`),
  deleteProfile: (profileId) => request(`/api/profiles/${profileId}`, { method: 'DELETE' }),
};
