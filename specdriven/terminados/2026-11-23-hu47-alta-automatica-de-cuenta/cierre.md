# HU47 — Alta y acceso automático tras el pago · Cierre

- **Cerrada:** 2026-11-23
- **Estado:** Terminada
- **Verificación (spec-verifier):** 3 CUMPLE y 1 PARCIAL (C2, sin atomicidad ante fallos parciales). Corregido:
  - **Alta reanudable:** candado atómico en la sesión (`provisioningUntil`) y un registro de cada paso terminado (`provision.*`: empresa, plan activado, facturación, usuario, correo, aviso).
  - **Sin duplicados:** un reintento ya no crea "Empresa 2" ni suma otro periodo.
  - **Correo de acceso:** si falla, el reintento lo envía.
  - **Cron cada minuto** que retoma las compras pagadas que se quedaron sin cuenta.
  - **Enlace de un solo uso atómico:** dos canjes simultáneos del mismo enlace, solo uno pasa.
  - **Facturación:** se guarda también en las cuentas existentes.
  - **Campos del enlace ocultos** en la API y en la auditoría.
  - **"Olvidé mi contraseña"** limpia el acceso pendiente.
  - **Texto** de `/acceso` corregido.
  - **Pruebas e2e** nuevas: A1, A2, doble canje, registro sin confirmar y campos ocultos.
- **Commits:** sin commit

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Correo nuevo → 1 empresa activa, 1 admin y 1 correo | CUMPLE | `backend/test/account-provisioning.e2e-spec.ts` |
| C2 | Repetir el webhook (también en paralelo o tras un fallo) no crea otra empresa | CUMPLE | ídem (A1, A2) |
| C3 | Enlace de un solo uso, 72 h, "Reenviar acceso" | CUMPLE | ídem + `frontend/src/app/pages/access/access.spec.ts` |
| C4 | Una cuenta en prueba que paga conserva sus datos y pasa a `active` | CUMPLE | ídem |

## Qué se implementó

- `CheckoutService`: `onPaid`, `claimProvisioning`, `saveProvision`, `releaseProvisioning`, `findUnfulfilledPaid` y `markFulfilled`.
- `auth/account-provisioning.service.ts`: las ramas `account`, `existing`, `new` y `conflict`, con el enlace de acceso.
- `POST /auth/access` y `POST /auth/access/resend`.
- `TenantsService.activatePlan`, `uniqueName` y `setBillingInfo`; `UsersService.superadminEmails` y `consumeAccessToken`.
- Frontend: `/acceso` (lleva a `/onboarding`) y el estado "Activando tu cuenta…" en el resultado.

## Pendientes, riesgos y notas

- El onboarding aún no muestra el plan comprado (punto 7 de la historia): conviene hacerlo junto con HU50 (correo de bienvenida).
- Comprobante (HU49) y correo de confirmación con detalle (HU50) siguen pendientes.
