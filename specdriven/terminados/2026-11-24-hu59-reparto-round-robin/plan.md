# HU59 — Plan

## Backend `src/routing/`
- `routing-rule.schema.ts` (`routing_rules`): nombre, activo, orden, `appliesTo` (leads | contacts | both), `match` {kind: any | contact_source | form | lead_source, value}, `mode` (round_robin | least_open | weighted), `members` [{userId, weight}], `cursor`, `responseMinutes`, `onTimeout` (next | pool).
- `routing-assignment.schema.ts` (`routing_assignments`): bitácora + seguimiento del tiempo de respuesta (pending | answered | expired | none).
- `routing-pick.ts`: elección pura (rotativo, menos abiertas, ponderado) y disponibilidad por horario (+ unitarias).
- `routing.service.ts`: CRUD de reglas, `assignLead`, `assignContact`, escucha del bus (`lead_created` nuevo y `contact_created`), cron de tiempos de respuesta, avisos push, bitácora.
- `User.available` y `User.availability {days, from, to}`; `PATCH /users/me/availability`.
- `LeadsService.create` emite `lead_created` (con `unassigned`); si el contacto ya tiene dueño, la oportunidad nace con ese dueño.

## Frontend
- `pages/settings/routing.ts`: reglas (lista + `app-form-page`), en Ajustes.
- Interruptor "Disponible" + horario en el perfil/topbar.

## Pruebas
- Unitarias `routing-pick.spec.ts`; e2e `test/routing.e2e-spec.ts` (C1–C3); frontend `routing.spec.ts`.
