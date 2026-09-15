# AGENTS.md — Isla de las Letras

Fuente de verdad para otros agentes que trabajen en este repo. Leé esto antes
de tocar código y actualizá este archivo al cambiar arquitectura o flujos.

## Qué es

Juego web de lectoescritura infantil (React 18 + TypeScript + Vite, SPA con
PWA). "Isla de las Letras": cada lección completada enciende un rincón del mapa
y da una pegatina. Producto en español latinoamericano neutro, sin cuentas
obligatorias, sin publicidad, sin ranking.

**Stack backend**: Worker de Cloudflare Workers (TypeScript) que sirve la API
`/api/*` sobre una base **D1**, con Workers Static Assets para la SPA.

## Comandos

```bash
npm ci                     # instalar
npm run typecheck          # tsc frontend (src/)
npx tsc -p worker/tsconfig.json   # tsc del Worker (incluye tipos D1)
npm test                   # unitarios (Vitest, jsdom, fake-indexeddb)
npm run test:e2e           # Playwright (levanta su propio Vite en :5199)
npm run build              # contenido + icons + vite + SW + validación + presupuestos
npm run prepush            # lint frontend + lint worker + tests + build (lo corre el hook pre-push)
npm run db:migrate:local   # aplicar migraciones D1 local
npx wrangler dev --local --port 8799   # Worker + D1 local + SPA
```

- **`npm run build` puede fallar** por un bug histórico de normalización: los
  archivos de audio están en NFD en disco pero el JSON de contenido en NFC.
  El validador (`scripts/validate-content.mjs`) ya normaliza ambos lados a NFC;
  no "arregles" los nombres de archivo con `mv` ni toques los binarios.
- `npm run lint` es alias de `tsc --noEmit` (no hay eslint dedicado).

## Arquitectura de persistencia (D1 = fuente de verdad)

El progreso confirmado vive en **D1**; IndexedDB es caché local + cola de
operaciones pendientes (store `isla-sync`), y `localStorage` guarda un *espejo
síncrono* de reanudación de lección (`isla-resume:<profileId>:<lessonId>`).

```
Navegador → Worker (worker/src/index.ts) → /api/* → D1
    │         └─ env.ASSETS.fetch → assets SPA (HTML/JS/CSS/audio/content)
    ├── api/       cliente HTTP + repositorio remoto + cola de sincronización
    ├── storage/   IndexedDB (caché) + identidad local
    ├── shared/    DTOs y validaciones compartidos entre cliente y Worker
    └── worker/    Worker TS (enrutado /api, auth, repositorio D1)
```

- **`src/shared/` es el contrato**: tipos de DTO y validaciones (`validate.ts`,
  `schema.ts`) se importan del Worker con ruta `../../src/shared/...`. Cambiá
  ahí primero cuando toques un DTO.
- **Nunca dupliques un perfil**: el id del perfil lo crea la app (`App.tsx →
  handleNewProfile`) con el `Profile` ya formado; `createProfileLocal(profile)`
  recibe ESE objeto y reutiliza su `id`. Si generás un id nuevo dentro del
  repositorio, rompés la correspondencia caché↔D1 y el select activo no
  coincide (da reanudaciones falsas / perfiles duplicados).
- **Auth**: cookie HttpOnly (`isla_session` / `isla_owner`), `Secure` en
  producción, `development` en local (via `vars.ENVIRONMENT` en wrangler.jsonc).
  El **código de recuperación** se guarda solo como hash SHA-256 en D1; el
  código completo viaja en el body y en `localStorage` del dispositivo.
- **Idempotencia**: cada mutación lleva `opId`; el servidor lo registra en la
  tabla `mutations` y un reintento del mismo opId no duplica intentos,
  contadores ni pegatinas. No cambies el formato de `opId` (`chk:…` / `cmp:…`).
- **Checkpoint al reanudar**: guarda `currentIndex = idx + 1` (la última
  respuesta ya registrada no se vuelve a mostrar). El espejo localStorage es la
  fuente local de verdad tras un reload inmediato (IndexedDB escribe async).
- **Cierre de lección**: atómico e idempotente (`completeLesson` en el Worker):
  marca sesión completada + skillProgress + lessonProgress + sticker en un solo
  batch por opId. El frontend encola durable primero y reenvía en segundo plano.
