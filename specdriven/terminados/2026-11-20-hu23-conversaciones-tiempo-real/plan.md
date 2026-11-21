# HU23 — Plan

- `shared/conversations-realtime.ts`: `resync$` (Subject). `connect` cuenta
  las conexiones: desde la segunda emite `resync$` y `refreshUnread()`.
  `onVisible` y un listener `online` emiten `resync$` (y releen el contador).
  Se quitan en `disconnect()`.
- `pages/inbox/inbox.ts`: suscripción a `resync$` → `loadConversations(false)`
  + `syncMessages()`. `syncMessages()` pide `?limit=50` en silencio y mezcla con
  `mergeMessages(actual, recibidos)` (función pura exportada). La red de
  seguridad de 15 s llama también a `syncMessages()`. `loadConversations(false)`
  usa `silentRequest()`.
- Sin cambios de backend.
- Pruebas: `conversations-realtime.spec.ts` (C1, C2), `inbox.spec.ts` (C3, C5),
  prueba pura de `mergeMessages` (C4).
