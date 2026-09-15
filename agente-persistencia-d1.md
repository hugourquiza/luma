# Tarea para el agente: nombres y partidas persistentes en Cloudflare D1

## Objetivo

Implementá en **Isla de las Letras** la posibilidad de poner el nombre o apodo del jugador y guardar su partida en **Cloudflare D1**. La aplicación deja de ser `local only`: el progreso confirmado debe poder recuperarse desde el servidor, incluso desde otro navegador mediante una credencial de recuperación.

Este documento es una especificación para implementar. Revisá primero el código y las instrucciones del repositorio; completá frontend, backend, migraciones, pruebas y documentación. Conservá la experiencia infantil, los contenidos y las reglas de progreso existentes.

## Estado actual verificado

- Stack: React 18, TypeScript, Vite, `idb`, Vitest, Playwright y Wrangler.
- `wrangler.jsonc` sirve `dist` como SPA con Workers Static Assets. No tiene entrypoint de Worker ni binding D1.
- `src/storage/db.ts` guarda perfiles, ajustes, sesiones, intentos, habilidades, lecciones y colección en IndexedDB (`isla-de-las-letras`, versión 1).
- `Profile` ya tiene `displayName?: string`; `src/app/ProfileSelect.tsx` solamente permite elegir avatar y confirmar un texto de perfil local.
- `src/app/App.tsx` inicializa IndexedDB y administra el perfil activo. El flujo de creación puede navegar aunque falle el guardado: corregilo al integrar la API.
- `src/app/LessonRun.tsx` guarda el índice y orden de actividades, pero al reanudar genera otro `sessionId`; los resultados parciales quedan en memoria y las llamadas actuales a `saveSessionProgress` pasan una lista vacía de intentos.
- El cierre de la lección hace varias escrituras separadas de progreso y premios. Necesita atomicidad e idempotencia para soportar reintentos de red.
- `src/app/Map.tsx` calcula el avance y desbloqueos a partir de `getLessonProgress`.
- `src/adult/AdultZone.tsx`, `src/i18n/messages.ts` y `README.md` contienen mensajes que prometen almacenamiento exclusivamente local.
- `public/sw.js` tiene fallback de navegación a la SPA. La API debe quedar fuera de ese fallback y de las cachés.

## Decisiones de alcance

1. **D1 es la fuente de verdad del progreso confirmado.** IndexedDB puede seguir como caché y guardar operaciones pendientes; nunca debe ser la única copia presentada como guardada en la nube.
2. **Nombre y avatar identifican visualmente al jugador.** Los nombres no son únicos y no sirven para autorizar acceso.
3. **Sin registro obligatorio con email para esta primera versión.** Como solución inicial, usá una identidad privada de familia/dispositivo con sesión segura y un código de recuperación de alta entropía, administrado desde la zona de adultos. Permite recuperar los perfiles en otro navegador. Si ya existe una solución de identidad al implementar, reutilizala.
4. **Conservar las descargas de contenidos para jugar sin conexión.** El progreso sin conexión debe figurar como pendiente y sincronizarse después. La creación o recuperación de una identidad remota requiere conexión.
5. No agregar rankings, perfiles públicos, chat, pagos ni analítica.

## 1. Nombre del jugador y experiencia de guardado

- Agregá un campo etiquetado «Nombre o apodo» al crear un perfil; reutilizá `displayName`.
- Para perfiles nuevos, exigí entre 1 y 40 caracteres después de quitar espacios al comienzo y al final. Admití tildes, ñ y nombres compuestos. Aplicá la misma validación en frontend y backend.
- Mostrá nombre y avatar en el selector y el nombre del perfil activo en el mapa. Actualizá nombres accesibles de los controles.
- Permití editar el nombre desde la zona de adultos, conservando el identificador y el progreso.
- Los perfiles antiguos sin nombre deben seguir funcionando con una etiqueta temporal y una opción para completarlo.
- Durante creación y guardado, prevení envíos repetidos y mostrá errores recuperables. No navegues como si la creación remota hubiera funcionado cuando falla.
- Mostrá estados comprensibles: «Guardando…», «Guardado», «Sin conexión: pendiente de guardar» y «No pudimos guardar. Reintentar».
- Reemplazá la confirmación actual de perfil local por una explicación breve de que el nombre/apodo y el progreso se guardan en internet. Conservá una confirmación adulta antes de subir perfiles locales existentes.

## 2. Worker, D1 y desarrollo local

