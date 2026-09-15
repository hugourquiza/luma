// Tipos y DTOs compartidos entre el Worker (Cloudflare D1) y el cliente.
// Regla: nada de esto depende de IndexedDB ni del DOM; solo tipos + helpers puros.
//
// `sessions` del progreso de habilidades se transporta como array (los `Set`
// no sobreviven a JSON.stringify). El campo se llama `sessionsIn` (array de
// strings con IDs de sesión de juego) para distinguirlo de la lista de
// `sessions` de juego que devuelve la API.

// ---------- Identidad ----------

export interface OwnerIdentityDTO {
  /** Identificador opaco del propietario. No es un nombre. */
  ownerId: string;
  createdAt: number;
  /** true si esta identidad fue creada en esta sesión (no recuperada). */
  isNew: boolean;
}

// ---------- Perfiles ----------

export interface ProfileDTO {
  id: string;
  ownerId: string;
  displayName: string; // 1..40 caracteres, sin espacios al inicio/fin
  avatarId: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateProfileRequest {
  displayName: string;
  avatarId: string;
  /** Opcional: id sugerido por el cliente (local), para alinear cache y D1. */
  id?: string;
}

export interface UpdateProfileRequest {
  displayName?: string;
  avatarId?: string;
}

// ---------- Sesiones de juego ----------

export type GameSessionStatus = 'active' | 'completed';

export interface GameSessionDTO {
  id: string;
  profileId: string;
  regionId: string;
  lessonId: string;
  activityOrder: string[];
  currentIndex: number;
  status: GameSessionStatus;
  startedAt: number;
  updatedAt: number;
  // checkpoint de la última respuesta registrada (puede faltar en sesiones viejas)
  checkpointAttempts: AttemptDTO[];
}

// ---------- Intentos (resultados y ayudas) ----------

export type AttemptOutcome = 'independent' | 'assisted' | 'error';

export interface AttemptDTO {
  id: string;
  sessionId: string;
  activityId: string;
  outcome: AttemptOutcome;
  retries: number;
  assists: number;
  timestamp: number;
}

// ---------- Progreso de habilidades y lecciones ----------

export interface SkillProgressDTO {
  skillId: string;
  independent: number;
  assisted: number;
  errors: number;
  last5: boolean[];
  sessionsIn: string[]; // IDs de sesión de juego en los que se practicó
}

export interface LessonProgressDTO {
  lessonId: string;
  completed: boolean;
  lastCompletedAt?: number;
  independentCount: number;
}

// ---------- Colección ----------

export interface CollectionItemDTO {
  stickerId: string;
  earnedAt: number;
}

// ---------- Perfil completo (estado remoto) ----------

export interface ProfileStateDTO {
  profile: ProfileDTO;
  sessions: GameSessionDTO[];
  attempts: AttemptDTO[];
  skillProgress: SkillProgressDTO[];
  lessonProgress: LessonProgressDTO[];
  collection: CollectionItemDTO[];
  /** Nub de revisión del estado remoto; usada para detectar conflictos. */
  revision: number;
}

// ---------- Checkpoint y cierre de lección ----------

export interface SaveCheckpointRequest {
  sessionId: string;
  regionId: string;
  lessonId: string;
  activityOrder: string[];
  currentIndex: number;
  attempts: AttemptDTO[];
  /** Idempotencia: el mismo payload reenviado no debe duplicar datos. */
  opId: string;
}

export interface CompleteLessonRequest extends SaveCheckpointRequest {
  /** Resultado consolidado de la lección completa. */
  results: AttemptDTO[];
  skillProgress: SkillProgressDTO[];
  lessonProgress: LessonProgressDTO;
  sticker: { stickerId: string } | null;
}

// ---------- Importación / exportación ----------

export interface ImportRequest {
  profile: ProfileDTO;
  sessions: GameSessionDTO[];
  attempts: AttemptDTO[];
  skillProgress: SkillProgressDTO[];
  lessonProgress: LessonProgressDTO[];
  collection: CollectionItemDTO[];
}

// ---------- Respuestas de error unificadas ----------

export interface ApiErrorBody {
  error: string;
  code: string;
  message?: string;
}

// ---------- Recuperación / identidad ----------

export interface CreateIdentityRequest {
  recoveryCode: string; // código de alta entropía que se guardará como hash
}

export interface RecoverSessionRequest {
  recoveryCode: string;
}

export interface RefreshRecoveryRequest {
  currentCode: string;
  newCode: string;
}
