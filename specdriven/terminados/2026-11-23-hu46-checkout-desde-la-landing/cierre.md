# HU46 — Checkout desde la landing y desde la cuenta · Cierre

- **Cerrada:** 2026-11-23
- **Estado:** Terminada
- **Verificación (spec-verifier):** 4 CUMPLE. Hallazgos corregidos:
  - `POST /billing/checkout` acepta solo el TENANT_ADMIN (fuera roles propios y superadmin).
  - La pantalla dice "Listo" solo con la cuenta activa (`fulfilled`, HU47); con `paid` muestra "Activando tu cuenta…".
  - Un aviso pendiente tardío ya no deja una compra pagada como pendiente de nuevo.
  - "Intentar de nuevo" conserva plan, periodo y moneda.
  - En la cuenta, la empresa viene ya llena.
  - Nuevas pruebas e2e: rol, plan Empresa con 400 y orden de los avisos.
- **Commits:** sin commit

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Total mostrado = el de la preferencia o el preapproval, con el IGV desglosado | CUMPLE | `checkout.e2e-spec.ts`, `checkout.spec.ts` |
| C2 | Un RUC inválido no deja continuar | CUMPLE | ídem |
| C3 | Volver con `status=approved` sin webhook no activa nada | CUMPLE | ídem |
| C4 | PagoEfectivo pendiente explica cómo pagar y que el acceso llega por correo | CUMPLE | ídem; el correo lo envía HU47 |

## Qué se implementó

- Cotización con IGV (solo en soles) y RUC con dígito verificador.
- Colección `checkout_sessions` y las rutas de checkout público y desde la cuenta.
- Suscripción mensual (preapproval) y pago único trimestral o anual (Checkout Pro).
- Pantallas `/checkout` y `/checkout/resultado` (consulta el estado cada 3 s).
- Enlaces "o paga ahora" en la landing y "Elegir y pagar plan" en Mi plan.

## Pendientes, riesgos y notas

- Cupón (HU54) e implementación (HU55) quedan para sus historias.
- Falta comprobar con credenciales reales que la cuenta de Mercado Pago Perú acepta cobros en USD; si no, habrá que cobrar en PEN.
- `FRONTEND_URL` debe ser https para el preapproval y `PUBLIC_API_URL` define `notification_url`. Está anotado en la guía.
- Accesibilidad de los selectores (radio/aria-checked): mejora menor, pendiente.