- Agregá un Worker TypeScript para `/api/*` y un binding D1 `DB` en `wrangler.jsonc`.
- Conservá Workers Static Assets y el fallback SPA para las rutas de la aplicación. Configurá `assets.run_worker_first` para `/api/*`; una ruta de API inexistente debe responder JSON con 404, nunca `index.html`.
- Usá el binding D1 del Worker; el navegador solamente consume la API del mismo origen. No incluyas tokens de Cloudflare ni credenciales D1 en variables `VITE_*` o bundles.
- Agregá migraciones SQL versionadas en `migrations/`, tipos del entorno y scripts para aplicar migraciones localmente y en remoto.
- Dejá un flujo reproducible para desarrollo con Worker y D1 local. Si mantenés Vite por separado, configurá su proxy `/api` y documentá cómo ejecutar ambos procesos.
- Separá base local/pruebas de producción. No inventes un `database_id`: documentá el paso de creación y dónde colocar el valor real.
- Revisá `public/_headers` y excluí explícitamente `/api/*` del service worker, cachés y fallback HTML. Las respuestas privadas deben llevar `Cache-Control: no-store`.

Cloudflare documenta el enrutamiento selectivo y la configuración de assets en [Configuration and Bindings](https://developers.cloudflare.com/workers/static-assets/binding/), y el acceso desde el Worker en [D1 Workers Binding API](https://developers.cloudflare.com/d1/worker-api/). Verificá la sintaxis vigente al implementar.

## 3. Identidad y autorización

- Creá un identificador opaco de propietario y asociá sus perfiles a él. Conservá múltiples perfiles por propietario.
- Emití una sesión mediante cookie `HttpOnly`, `Secure` en producción y `SameSite`; validá el origen de las operaciones que modifican datos.
- Generá la credencial de recuperación con aleatoriedad criptográfica, guardá solamente su hash y enviála mediante un cuerpo de petición, nunca en URLs o logs. Permití regenerarla desde la zona de adultos e invalidar la anterior.
- Aplicá límites de intentos a recuperación y límites de tamaño/frecuencia a escrituras.
- En **todas** las consultas y mutaciones, verificá que el perfil pertenece al propietario autenticado. Conocer un UUID o un nombre no concede acceso.
- No expongas una lista global de jugadores ni búsqueda pública por nombre. La barrera visual de la zona de adultos no reemplaza la autorización del servidor.
- Explicá en la zona de adultos cómo conservar el código para recuperar la partida si se borran los datos del navegador. No prometas recuperación sin credencial.

## 4. Estado de partida y consistencia

Persistí como mínimo:

| Entidad | Datos |
| --- | --- |
| Perfil | ID, propietario, nombre/apodo, avatar, fechas |
| Sesión de juego | ID estable, perfil, región, lección, orden de actividades, índice, estado activa/completada, fechas y revisión |
| Resultados e intentos | IDs estables, sesión, actividad, resultado, errores/reintentos, ayudas y fecha |
| Progreso de habilidades | Contadores, últimos cinco resultados y sesiones practicadas |
| Progreso de lecciones | Completada, fecha y cantidad de respuestas independientes |
| Colección | Stickers ganados y fecha, sin duplicados por perfil |

- Usá claves foráneas, índices por propietario/perfil/sesión y restricciones únicas apropiadas. Separá sesiones de autenticación de sesiones de juego.
- Definí DTOs JSON versionados. `SkillProgress.sessions` es un `Set<string>`: convertí explícitamente a array para transporte y exportación, o normalizalo en una tabla; no lo pierdas con `JSON.stringify`.
- Mantené preferencias del dispositivo (volumen, movimiento reducido, escala y perfil activo) localmente salvo una razón concreta para sincronizarlas; documentá esa decisión.
- Guardá un checkpoint al iniciar y después de cada respuesta registrada. Debe incluir lo necesario para restaurar resultados parciales, ayudas y el siguiente paso sin contar nuevamente una respuesta ya aceptada.
- Al reanudar, conservá `sessionId`, `startedAt`, orden y resultados. Renderizá las actividades usando el orden persistido, validando sus IDs contra el contenido disponible.
- Alcance mínimo de reanudación: última respuesta registrada y actividad pendiente. No es obligatorio persistir cada trazo o pulsación dentro de una respuesta todavía sin enviar.
- Buscá sesiones por perfil **y lección**, con selección determinista; no uses el primer resultado global de sesiones incompletas.
- El cierre debe persistir sesión completada, progreso, habilidades y sticker de forma atómica usando operaciones soportadas por D1. No traslades transacciones de otro motor sin verificar compatibilidad.
- Usá un ID de operación estable para cada mutación. Un reintento tras timeout o respuesta perdida debe devolver el resultado ya aplicado sin duplicar intentos, premios o contadores.
- Implementá revisión/versionado para evitar que otra pestaña o dispositivo sobrescriba progreso nuevo con un snapshot viejo. La verificación y escritura deben ser atómicas, no un SELECT seguido de un UPDATE incondicional.
- Ante conflicto, devolvé un estado explícito (por ejemplo, 409), recargá el estado remoto y conservá los pendientes hasta resolverlos. No uses silenciosamente «gana el último timestamp del cliente».
- Guardá las operaciones pendientes de forma durable antes de enviarlas. Reintentá con espera creciente al recuperar conexión o abrir la app. No dependas de `beforeunload` para guardar.
- Si IndexedDB no está disponible, permití guardar online; indicá que no hay respaldo offline para pendientes. Un fallo local no debe desactivar toda persistencia remota.

## 5. API y capa de almacenamiento

Definí y documentá contratos para:

- Crear/restaurar identidad, consultar sesión y cerrar sesión.
- Listar, crear y editar perfiles propios.
- Leer el estado completo de un perfil y retomar una sesión de juego.
- Guardar checkpoints y finalizar una lección con revisión e idempotencia.
- Importar un perfil local, exportar datos y borrar un perfil propio.

Usá respuestas JSON y errores consistentes, SQL parametrizado y validación de IDs, enums, longitudes, contadores, orden e índices. La API debe verificar relaciones entre perfil, sesión, lección y actividades; no confiar solamente en IDs recibidos.

Extraé tipos compartidos y separá el cliente HTTP, el repositorio remoto y la caché/migración local. Evitá dispersar `fetch` por todos los componentes. Conservá las firmas actuales cuando sea razonable, ampliándolas donde el guardado atómico lo requiera.

## 6. Migración y gestión de datos

- Detectá los perfiles IndexedDB existentes y ofrecé subirlos al nuevo almacenamiento con confirmación adulta y el texto actualizado.
- Importá perfil, sesiones recuperables, intentos disponibles, habilidades, lecciones y stickers. Conservá IDs cuando sea seguro y contemplá colisiones sin modificar perfiles de otros propietarios.
- Hacé la importación idempotente y marcá la migración local como completa solamente tras confirmación del servidor. No borres el original durante la migración.
- No fabriques resultados históricos que el código anterior nunca guardó. Conservá lo recuperable y documentá esa limitación.
- La exportación debe incluir estado remoto completo, sesiones y versión del formato; distinguí pendientes locales si los hay.
- El borrado debe eliminar los datos del perfil en D1 y limpiar caché y operaciones pendientes locales. Una operación atrasada de otro dispositivo no debe recrear un perfil borrado: rechazá mutaciones de perfiles inexistentes y contemplá tombstones si la estrategia elegida los necesita.
- Actualizá README, textos de privacidad y zona de adultos para describir los datos enviados, recuperación y eliminación. Quitá afirmaciones como «100% local», «no se comparte por internet» y «este juego no usa cuotas dinámicas» cuando ya no correspondan.

## 7. Verificación y criterios de aceptación

Agregá pruebas significativas de API con D1 local y adaptá las pruebas de UI. Los mocks de HTTP por sí solos no verifican la persistencia remota.

- [ ] Crear un perfil con nombre y avatar lo guarda en D1 y aparece tras recargar.
- [ ] Dos perfiles pueden tener el mismo nombre sin compartir progreso.
- [ ] Recuperar la identidad en un contexto de navegador limpio restaura los perfiles y la partida desde D1.
- [ ] Renombrar no cambia IDs ni pierde progreso.
- [ ] Responder parte de una lección, recargar y continuar conserva sesión, orden, resultados y ayudas.
- [ ] Completar una lección actualiza mapa, habilidades y colección juntos; repetir la misma operación no suma dos veces.
- [ ] Simular respuesta perdida después del commit y reintentar no duplica datos.
- [ ] Dos pestañas con revisiones diferentes no sobrescriben silenciosamente el progreso.
- [ ] Una caída de red deja pendientes visibles; cerrar/reabrir y reconectar los sincroniza sin pérdidas ni duplicados.
- [ ] Migrar dos veces los mismos datos locales produce un único resultado y conserva el original ante errores.
- [ ] Una identidad no puede leer, editar, exportar ni borrar perfiles ajenos manipulando URLs o cuerpos.
- [ ] Borrar un perfil limpia D1 y caché; los reintentos antiguos no lo resucitan.
- [ ] Exportar preserva sesiones y datos que originalmente usaban `Set`.
- [ ] `/api/*` nunca devuelve el shell ni respuestas privadas cacheadas, incluso con el service worker activo.
- [ ] Los controles siguen siendo accesibles y los recorridos existentes de juego funcionan con el nuevo formulario.

Ejecutá `npm run typecheck`, `npm test`, `npm run build` y `npm run test:e2e`, además de las nuevas pruebas de backend. Ajustá los scripts/configuración necesarios para que se ejecuten con D1 local y sin credenciales de producción.

## Entrega

Entregá código funcional, migraciones SQL, configuración de Wrangler, scripts, pruebas y README actualizado con pasos exactos para crear/vincular D1, aplicar migraciones, desarrollar y desplegar.

Informá qué verificaste y cualquier limitación concreta. Si falta acceso a Cloudflare, completá y validá toda la implementación local y dejá documentado el paso remoto pendiente; no afirmes que la base o el despliegue existen sin comprobarlo.
