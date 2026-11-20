# HU22 — Música de la landing con un solo clic · Cierre

- **Cerrada:** 2026-11-19
- **Estado:** Terminada (pendiente prueba en móvil real)
- **Verificación (spec-verifier):** 4 CUMPLE · 1 PARCIAL (C1, sin prueba del diseñador) · C6 [usuario] — hallazgos corregidos sin segunda vuelta
- **Commits:** ver `git log` (subida a main)

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Estado | Evidencia |
|---|---|---|
| C1 subir audio, quitar | CUMPLE (diseñador por revisión) | `pages/events/landing-music-picker.ts` + spec; `invitation-designer.ts` `updateMusic`/`hasMusic` |
| C2 audio con un botón | CUMPLE | `public-event.ts`; `public-event.spec.ts` |
| C3 Spotify por iFrame API | CUMPLE tras corrección | precarga plegada, `play()` tras `ready`, cancelar, tiempo límite 8 s; `public-event.spec.ts`, `landing-music.spec.ts` |
| C4 URI de Spotify | CUMPLE | `shared/landing-music.ts` + spec |
| C5 `audio/x-m4a` | CUMPLE | `upload.service.ts` + spec |
| C6 móvil real | Pendiente del usuario | — |

## Correcciones tras la verificación

- Tiempo límite de 8 s para la API de Spotify: si no responde, se vuelve al iframe y el botón no queda colgado.
- `play()` solo tras el evento `ready` del controlador; un segundo clic mientras carga cancela.
- `audio/x-wav` con extensión `wav`.
- Spec y plan describen la precarga del reproductor de Spotify (desviación del plan inicial).

## Verificación mecánica

- Frontend: 818/818 antes de las correcciones; 18/18 de HU22 después; build OK (aviso de presupuesto de `inbox.ts`, previo).
- Backend: `upload.service.spec` 2/2; `tsc --noEmit` limpio.

## Riesgos aceptados

- En iPhone (y algún Android) Spotify puede seguir pidiendo tocar el reproductor: el clic no llega al iframe de otro origen. Por eso se recomienda el audio propio y el reproductor compacto queda visible tras el primer clic.
- Quien no tiene sesión en Spotify escucha 30 s.
- La API de Spotify se descarga al abrir la landing aunque no se pulse play.
- Sin prueba unitaria del diseñador completo (115 kB); el cableado es de dos líneas.
- Previos, fuera de alcance: `folder` de `/upload` sin validar; `embedCode` se pinta como HTML de confianza en la landing pública.

## Lo que tiene que hacer el usuario

- Probar en un móvil una landing con audio subido y otra con Spotify.
