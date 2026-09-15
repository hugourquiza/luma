// Entorno tipado del Worker (wrangler.jsonc + @cloudflare/workers-types).
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Entorno (development por defecto en wrangler dev). */
  ENVIRONMENT?: string;
}
