# HU30 — Check-in en la puerta, pensado para el móvil · Cierre

- **Cerrada:** 2026-11-22
- **Estado:** Terminada con pendientes del usuario
- **Verificación (spec-verifier):** no ejecutado (el hook de context-mode modifica la llamada y el modo automático la rechaza). Autoverificación: 6 CUMPLE, 1 [usuario] (C7).
- **Commits:** sin commit (se integran al final del lote HU28–HU39)

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Verde/ámbar/rojo con vibración; el escáner sigue abierto | CUMPLE | `tabs/checkin-logic.ts`, `event-checkin-tab.ts` `onQrDecoded`/`showResult`; `event-checkin-tab.spec.ts` |
| C2 | Contador y tasa en personas de confirmados | CUMPLE | `event-detail.store.ts` `checkedInCount`/`totalAttendees`; spec (3/5, 60 %) |
| C3 | Lista sin cancelados e independiente de Asistentes; búsqueda por teléfono | CUMPLE | `allRegistrations`, `confirmedRegistrations`, `matchesCheckin`; spec |
| C4 | Check-in de un cancelado → 409 | CUMPLE | `backend/src/events/registrations.service.ts` (`ConflictException`); `registrations.service.spec.ts` |
| C5 | Deshacer: DELETE y el contador baja | CUMPLE | `events.controller.ts` `undoCheckIn`, `registrations.service.ts` `undoCheckIn`; unitarias back y front |
| C6 | Buscador ≥ 16 px | CUMPLE | `event-checkin-tab.ts` usa `.input` (16 px en el móvil por `styles.scss:378`) |
| C7 | Pantalla completa, linterna y pitido en un móvil real | NO VERIFICADO | **[usuario]** |

## Qué se implementó

- **Backend**: rechaza (409) el check-in de registros cancelados y añade `DELETE /events/:id/registrations/:regId/check-in` (`MANAGE_ROLES`, evento del tenant).
- **Escáner a pantalla completa**:
  - Lectura continua y caja de lectura proporcional a la pantalla.
  - Tarjeta de resultado de 2 s en verde, ámbar o rojo, con vibración distinta.
  - Pitido opcional (se recuerda), linterna si el dispositivo la soporta y Esc para cerrar.
- **Contador** en personas confirmadas; Estadísticas usa la misma cuenta y los impulsadores cuentan personas presentes.
- **Lista manual** propia: solo confirmados, búsqueda por nombre/email/teléfono/ticket, chip "Grupo de N" y botón "Dar ingreso"; barra "Deshacer" de 6 s.

## Lo que tiene que hacer el usuario

- Probar el escáner en un móvil real durante un evento (cámara, linterna, vibración).

## Pruebas

- Backend: `npm run build` OK · `npm test` → 1691/1691 (125 suites).
- Frontend: `npx ng test frontend --watch=false` → 92/92 archivos en verde · `npm run build` OK.

## Pendientes, riesgos y notas

- Check-in sin conexión: fuera de alcance.
- La linterna depende del navegador (no existe en Safari iOS).
