-- 0001_init.sql
-- Esquema inicial de persistencia en Cloudflare D1 para Isla de las Letras.
-- D1 es la fuente de verdad del progreso confirmado; IndexedDB queda como
-- caché y cola de operaciones pendientes.

-- ---------- Identidad (propietario de perfiles) ----------
-- El propietario es un identificador opaco; no es un nombre ni un correo.
CREATE TABLE IF NOT EXISTS owners (
  id            TEXT PRIMARY KEY,                -- UUID opaco
  recovery_hash TEXT UNIQUE NOT NULL,            -- hash (HMAC) del código de recuperación, nunca el código
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- Sesiones de autenticación: token opaco emitido por cookie HttpOnly.
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash  TEXT PRIMARY KEY,                  -- hash del token de sesión
  owner_id    TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_owner ON auth_sessions(owner_id);

-- ---------- Perfiles ----------
CREATE TABLE IF NOT EXISTS profiles (
  id           TEXT PRIMARY KEY,                 -- UUID estable (no cambiar al renombrar)
  owner_id     TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,                    -- 1..40 chars, ya validado
  avatar_id    TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  -- Tombstone: borrado lógico para que una operación atrasada de otro
  -- dispositivo no resucite un perfil borrado.
  deleted_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_profiles_owner ON profiles(owner_id);

-- Contador de revisión por perfil para detección de conflictos (escrituras
-- condicionales atómicas en vez de "último timestamp del cliente").
CREATE TABLE IF NOT EXISTS profile_resources (
  profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  revision  INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

-- ---------- Sesiones de juego ----------
-- "Sesiones de autenticación" y "sesiones de juego" son conceptos distintos:
-- esta tabla guarda una corrida de una lección.
CREATE TABLE IF NOT EXISTS game_sessions (
  id             TEXT PRIMARY KEY,               -- UUID estable, se conserva al reanudar
  profile_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  region_id      TEXT NOT NULL,
  lesson_id      TEXT NOT NULL,
  activity_order TEXT NOT NULL,                  -- JSON array de activity ids
  current_index  INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'active', -- 'active' | 'completed'
  started_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  -- Checkpoint de la última respuesta registrada (JSON de attemptDTO).
  checkpoint     TEXT
);
CREATE INDEX IF NOT EXISTS idx_game_sessions_profile_lesson
  ON game_sessions(profile_id, lesson_id);

-- ---------- Resultados e intentos ----------
CREATE TABLE IF NOT EXISTS attempts (
  id          TEXT PRIMARY KEY,                 -- UUID estable
  session_id  TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL,
  outcome     TEXT NOT NULL,                     -- 'independent' | 'assisted' | 'error'
  retries     INTEGER NOT NULL DEFAULT 0,
  assists     INTEGER NOT NULL DEFAULT 0,
  timestamp   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_session ON attempts(session_id);
CREATE INDEX IF NOT EXISTS idx_attempts_profile  ON attempts(profile_id);

-- ---------- Progreso de habilidades ----------
CREATE TABLE IF NOT EXISTS skill_progress (
  profile_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_id      TEXT NOT NULL,
  independent   INTEGER NOT NULL DEFAULT 0,
  assisted      INTEGER NOT NULL DEFAULT 0,
  errors        INTEGER NOT NULL DEFAULT 0,
  last5         TEXT NOT NULL,                   -- JSON array de boolean
  sessions_in   TEXT NOT NULL,                   -- JSON array de session ids (Set serializado)
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (profile_id, skill_id)
);

-- ---------- Progreso de lecciones ----------
CREATE TABLE IF NOT EXISTS lesson_progress (
  profile_id        TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lesson_id         TEXT NOT NULL,
  completed         INTEGER NOT NULL DEFAULT 0,
  last_completed_at INTEGER,
  independent_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_id, lesson_id)
);

-- ---------- Colección (pegatinas) ----------
CREATE TABLE IF NOT EXISTS collection (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sticker_id TEXT NOT NULL,
  earned_at  INTEGER NOT NULL,
  PRIMARY KEY (profile_id, sticker_id)
);

-- ---------- Idempotencia de mutaciones ----------
-- Un opId estable por mutación: reenviar el mismo opId (p. ej. tras un
-- timeout) no duplica intentos, premios ni contadores.
CREATE TABLE IF NOT EXISTS mutations (
  op_id       TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  applied_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mutations_profile ON mutations(profile_id);
