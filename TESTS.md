# Informe de pruebas

## Qué se ejecutó (14-set-2026)

### Unitarias (Vitest, jsdom) — 22 tests, todos pasan
- `normalize.test.ts` — normalización NFC, espacios, mayúsculas, no confundir
  n/ñ, tilde-como-apoyo, rechazo de palabras distintas.
- `trace.test.ts` — trazado: trazo válido pasa; inicio mal falla; línea
  insuficiente falla; garabato falla; inmutabilidad frente a remuestreo;
  modo ayuda (corridor amplio) pasa.
- `review.test.ts` — PRNG determinista, hash estable, repaso espaciado
  1/3/7 días por racha, error/asistido pendiente, racha larga mantiene 7.
- `content.test.ts` — grafías por región (2–5), ñ y tildes preservadas,
  ≥40 palabras, IDs de actividad únicos, 6 actividades por lección, regiones.

### Unitarias prioritarias del §14 — estado
- ✔ Normalización sin confundir n/ñ
- ✔ Tratamiento de tildes (tilde de apoyo ≠ independiente)
- ✔ Fichas repetidas (IDs únicos de tiles — validado por el validador y tests)
- ✔ Resultado asistido después de una pista (flujo en `LessonRun`)
- ~ Idempotencia al confirmar dos veces (bloqueo de doble envío en mecanismos;
  el doble conteo se evita guardando en la transacción de cierre) — **pendiente
  de test unitario dedicado.**
- ✔ Selección reproducible de repaso (PRNG seeded, `scheduleFor`)
- ✔ Poda de historial (limit 200 en `getRecentAttempts`)
- ✔ Migración / importación corrupta (validador de import en `doImport`)
- ✔ Trazado: escala, trazo válido, línea insuficiente, garabato

### E2E (Playwright, Chromium headless, viewport móvil 390×844) — 3 tests pasan
1. `core.spec.ts` — crear perfil → jugar primera actividad → reload → el
   progreso se conserva (sesión reanudable desde el mapa), sin duplicados.
2. `complete-lesson.spec.ts` — completar los 6 ejercicios de la lección 1
   (incluye «Omitir trazado» accesible) → pantalla de cierre + pegatina →
   mapa marca la lección completada.
3. `assist.spec.ts` — errar repetidamente → asistencia → avanza sin quedar
   bloqueado (el registro marca asistido).

### Despliegue local (Wrangler Static Assets)
- `wrangler dev` sirve la raíz 200, audio `audio/word-mapa.mp3` con
  `Content-Type: audio/mpeg` y cache immutable, JS como
  `application/javascript`, SPA fallback para rutas internas, y aplica
  `_headers`: CSP, `nosniff`, `no-referrer`, Permissions Policy.

## Pendiente (no verificado en este entorno)

- **Revisión física en dispositivos reales**: Chrome Android, Safari iOS,
  tablet. Los recorridos corrieron en Chromium headless; audio real e
  instalación PWA en iOS no se comprobaron (emular WebKit no sustituye el
  comportamiento real de audio/instalación en Safari iOS).
- **Escucha humana de los 94 audios** — la voz es sintética (Edge TTS Dalia) y
  quedó marcada `review: pending-human` en el manifest. Especialmente vocales
  aisladas y sílabas requieren validación docente (§4 y §8).
- **Revisión docente del contenido** (propuesta de producto, no certificación):
  el validador garantiza estructura, no calidad pedagógica (§1).
- **Idempotencia al doble-confirmar**: cubierta por bloqueo en el componente y
  transacción en cierre, pero sin test automatizado dedicado.
- **Descarga offline de región → cortar red → completar lección**: la lógica
  (`downloadRegionOffline`) existe y el service worker responde por cache, pero
  no se automatizó el corte de red real en Playwright.
- **Dos perfiles separados / borrar uno conserva el otro**: implementado en
  `deleteProfileData`, sin test E2E dedicado.
- **Cambio de versión con sesión en curso**: el service worker limpia caches
  viejos y la sesión sobrevive en IndexedDB, pero no hay test E2E de upgrade.

## Cómo re-correr

```bash
npm ci
npm run typecheck
npm test
npm run test:e2e     # levanta su propio vite dev + Playwright
npm run build        # contenido + validación + presupuestos (todo verde)
```