- **`/api/*` NUNCA** cae en el fallback SPA: el service worker (`public/sw.js`)
  la excluye y `public/_headers` fuerza `no-store`. Una ruta /api inexistente
  debe responder JSON 404, no `index.html`.

## Errores comunes que ya vimos (no repetirlos)

1. **Worker typecheck aparte**: `worker/tsconfig.json` incluye
   `../worker-configuration.d.ts` (generado por `npx wrangler types`). Si
   cambiás bindings o `vars` en wrangler.jsonc, regenerá esos tipos o el tsc
   del Worker usa tipos viejos. `worker-configuration.d.ts` está en git.
2. **`run_worker_first` array**: wrangler moderno (≥ ~4.30) acepta
   `"run_worker_first": ["/api/*"]`; wrangler 4.10 solo aceptaba boolean. La
   config `package.json` fija wrangler ≥4.131; si se cambia, validá con
   `npx wrangler types`.
3. **Cookies `Secure` en local**: sin `vars.ENVIRONMENT=development`, wrangler
   emitía cookies `Secure` que curl/browser HTTP no reenvía → 401 en todos los
   `/api/*`. No borres esa var.
4. **`validateAttempt` acepta id opaco**: los ids de intento del frontend son
   `<sessionId>-<activityId>-<seq>`; NO son UUID. No vuelvas a exigir UUID ahí
   (validá con `validateId`). Es lo que permite idempotencia parcial por sesión.
5. **`createOwner` idempotente**: no vuelvas a `INSERT` directo del owner; usa
   la rama que devuelve el owner existente si el `recovery_hash` ya existe.
6. **e2e y `getByRole('button',{name:/Comenzar/i})`**: el botón de lección
   desbloqueada tiene `aria-label="Comenzar {región}, lección {n}"`. No cambies
   ese texto a "Jugar" ni el aria-label a "disponible": rompe los recorridos.
7. **Timing del e2e**: el avance de lección demora 1400 ms (observación del
   niño). Los waits de dot usan timeouts ≥2500 ms. No los bajes.

## Git y publicación

- **NO commitear ni pushear** salvo pedido explícito del usuario. El control de
  publicación lo maneja él; el trabajo queda en el working tree.
- Hay un hook **`.git/hooks/pre-push`** (local, no versionado) que corre
  `npm run prepush` (lint frontend + lint worker + tests + build) antes de
  empujar; se salta con `git push --no-verify`. Si lo recreás tras un clone,
  copialo del historial o reescribilo.
- `test-results/` y `dist/` están en `.gitignore`.

## Contenido (no confundir con persistencia)

- 5 regiones × 4 lecciones = 20 lecciones; 6 actividades por lección = 120.
  El contenido se GENERA con `scripts/build-content.ts` a JSON en
  `public/content/`. Para agregar una lección: sumá palabras a `VOCABULARY` y
  ajustá `buildRegion`, luego `npm run build`.
- `scripts/validate-content.mjs` valida estructura/IDs/referencias (NFC para
  audio). `scripts/check-budget.mjs` corta el build si se superan presupuestos
  (JS inicial <250 KB comprimido, app <3 MB, audio por región <15 MB).

## Audio

- Solo MP3 locales empaquetados; nunca `speechSynthesis` para actividades
  evaluadas. Voces generadas offline (Edge TTS es-MX-DaliaNeural). El manifest
  `public/audio/manifest.json` marca `review: "pending-human"` — hay revisión
  docente pendiente antes del uso público amplio.

## Pruebas

- Unitarias: normalización, repaso, trazado, contenido (22 en total).
- E2E (Playwright, Chromium headless, viewport móvil 390×844):
  1. crear perfil → jugar → reload → progreso mantenido (reanudación).
  2. completar la lección 1 completa (con «Omitir trazado») → pegatina.
  3. errores repetidos → asistencia → avanza sin bloquear.
- La API contra D1 **local** se prueba con `npx wrangler dev --local`: crear
  identidad, crear perfiles, checkpoint idempotente, cierre idempotente,
  recuperación en navegador limpio, y que un perfil ajeno devuelva 401/404.
