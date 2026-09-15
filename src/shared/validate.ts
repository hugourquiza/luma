// Validaciones compartidas entre el Worker y el cliente (contrato único).
// La misma regla debe aplicarse en frontend y backend: validar aquí es la
// única fuente de verdad sobre el "nombre/apodo".

const DISPLAY_NAME_MAX = 40;
const AVATAR_IDS = ['🦊', '🐸', '🦉', '🐼'] as const;
const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/** Recorta espacios y valida 1..40 caracteres. Acepta tildes, ñ, espacios internos. */
export function validateDisplayName(raw: string): ValidationResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, error: 'El nombre no puede estar vacío' };
  if (trimmed.length > DISPLAY_NAME_MAX) return { ok: false, error: `El nombre no puede superar los ${DISPLAY_NAME_MAX} caracteres` };
  // Solo letras, números y espacios internos (apodos compuestos); sin saltos.
  if (!/^[\p{L}\p{N} _\.\-']+$/u.test(trimmed)) {
    return { ok: false, error: 'Usá solo letras y números para el nombre' };
  }
  if (/[\r\n]/.test(trimmed)) return { ok: false, error: 'El nombre no puede contener saltos de línea' };
  return { ok: true };
}

export function validateAvatarId(avatar: string): boolean {
  return (AVATAR_IDS as readonly string[]).includes(avatar);
}

export function validateId(id: string): boolean {
  return typeof id === 'string' && ID_RE.test(id);
}

export function isValidUuid(id: string): boolean {
  return typeof id === 'string' && UUID_RE.test(id);
}

export function validateAttemptOutcome(o: unknown): o is 'independent' | 'assisted' | 'error' {
  return o === 'independent' || o === 'assisted' || o === 'error';
}

export function normalizeDisplayName(raw: string): string {
  return raw.trim();
}

export { DISPLAY_NAME_MAX, AVATAR_IDS };
