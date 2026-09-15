// Cryptographic helpers (Workers runtime). Códigos de recuperación y tokens
// de sesión se guardan SIEMPRE como hash; nunca en claro en D1.

const enc = new TextEncoder();

/** Genera un token/código aleatorio de alta entropía (bytes → base64url). */
export function randomToken(byteLen = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(byteLen));
  return base64Url(buf);
}

export function base64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** SHA-256 en hex. Suficiente para secretos de alta entropía (no requieren slow-hash). */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** UUID v4 opaco para owners, perfiles y sesiones de juego. */
export function uuid(): string {
  return crypto.randomUUID();
}
