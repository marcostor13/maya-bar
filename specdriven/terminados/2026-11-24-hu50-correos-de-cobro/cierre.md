# HU50 — Correos de cobro · Cierre

- **Cerrada:** 2026-11-24
- **Estado:** Terminada
- **Verificación (spec-verifier):** C1 y C2 CUMPLE, C3 PARCIAL. Hallazgos corregidos:
  1. **Token en la bitácora:** la bienvenida ya no guarda el token (`redact`, la copia muestra `[oculto]`). Un correo con enlace de acceso no se reenvía tal cual (400: usar "Reenviar acceso"). La bienvenida va solo al comprador, nunca en copia.
  2. **Fallo a medias:** la bitácora anota cada destinatario entregado (`delivered`) y bloquea el envío en curso (`lockedUntil`). El reintento solo va a los que faltan y el registro nunca se borra.
  3. **Correo del comprobante fallido:** `drain` lo reintenta durante 7 días.
  4. **Doble escape:** corregido; el texto plano sale sin entidades.
  5. **`wasSent`:** exige `sentAt`.
  6. **Cobro recurrente:** se identifica por `mpPreapprovalId`, no por `external_reference`; el aviso de cobro fallido pasó a HU51.
  7. **Destinatarios del comprobante:** comprador, correo de facturación y administrador de la empresa.
  8. **Textos:** "Aquí tienes" (sin enlaces vacíos) y el correo de PagoEfectivo ya no promete el acceso.
  9. **Pruebas nuevas:** plantilla de acceso, plan en el cobro fallido, doble escape, copia y reintento sin duplicar, token oculto y reenvío de la bienvenida rechazado.
- **Commits:** sin commit

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Un cliente nuevo con pago aprobado recibe exactamente bienvenida + comprobante | CUMPLE | `backend/test/billing-emails.e2e-spec.ts` |
| C2 | Repetir el webhook no repite los correos | CUMPLE | ídem (incluye un fallo a medias) |
| C3 | Cada plantilla tiene una prueba de monto, plan y enlace | CUMPLE | `backend/src/billing/emails/billing-email.templates.spec.ts` (14 casos) |

## Pendientes, riesgos y notas

- **Pantalla de la bitácora y del reenvío para el superadmin:** HU57. Hoy solo existen `GET /billing/admin/emails` y `POST /billing/admin/emails/:id/resend`.
- **Correo de cambio de plan o cancelación:** la plantilla existe; la dispara HU52.
