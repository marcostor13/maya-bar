# HU22 — Plan

- `frontend/src/app/shared/landing-music.ts` (nuevo): `spotifyUri(code)` y `loadSpotifyIframeApi()` (carga única del script, promesa compartida).
- `pages/events/invitation-designer.ts`: `DesignMusic` con `audioUrl?`/`audioName?`; en la ventana «Música», «Subir audio» (input file, `EventsApiService.upload`, toast) con `<audio controls>` de prueba; texto del embed acepta enlace de Spotify; «Quitar» limpia todo.
- `pages/public-event/public-event.ts`: modo `audio` (elemento `<audio>` con ViewChild), modo `spotify` (iFrame API precargada al abrir la landing, contenedor compacto plegado, `play()` tras `ready`, tiempo límite de 8 s), modo `embed` (actual, compacto). Botón 44/40 px con `aria-pressed`.
- `backend/src/upload/upload.service.ts`: `audio/x-m4a`.
- Pruebas: `landing-music.spec.ts`, `public-event.spec.ts`, `upload.service.spec.ts`, diseñador.
