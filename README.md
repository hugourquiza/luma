# Isla de las Letras

Juego web de lectoescritura para niños desde ~6 años que comienzan a leer y
escribir. Ayudás a Luma, la luciérnaga, a iluminar una isla: cada lección
completada enciende una parte del paisaje y entrega una pegatina.

Producto en español latinoamericano, neutro. Sin cuentas obligatorias, sin
anuncios, sin compras, sin ranking, sin recopilación de datos.

El progreso confirmado se guarda en **Cloudflare D1** (el jugador pone un
nombre o apodo y su avance viaja a la nube), con una **copia local en
IndexedDB** que actúa de caché y de cola de operaciones pendientes. El adulto
gestiona un **código de recuperación** para restaurar la partida en otro
dispositivo. Detalles en las secciones «Persistencia y recuperación» y
«Despliegue».

## Requisitos

- Node.js ≥ 20.11 (probado con 26.x). Se usa para construir y probar; no actúa
  como servidor de producción.
- npm ≥ 9.
- (Solo para la parte remota) cuenta de Cloudflare para crear y vincular una
  base D1.

## Instalación reproducible

```bash
npm ci          # instala exactamente lo que fija package-lock.json
```

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Vite dev server (localhost:5173) |
| `npm run dev:worker` | Vite + Worker D1 local en paralelo (ver «Desarrollo») |
| `npm run build` | Genera contenido, build de producción, valida contenido y presupuestos |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm run lint` | Alias de typecheck (sin eslint dedicado) |
| `npm test` | Tests unitarios (Vitest) |
| `npm run test:e2e` | Recorridos Playwright (requiere que `dev` o el webserver del config corran) |
| `npm run validate:content` | Validador de contenido y recursos (audios, imágenes, IDs, referencias) |
| `npm run check:budget` | Chequeo de presupuestos de build |
| `npm run preview:worker` | Construye y corre `wrangler dev` (localhost) |
| `npm run db:migrate:local` | Aplica migraciones a la D1 local |
| `npm run db:migrate:remote` | Aplica migraciones a la D1 remota |
| `npm run deploy` | Construye, migra y ejecuta `wrangler deploy` |

`build` encadena: generación de contenido (JSON), generación de iconos PNG,
`vite build`, inyección del service worker con el precache de shell, validación
de contenido y chequeo de presupuestos.

## Arquitectura

SPA servida como Workers Static Assets; el Worker script (`worker/src/index.ts`)
sirve la API `/api/*` con **Cloudflare D1** y delega el resto a los assets
(vía `env.ASSETS.fetch`). El progreso confirmado vive en D1; IndexedDB queda
como caché, cola de operaciones pendientes y modo sin conexión.

```
Navegador → Worker (worker/src/index.ts) → /api/* → D1 (fuente de verdad)
    │          └─ env.ASSETS.fetch → HTML/JS/CSS/imágenes/audio/content
    │
    ├── motor de actividades y repaso (local)
    ├── api/       cliente HTTP + repositorio remoto + cola de pendientes
    ├── IndexedDB: caché de perfiles/sesiones/progreso + cola durable
    ├── localStorage: espejo síncrono de reanudación de lección
    └── Cache Storage: shell (service worker) y regiones descargadas
```

- D1 es la **fuente de verdad** del progreso confirmado. Las escrituras se
  guardan primero en la cola local (duradera) y se reenvían al conectar.
- `/api/*` nunca cae en el fallback SPA ni en las cachés del service worker;
  respuestas privadas siempre `Cache-Control: no-store` (ver `public/_headers`).
- Las preferencias del dispositivo (volumen, reducción de movimiento, escala,
  perfil activo) quedan **locales** por decisión de diseño; no tienen razón
  para sincronizarse.

Ver `wrangler.jsonc`, `worker/src/index.ts` y `public/_headers` (CSP restrictiva,
`nosniff`, `no-referrer`, Permissions Policy sin cámara/micrófono/geolocalización).

## Estructura de directorios

```
src/
  api/        cliente HTTP, repositorio remoto, cola de sincronización
  shared/     DTOs y validaciones compartidas entre cliente y Worker
  app/        rutas, layout, inicio, mapa, sesión de lección
  activities/ seis componentes de actividad (escuchar, construir, leer, escribir, trazar, historias)
  engine/     normalización, repaso (spaced), trazado (heurística)
  storage/    IndexedDB via `idb` (transaccional, versionado)
  audio/      reproducción local (MP3 empaquetados) + estado de disponibilidad
  content/    tipos y cargador
  adult/      zona para adultos
  offline/    service worker + descarga offline
worker/
  src/        Worker TS: enrutado /api, auth, repositorio D1
migrations/   migraciones SQL versionadas de D1
public/
  content/    regiones y lecciones (JSON generado)
  audio/      MP3 + manifest de recursos
  images/     ilustraciones SVG + iconos PWA
scripts/      generadores, validador, presupuesto, inyección del SW
tests/        unitarios (Vitest) y e2e (Playwright)
```

## Contenido

- 5 regiones, 4 lecciones cada una = 20 lecciones.
- 6 actividades por lección = 120 actividades, todas generadas y validadas.
- 6 mecánicas (§5 del doc de diseño), 94 audios locales, 32 ilustraciones.
- Autoría: palabras con ortografía correcta (tildes y ñ preservadas). Las tildes
  que aparecen se acompañan de apoyo. No se evalúa el contraste b/v, s/c (seseo)
  ni y/ll (yeísmo).

## Esquema de contenido y cómo agregar lecciones

El contenido se **genera** con `scripts/build-content.ts` a partir de listas de
vocabulario y de la disposición de mecánicas por lección; escribe JSON en
`public/content/`. Para agregar una lección:

1. Añadí palabras al `VOCABULARY` (con grafías ya enseñadas o declaradas).
2. Ajustá la disposición en `buildRegion` si querés otra mezcla de mecánicas.
3. Corré `npm run build` (regenera contenido + lo valida + chequea presupuestos).

El validador falla si hay IDs duplicados, referencias rotas a audio/imagen,
respuestas vacías, soluciones imposibles o palabras fuera del alfabeto del nivel.

Cada `Activity` es una unión discriminada por `type` con sus propios recursos
(ver `src/content/types.ts`). Ejemplo mínimo:

```json
{
  "id": "bosque-l2-construir-mapa",
  "type": "build-word",
  "skillIds": ["write-mp"],
  "instructionAudioId": "instruction-build-word",
  "tiles": [{ "id": "t1", "text": "PA" }, { "id": "t2", "text": "MA" }],
  "acceptedAnswers": ["MAPA"],
  "solutionTileIds": ["t2", "t1"]
}
```

## Política de audio

- Solo MP3 locales y versionados, cargados bajo demanda, nunca `speechSynthesis`
  para actividades evaluadas (§8).
- Voces generadas offline con Microsoft Edge TTS (es-MX-DaliaNeural, español
  latinoamericano neutro). El manifest (`public/audio/manifest.json`) lista id,
  texto, licencia y estado `pending-human`.
- **Revisión humana pendiente**: cada pronunciación (sobre todo vocales aisladas
  y consonantes) necesita una escucha docente antes de uso público amplio. El
  manifest la lista como `review: "pending-human"`. El juego funciona en modo
  visual mientras tanto.

## Accesibilidad

- Diseño desde 360 px, orientación variable, zoom 200 %.
- Texto de ejercicios 28–40 px, consignas ≥ 20 px.
- Objetivos táctiles ≥ 56×56 px.
- Contraste 4,5:1; estados por color + icono/texto.
- Teclado completo, foco visible, `aria-live`.
- Respeto a `prefers-reduced-motion`.
- El trazado tiene alternativa accesible «Omitir trazado» (§5.5).

## Pruebas

- `npm test`: 22 tests unitarios (normalización, repaso, trazado, contenido).
- `npm run test:e2e`: 3 recorridos Playwright en Chromium:
  1. crear perfil → jugar → reload → progreso mantenido.
  2. completar la lección 1 completa (con trazado omitido) → pegatina.
  3. errores repetidos → asistencia → avanza sin bloquear.
- `npx tsc -p worker/tsconfig.json`: typecheck del Worker (incluye tipos D1).
- Pruebas de la API contra D1 **local**: se ejercitan en `wrangler dev` (ver
  «Desarrollo») con la base creada por `npm run db:migrate:local`.

Ver `TESTS.md` para el informe de qué se ejecutó, qué queda pendiente y qué
exigiría revisión física en dispositivos reales.

## Persistencia, recuperación y privacidad

- El jugador elige un **nombre o apodo** (1–40 caracteres, tildes y ñ incluidas)
  y un avatar. Ese nombre y el progreso se guardan en la nube (D1).
- La **zona adultos** (pulsación sostenida en «Para adultos») permite:
  - **Configurar la recuperación**: genera y muestra un **código de recuperación**.
    Guardalo en un lugar seguro (la partida no se puede recuperar sin él si se
    borran los datos del navegador).
  - **Regenerar** el código (invalida el anterior).
  - **Recuperar** desde otro dispositivo introduciendo el código.
  - **Renombrar** perfiles y **exportar/importar** el progreso (JSON ≤ 1 MB).
  - Subir perfiles locales antiguos a la nube con confirmación adulta.
- Los nombres no son únicos ni otorgan acceso: la autorización usa una
  identidad privada de dispositivo/familia (cookie HttpOnly) y el código de
  recuperación (solo su hash se guarda en D1). No hay lista pública de
  jugadores ni búsqueda por nombre.
- Sin conexión, el progreso sigue funcionando y se marca **pendiente**; se
  sincroniza al reconectar. D1 es la fuente de verdad: las operaciones son
  idempotentes (no se duplican por reintentos).
- Sin cámara, micrófono, geolocalización, ads, analytics. El proveedor de
  hosting (Cloudflare) procesa las solicitudes técnicas habituales.

## Desarrollo

Para trabajar con la parte remota (Worker + D1 local) sin desplegar:

```bash
# 1) crear la base local (primera vez) — el ID remoto se documenta abajo
npm run db:migrate:local

# 2) levantar el Worker con D1 local y assets (SPA) en un puerto
npm run build        # genera dist/ (assets)
npx wrangler dev --local --port 8799
```

Si usás Vite por separado (hot reload), la API sale en el puerto de `wrangler
dev`; el cliente la apunta al mismo origen (cookies same-origin). En producción
el Worker sirve ambos, así que no hay proxy que configurar.

## Licencias y deudas

- Voz: Microsoft Azure neural TTS (Edge TTS), uso para generación offline. La
  licencia de redistribución de los MP3 generados debe confirmarse antes del
  lanzamiento público; por el momento no los redistribuimos fuera del alcance
  de esta revisión.
- Ilustraciones: generadas localmente (SVG propios).
- Dependencias: ver licencias en `package-lock.json`.

## Despliegue

Stack: Workers Static Assets + Worker script + D1. En `wrangler.jsonc`:
`main = worker/src/index.ts`, `d1_databases[0].binding = "DB"`,
`assets.run_worker_first = ["/api/*"]` y `assets.not_found_handling =
single-page-application`. El `database_id` se completa tras crear la base.

```bash
# 1) crear la base D1 (una vez)
npx wrangler d1 create isla-de-las-letras
#    copiá el databaseId que devuelve a database_id de wrangler.jsonc

# 2) aplicar migraciones a remoto
npm run db:migrate:remote

# 3) autenticarse y desplegar
npx wrangler login
npm run deploy
```

O con un token `CF_API_TOKEN` de permisos mínimos (no guardar credenciales en
el repo ni en el cliente).

**Nota sobre límites (consultar de nuevo antes de publicar):** la facturación de
Workers Static Assets (assets estáticos gratuitos e ilimitados, almacenamiento
sin costo extra) y los límites de Workers Free (100k req dinámicas/día, 10 ms
CPU, 128 MB, 20k archivos, 25 MiB/archivo). Esta versión usa cuotas dinámicas
solo para las solicitudes `/api/*` (progreso), mucho menores que el límite
Free.
