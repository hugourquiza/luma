// Acceso a los datos de un perfil en D1, con verificación de pertenencia al
// propietario autenticado en TODAS las lecturas y mutaciones. Conocer un UUID
// o un nombre NO concede acceso: el ownerId del propietario es el gate.
import type { Env } from './env';
import type {
  ProfileDTO,
  GameSessionDTO,
  AttemptDTO,
  SkillProgressDTO,
  LessonProgressDTO,
  CollectionItemDTO,
  ProfileStateDTO,
} from '../../src/shared/schema';

// ---------- Fila → DTO (mappers) ----------

function parseJsonArray(s: string): unknown {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return undefined;
  }
}

interface ProfileRow {
  id: string;
  owner_id: string;
  display_name: string;
  avatar_id: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}
export function profileToDTO(r: ProfileRow): ProfileDTO {
  return {
    id: r.id,
    ownerId: r.owner_id,
    displayName: r.display_name,
    avatarId: r.avatar_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

interface SessionRow {
  id: string;
  profile_id: string;
  region_id: string;
  lesson_id: string;
  activity_order: string;
  current_index: number;
  status: 'active' | 'completed';
  started_at: number;
  updated_at: number;
  checkpoint: string | null;
}
export function sessionToDTO(r: SessionRow): GameSessionDTO {
  const checkpoint = r.checkpoint ? (parseJsonArray(r.checkpoint) as AttemptDTO[] | undefined) : undefined;
  return {
    id: r.id,
    profileId: r.profile_id,
    regionId: r.region_id,
    lessonId: r.lesson_id,
    activityOrder: (parseJsonArray(r.activity_order) as string[]) ?? [],
    currentIndex: r.current_index,
    status: r.status,
    startedAt: r.started_at,
    updatedAt: r.updated_at,
    checkpointAttempts: checkpoint ?? [],
  };
}

interface AttemptRow {
  id: string;
  session_id: string;
  profile_id: string;
  activity_id: string;
  outcome: 'independent' | 'assisted' | 'error';
  retries: number;
  assists: number;
  timestamp: number;
}
export function attemptToDTO(r: AttemptRow): AttemptDTO {
  return {
    id: r.id,
    sessionId: r.session_id,
    activityId: r.activity_id,
    outcome: r.outcome,
    retries: r.retries,
    assists: r.assists,
    timestamp: r.timestamp,
  };
}

interface SkillRow {
  profile_id: string;
  skill_id: string;
  independent: number;
  assisted: number;
  errors: number;
  last5: string;
  sessions_in: string;
}
export function skillToDTO(r: SkillRow): SkillProgressDTO {
  return {
    skillId: r.skill_id,
    independent: r.independent,
    assisted: r.assisted,
    errors: r.errors,
    last5: [...((parseJsonArray(r.last5) as boolean[]) ?? [])],
    sessionsIn: [...((parseJsonArray(r.sessions_in) as string[]) ?? [])],
  };
}

interface LessonRow {
  profile_id: string;
  lesson_id: string;
  completed: number;
  last_completed_at: number | null;
  independent_count: number;
}
export function lessonToDTO(r: LessonRow): LessonProgressDTO {
  return {
    lessonId: r.lesson_id,
    completed: !!r.completed,
    lastCompletedAt: r.last_completed_at ?? undefined,
    independentCount: r.independent_count,
  };
}

interface CollectionRow {
  profile_id: string;
  sticker_id: string;
  earned_at: number;
}
export function collectionToDTO(r: CollectionRow): CollectionItemDTO {
  return { stickerId: r.sticker_id, earnedAt: r.earned_at };
}

// ---------- Lecturas ----------

export async function getOwnedProfile(env: Env, ownerId: string, profileId: string): Promise<ProfileRow | null> {
  const row = await env.DB.prepare(
    'SELECT * FROM profiles WHERE id = ? AND owner_id = ? AND deleted_at IS NULL',
  ).bind(profileId, ownerId).first<ProfileRow>();
  return (row as ProfileRow | null) ?? null;
}

export async function getProfileRevision(env: Env, profileId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT revision FROM profile_resources WHERE profile_id = ?').bind(profileId).first<{ revision: number }>();
  return (row?.revision ?? 0) as number;
}

export async function listProfiles(env: Env, ownerId: string): Promise<ProfileDTO[]> {
  const rows = await env.DB.prepare(
    'SELECT * FROM profiles WHERE owner_id = ? AND deleted_at IS NULL ORDER BY display_name COLLATE NOCASE, created_at ASC',
  ).bind(ownerId).all<ProfileRow>();
  return (rows.results ?? []).map(profileToDTO);
}

/** Estado completo de un perfil: sesiones, intentos, habilidades, lecciones, colección. */
export async function readProfileState(env: Env, ownerId: string, profileId: string): Promise<ProfileStateDTO | null> {
  const profile = await getOwnedProfile(env, ownerId, profileId);
  if (!profile) return null;

  const [sessions, attempts, skills, lessons, collection] = await Promise.all([
    env.DB.prepare('SELECT * FROM game_sessions WHERE profile_id = ? ORDER BY updated_at DESC').bind(profileId).all<SessionRow>(),
    env.DB.prepare('SELECT * FROM attempts WHERE profile_id = ? ORDER BY timestamp ASC').bind(profileId).all<AttemptRow>(),
    env.DB.prepare('SELECT * FROM skill_progress WHERE profile_id = ?').bind(profileId).all<SkillRow>(),
    env.DB.prepare('SELECT * FROM lesson_progress WHERE profile_id = ?').bind(profileId).all<LessonRow>(),
    env.DB.prepare('SELECT * FROM collection WHERE profile_id = ? ORDER BY earned_at ASC').bind(profileId).all<CollectionRow>(),
  ]);

  return {
    profile: profileToDTO(profile),
    sessions: (sessions.results ?? []).map(sessionToDTO),
    attempts: (attempts.results ?? []).map(attemptToDTO),
    skillProgress: (skills.results ?? []).map(skillToDTO),
    lessonProgress: (lessons.results ?? []).map(lessonToDTO),
    collection: (collection.results ?? []).map(collectionToDTO),
    revision: await getProfileRevision(env, profileId),
  };
}

/** Sesión de juego recuperable (activa) de un perfil y lección, con selección determinista. */
export async function findResumableSession(
  env: Env,
  profileId: string,
  lessonId: string,
): Promise<SessionRow | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM game_sessions
     WHERE profile_id = ? AND lesson_id = ? AND status = 'active'
     ORDER BY updated_at DESC, started_at DESC LIMIT 1`,
  ).bind(profileId, lessonId).first<SessionRow>();
  return (row as SessionRow | null) ?? null;
}

export async function readSessionById(env: Env, profileId: string, sessionId: string): Promise<SessionRow | null> {
  const row = await env.DB.prepare(
    'SELECT * FROM game_sessions WHERE id = ? AND profile_id = ?',
  ).bind(sessionId, profileId).first<SessionRow>();
  return (row as SessionRow | null) ?? null;
}
