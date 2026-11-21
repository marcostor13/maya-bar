# HU24 — Plan

- Backend: `Message.clientId` + índice único parcial `{tenantId, clientId}`;
  `SendMessageDto.clientId` (`^[A-Za-z0-9_-]{8,64}$`); `sendManual` devuelve el
  existente (y resuelve la carrera 11000); `retryMessage` + ruta `retry`.
- Frontend: `shared/outbox.ts` (`OutboxService`, root): cola en `localStorage`
  `maya.outbox.<userId>`; `enqueue`, `flush` (secuencial, se detiene con error
  de red), `retry`, `forConversation`; eventos `sent$` y `changed$`; vacía al
  volver la red (`online`) y con `resync$` (HU23).
- `inbox.ts`: `send()` usa la cola; las burbujas provisionales se llaman
  `tmp-<clientId>`; `loadMessages`/`syncMessages` añaden los de la cola;
  `matchTemp` por `clientId`; estado `queued` con icono WifiOff; botón Reintentar.
- Pruebas: e2e `inbox-retry.e2e-spec.ts` (C1–C3), `outbox.spec.ts` (C4–C6).
