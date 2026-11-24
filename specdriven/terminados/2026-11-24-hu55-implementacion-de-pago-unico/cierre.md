# HU55 — Implementación de pago único descontable · Cierre

## Resultado
- **C1 CUMPLE:** Crece anual con la Puesta en marcha muestra:
  - una línea de S/ 490;
  - un descuento de 249;
  - un total de la implementación de S/ 284,38;
  - "Hoy pagas" S/ 3.222,58, igual a la suma de los ítems de la preferencia de Mercado Pago;
  - en el comprobante, 2 líneas con `total_descuento` 249.
- **C2 CUMPLE:** con el pago aparece la tarea en `/admin/onboarding`, con contacto, paquete, plan y checklist. Al cliente le llega el correo para agendar; a los superadmins, un aviso.

## Hallazgos del spec-verifier corregidos
- **La tarea se perdía si el alta fallaba en el webhook.** Ahora la implementación se marca pagada antes del alta, y también cuando la sesión ya está `fulfilled`. Si fallan los avisos, eso no frena el alta.
- **Correos con el monto de solo el plan.** Los correos de pago pendiente (CIP), de pago rechazado y de bienvenida ahora usan el monto que se cobra de verdad: plan más implementación.
- **Mensual:** el enlace para pagar la implementación va en el correo de bienvenida. La pantalla de resultado solo lo ofrece cuando el plan ya está pagado.
- **Pago `:setup` con otro monto o moneda:** se ignora y queda en el log.
- **Preferencia de la implementación que falla:** se cancela el preapproval ya creado.
- **Renovaciones:** no aceptan implementación.
- **Nota de crédito:** sale con las mismas 2 líneas que la boleta.
- **Panel:**
  - notas editables;
  - `role="radio"` y `aria-checked` en el filtro;
  - con un filtro activo, la tarea que cambia de estado sale de la lista;
  - el estado se marca con `[selected]`.
- **Documentación:** `ONBOARDING_BOOKING_URL` explicado en `docs/cobros-mercadopago.md`.

## Pendiente (bajo, no bloquea)
- El listado hace N+1 consultas para completar `tenantId`, con tope de 200 y sin paginación.
- Nadie avisa si en mensual la implementación queda sin pagar.

## Pruebas
- `backend/test/onboarding.e2e-spec.ts`: 6 pruebas. Cubren C1/C2, el pago aparte en mensual con webhook doble, el alta fallida con reintento, el tope del descuento y el monto de los correos, el monto que no cuadra, y los permisos.
- `frontend/src/app/pages/admin/onboarding.spec.ts`: 3 pruebas.
- `checkout.spec.ts`: +1 prueba.
- Suites completas:
  - backend unitarias: 1777;
  - e2e: 28 suites, 233 pruebas;
  - frontend: 957 pruebas;
  - builds correctos.

## Acción del usuario
- Configurar `ONBOARDING_BOOKING_URL` en el backend de Coolify.
