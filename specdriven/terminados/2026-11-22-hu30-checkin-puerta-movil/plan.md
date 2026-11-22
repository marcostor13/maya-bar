# HU30 — Check-in en la puerta · Plan técnico

## Estado actual

- `backend/src/events/registrations.service.ts:184` `checkInByCode` y `:247` `checkIn` no miran `status`. No existe deshacer.
- `frontend/.../event-detail.store.ts:73-78`: `checkedInCount` cuenta registros y `totalAttendees` suma personas, incluidos los cancelados.
- `tabs/event-checkin-tab.ts`:
  - Modal de 420 px.
  - `filteredRegistrations` sale de `registrations`, que lleva los filtros de Asistentes.

## Diseño

- **Backend**:
  - `ConflictException` para cancelados en los dos check-in.
  - `undoCheckIn` y `DELETE events/:id/registrations/:regId/check-in` con `MANAGE_ROLES`.
- **API front**: `undoCheckIn(eventId, regId)`.
- **Store**:
  - `allRegistrations`: se rellena cuando `loadRegistrations` corre sin filtros (la carga inicial).
  - `applyRegistration(r)` actualiza las dos listas.
  - `confirmedRegistrations`; los contadores en personas sobre los confirmados.
  - `impulsadorStats` sobre `allRegistrations`.
- **Lógica pura** `checkin-logic.ts`: `scanOutcome(result | error)` → `{ kind: ok|already|error, title, detail }`, `vibrationFor(kind)` y `matchesCheckin(reg, q)`.
- **Componente**:
  - Escáner `.scanner-screen` (fixed, `inset:0`, `100dvh`, fondo oscuro) con contador, cerrar, linterna, sonido y una tarjeta de resultado de 2 s.
  - Lista manual con su propia búsqueda; barra "Deshacer" de 6 s.

## Seguridad

- Deshacer: JWT + `MANAGE_ROLES`, evento del tenant y registro del evento, igual que el check-in.

## Observabilidad

- Mensajes de error claros en la tarjeta roja y en un toast.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| La linterna no existe en iOS/Safari | Solo se muestra si `getRunningTrackCapabilities().torch` |
| Lecturas repetidas del mismo QR | Bloqueo de 2 s, que ya existía |

## Estrategia de pruebas

- Unitarias backend: cancelado → 409; deshacer.
- Unitarias frontend:
  - Store: contadores.
  - `checkin-logic`.
  - Componente: lista, deshacer y lecturas.
- Manual: C7 **[usuario]**.

## Fases

1. Única.

## ADRs

- No aplica.
