# HU20 — Datos por usuario en el dashboard · Plan técnico

## Estado actual

- `Message.sentBy` ya existe y `sendManual` lo guarda (`conversations.service.ts`); falta un índice para agregarlo.
- `Conversation.takenOverBy`, `Lead.ownerId/closedAt/status/value`, `Customer.ownerId`, `ContactActivity.createdBy`, `Call.answeredBy/startedAt` ya existen.
- Dashboard: `dashboard.controller.ts` (`analytics`, `costs`), rango con `resolveRange`/`safeTimezone` (`analytics.helpers.ts`).

## Diseño

- **Datos:** índice parcial `(tenantId, sentBy, at)` en `Message`.
- **API:** `GET /dashboard/users?range&tz&channel` → `{ range, channel, scope: 'team'|'self', users: [{ id, name, email, role, messages, openChats, newLeads, wonDeals, wonValue, lostDeals, newContacts, activities, calls }], totals }`. Servicio nuevo `DashboardUsersService`, 7 agregaciones `$group` por usuario en paralelo.
- **Interfaz:** componente `app-user-performance-card` en el dashboard, bajo la tarjeta de costos; tabla ordenable, totales, nota sobre mensajes.

## Seguridad

`tenantId` y rol salen del JWT; los no supervisores se filtran a su `userId` en todas las agregaciones. Sin datos de otras empresas (match por `tenantId` en cada pipeline).

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Consultas pesadas en empresas grandes | `$match` por tenant + rango sobre índices existentes; índice nuevo para mensajes |

## Estrategia de pruebas

- Unitarias: `sendManual` guarda `sentBy` (`conversations.email.spec.ts`); componente `user-performance-card.spec.ts`.
- e2e API: `test/dashboard-users.e2e-spec.ts` (C2–C4).

## Fases

1. Backend (`sentBy`, servicio, ruta) con pruebas.
2. Frontend (tarjeta) con pruebas.
