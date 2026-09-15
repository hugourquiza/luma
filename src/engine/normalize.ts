// Text normalization for write activities (§5.4).
// - NFC Unicode
// - trim outer spaces
// - case-insensitive compare (but PRESERVE ñ and tildes — never strip them)
// - collapse inner whitespace runs to a single space

export const ACCENTED = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u',
  Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ü: 'U',
} as const;

/** Fold to NFC, trim, collapse inner spaces (keeps ñ, keeps tildes). */
export function normalizeInput(raw: string): string {
  return raw
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Compare after normalization; case-insensitive, preserves accents. */
export function normalizedEq(a: string, b: string): boolean {
  return normalizeInput(a).toLowerCase() === normalizeInput(b).toLowerCase();
}

/** Strip the acute/diaeresis accent (used only to detect "missing tilde"). */
function stripAccents(s: string): string {
  let out = '';
  for (const ch of s.normalize('NFC')) {
    const rep = (ACCENTED as Record<string, string>)[ch];
    out += rep ?? ch;
  }
  return out;
}

export interface CompareResult {
  ok: boolean;
  /** true when only an accent/tilde difference caused the failure. */
  onlyMissingAccent?: boolean;
  /** true when case alone differed (informational). */
  caseOnlyDiff?: boolean;
}

/**
 * Normalized comparison that distinguishes "missing tilde only".
 * This is used to give the targeted "mirá dónde va la tilde" prompt (§5.4),
 * never to silently accept a wrong word.
 */
export function compareAnswer(userRaw: string, accepted: string[]): CompareResult {
  const u = normalizeInput(userRaw);
  const target = accepted.map(normalizeInput);
  const match = target.find((t) => u.toLowerCase() === t.toLowerCase());
  if (match !== undefined) return { ok: true, onlyMissingAccent: false };

  // Only-accent difference vs at least one accepted answer → targeted prompt.
  const uStripped = stripAccents(u);
  const accentedMatch = target.find((t) => stripAccents(t) === uStripped && t.toLowerCase() !== u.toLowerCase());
  if (accentedMatch !== undefined) return { ok: false, onlyMissingAccent: true };

  return { ok: false, onlyMissingAccent: false };
}
