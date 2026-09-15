# Audio — estado y revisión humana pendiente

## Estado actual

Se generaron **94 MP3 locales** con síntesis de voz (Microsoft Edge TTS,
voz `es-MX-DaliaNeural`, español latinoamericano neutro) mediante
`scripts/generate-audio.ts`. Los archivos son reales, validados (no hay vacíos)
y con encabezado MP3 correcto. Ver `public/audio/manifest.json`.

El §8 del diseño exige revisión humana de pronunciación, en especial letras y
sílabas aisladas: **«un archivo que dice “eme” no sustituye /m/»**. La síntesis
no garantiza el fonema correcto para una consonante fuera de contexto silábico.

## Pendiente (antes del lanzamiento a público amplio)

1. **Escucha humana obligatoria** de todos los archivos, priorizando:
   - `word-*.mp3` de consonantes/sílabas aisladas (m, p, l, s, t, n, d, f, b, v,
     ñ, ch, c, qu, r, rr).
   - vocales aisladas en la Playa de las vocales (`word-ala`, `word-ele`, ...).
2. Marcar en `public/audio/manifest.json` cada idioma como `review: reviewed`
   una vez escuchado y aprobado por una persona.
3. Para consignas y apoyo se usa el mismo TTS; también requieren escucha para
   coherencia de voz y ritmo.

Hasta tanto, el juego **no declara terminada la versión infantil** para uso
público: funciona en modo visual para desarrollo y práctica acompañada, y los
audios se reproducen localmente sin depender de red.

## Regeneración

```bash
npm run gen:audio      # regenera los MP3 (omite los ya presentes)
npm run gen:manifest   # reconstruye el manifest desde el contenido real
```
