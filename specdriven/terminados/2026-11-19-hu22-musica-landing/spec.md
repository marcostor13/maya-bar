# HU22 — Música de la landing con un solo clic · Especificación

Historia: `hu.md` · Fecha: 2026-11-19 · Estado: aprobada

## Objetivo

Hoy el botón de música solo monta un iframe de Spotify de 340 px y el visitante tiene que pulsar otra vez dentro: Spotify ignora `autoplay=1` y el navegador bloquea el autoplay de un iframe ajeno. Se añade un audio propio (un botón, sin reproductor) y Spotify pasa a controlarse desde el botón con su iFrame API, en formato compacto.

## Usuarios

- Organizador (diseñador de la invitación): elegir la música.
- Visitante de la landing: escucharla con un clic.

## Alcance

- Incluye: subir un archivo de audio en la ventana «Música» del diseñador; botón único en la landing para el audio; Spotify con iFrame API y reproductor compacto; aceptar también un enlace `open.spotify.com` además del código embed; `audio/x-m4a` en las subidas.
- **Fuera de alcance:** reproducción automática al abrir la landing (los navegadores la bloquean); control de YouTube/SoundCloud por API (siguen como hoy, solo más compactos); recortar o comprimir el audio.

## Requisitos (EARS)

- **R1** — Cuando el organizador sube un audio (mp3, m4a, aac, ogg, wav; máx. 30 MB) en «Música», el sistema debe guardarlo en el diseño (`music.audioUrl`, `music.audioName`) y mostrar un reproductor de prueba. Si la subida falla, debe avisar con un toast.
- **R2** — Si el diseño tiene `audioUrl`, la landing debe mostrar solo un botón redondo pequeño: un clic reproduce, otro pausa, sin iframe. El audio tiene prioridad sobre el embed. Si el navegador rechaza la reproducción, el botón vuelve a «play».
- **R3** — Si no hay audio y el embed (o enlace) es de Spotify, al cargar la landing el sistema debe preparar con la iFrame API un reproductor compacto (80 px) plegado, para que el clic solo tenga que ordenar la reproducción: con el reproductor listo (`ready`) el clic alterna con `togglePlay()`; si aún no lo está, el clic deja la orden pendiente y se ejecuta `play()` al llegar `ready` (un segundo clic la cancela). Si la API no carga en 8 s, se vuelve al iframe. El botón sigue los eventos `playback_update`.
- **R4** — Con otro embed (YouTube, SoundCloud…) se conserva el comportamiento actual, en un reproductor más pequeño.
- **R5** — El botón de música debe ser más pequeño que hoy (≤ 44 px; 40 px en móvil) y tener `aria-label` y `aria-pressed`.
- **R6** — Quitar la música en el diseñador borra audio y embed.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1, R6 | Subir audio llama a `upload`, guarda `audioUrl`/`audioName` y emite el cambio; error → toast; «Quitar audio» lo borra; «Quitar» del diseñador borra todo | unitaria `landing-music-picker.spec`; el cableado del diseñador por revisión |
| C2 | R2, R5 | Con `audioUrl`: un botón, sin iframe; clic → `play()`, clic → `pause()`; rechazo → vuelve a play | unitaria `public-event.spec` |
| C3 | R3 | Con Spotify: al cargar se crea el controlador (URI correcta, 80 px, plegado); clic con `ready` → `togglePlay()`; clic antes de `ready` → `play()` al llegar; segundo clic cancela; tiempo límite de carga; `playback_update` actualiza el botón | unitaria `public-event.spec` y `landing-music.spec` (API simulada) |
| C4 | R3 | URI extraída de embed y de enlace (`track`, `album`, `playlist`, `episode`, `show`, con `intl-xx`) | unitaria del helper |
| C5 | R1 | `audio/x-m4a` se acepta en `/upload` | unitaria `upload.service.spec` |
| C6 | — | En un móvil real, la landing suena con un clic **[usuario]** | manual |

## Supuestos y decisiones por defecto

- El audio se reproduce en bucle (`loop`), con `preload="none"` para no gastar datos.
- La subida usa `EventsApiService.upload` (carpeta `events`), igual que los medios del evento.
- En iPhone Spotify puede seguir pidiendo tocar el reproductor; por eso el compacto queda visible tras el primer clic.

## Preguntas abiertas

- ninguna
