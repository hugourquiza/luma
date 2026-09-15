# Isla de las Letras

Juego web de lectoescritura para niños desde ~6 años que comienzan a leer y
escribir. Ayudás a Luma, la luciérnaga, a iluminar una isla: cada lección
completada enciende una parte del paisaje y entrega una pegatina.

Producto en español latinoamericano, neutro. Sin cuentas, sin anuncios, sin
compras, sin ranking, sin recopilación de datos. Progreso 100% local.

## Requisitos

- Node.js ≥ 20.11 (probado con 26.x). Se usa para construir y probar; no actúa
  como servidor de producción.
- npm ≥ 9.

## Instalación reproducible

```bash
npm ci          # instala exactamente lo que fija package-lock.json
```

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Vite dev server (localhost:5173) |
| `npm run build` | Genera contenido, build de producción, valida contenido y presupuestos |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm run lint` | Alias de typecheck (sin eslint dedicado) |
| `npm test` | Tests unitarios (Vitest) |
| `npm run test:e2e` | Recorridos Playwright (requiere que `dev` o el webserver del config corran) |
| `npm run validate:content` | Validador de contenido y recursos (audios, imágenes, IDs, referencias) |
| `npm run check:budget` | Chequeo de presupuestos de build |
| `npm run preview:worker` | Construye y corre `wrangler dev` (localhost) |
| `npm run deploy` | Construye y ejecuta `wrangler deploy` |

`build` encadena: generación de contenido (JSON), generación de iconos PNG,
`vite build`, inyección del service worker con el precache de shell, validación
de contenido y chequeo de presupuestos.

## Arquitectura

SPA servida como Workers Static Assets; no hay Worker script de producción.
Toda la selección de ejercicios, validación y persistencia corren en el
navegador.

```
Navegador → Workers Static Assets → HTML/JS/CSS/imágenes/audio/content
    ├── motor de actividades y repaso (local)
    ├── IndexedDB: perfiles, sesiones, intentos, progreso, colección
    └── Cache Storage: shell (service worker) y regiones descargadas
```

Ver `wrangler.jsonc` y `public/_headers` (CSP restrictiva, `nosniff`,
`no-referrer`, Permissions Policy sin cámara/micrófono/geolocalización).

## Estructura de directorios

```
src/
  app/        rutas, layout, inicio, mapa, sesión de lección
  activities/ seis componentes de actividad (escuchar, construir, leer, escribir, trazar, historias)
  engine/     normalización, repaso (spaced), trazado (heurística)
  storage/    IndexedDB via `idb` (transaccional, versionado)
  audio/      reproducción local (MP3 empaquetados) + estado de disponibilidad
  content/    tipos y cargador
  adult/      zona para adultos
  offline/    service worker + descarga offline
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

Ver `TESTS.md` para el informe de qué se ejecutó, qué queda pendiente y qué
exigiría revisión física en dispositivos reales.

## Recuperación y privacidad

- Zona adultos (pulsación sostenida de 3 s en «Para adultos»): export/import de
  progreso (JSON ≤ 1 MB, validado, con previsualización y confirmación).
- El progreso vive en el navegador; puede perderse al borrar datos y no se
  sincroniza entre dispositivos ni al cambiar de dominio.
- Sin cámara, micrófono, geolocalización, ads, analytics ni identificadores
  remotos desde el código. El proveedor de hosting procesa las solicitudes
  técnicas habituales.

## Licencias y deudas

- Voz: Microsoft Azure neural TTS (Edge TTS), uso para generación offline. La
  licencia de redistribución de los MP3 generados debe confirmarse antes del
  lanzamiento público; por el momento no los redistribuimos fuera del alcance
  de esta revisión.
- Ilustraciones: generadas localmente (SVG propios).
- Dependencias: verlicencias en `package-lock.json`.

## Despliegue

Workers Static Assets Free. Sin `main` (no hay Worker script), `assets.directory
= ./dist`, `not_found_handling = single-page-application`.

```bash
npm run build
npx wrangler login        # autenticación manual
npm run deploy            # wrangler deploy
```

O con un token `CF_API_TOKEN` de permisos mínimos (no guardar credenciales en el
repo ni en el cliente).

**Nota sobre límites (consultar de nuevo antes de publicar):** la facturación de
Workers Static Assets (assets estáticos gratuitos e ilimitados, almacenamiento
sin costo extra) y los límites de Workers Free (100k req dinámicas/día, 10 ms
CPU, 128 MB, 20k archivos, 25 MiB/archivo). Este juego no usa cuotas dinámicas.
No configurar `run_worker_first`.
