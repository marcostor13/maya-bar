# HU51 — Pago fallido, gracia y bloqueo suave · Spec

## Requisitos

- R1: un cobro mensual automático rechazado (de una suscripción ya dada de alta, identificada por `mpPreapprovalId`) pone la cuenta en `past_due` con `pastDueSince` y 7 días de gracia (`DEFAULT_GRACE_DAYS = 7`). Avisa el día 0 con el motivo legible. Si Mercado Pago reintenta y vuelve a fallar, la gracia no se reinicia.
- R2: un plan trimestral o anual que vence sin pagar (`markPastDue`) también pasa a `past_due` con 7 días de gracia.
- R3: avisos al cliente los días 0, 3 y 6 (`PastDueService.reminders`, cada hora), una sola vez cada uno (bitácora HU50). El enlace va a `/checkout` con el mismo plan, periodo y moneda: un pago único o un `preapproval` nuevo.
- R4: en `past_due` todo funciona. El banner rojo dice "No pudimos cobrar tu plan…" con "Actualizar medio de pago".
- R5: desde el día 8 la cuenta queda en solo lectura (regla de HU41: `ReadOnlyInterceptor` y `canOperate`):
  - Escrituras: 402. Lecturas y exportación: funcionan.
  - El agente IA y las campañas se pausan.
  - Los mensajes entrantes siguen guardándose.
- R6: a los 60 días en solo lectura se avisa una vez a los superadmin. No se borra nada.
- R7: al pagar (cobro recurrente aprobado o compra), la cuenta vuelve a `active` y se limpian `graceEndsAt` y `pastDueSince`. La caché de acceso se invalida: el agente y las campañas vuelven a correr.

## Criterios de aceptación

| # | Criterio | Prueba |
|---|---|---|
| C1 | En `past_due` se puede escribir; en `expired` el envío da 402 y `GET /customers/export.csv` funciona | `test/past-due.e2e-spec.ts` |
| C2 | En `expired` un WhatsApp entrante se guarda en la bandeja | ídem |
| C3 | Pagar en `expired` deja la cuenta `active` y `canOperate` en true (el agente vuelve a responder) | ídem |
