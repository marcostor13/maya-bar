# HU44 — Pantalla "Mi plan y consumo" · Spec

## Objetivo

El administrador de la empresa ve su plan, el uso de cada límite, sus pagos con comprobante y edita sus datos de facturación.

## Requisitos

- R1: ruta `/settings/plan`, solo `TENANT_ADMIN` (guard de rol en el front y `ADMIN_ONLY` en la API).
- R2: plan actual: nombre, periodo, precio pactado, estado (prueba, activo, pago pendiente, vencido, cancelado, cliente anterior) y próxima fecha de cobro o vencimiento (`GET /billing/status`).
- R3: consumo: barra por recurso (usuarios, números, contactos, buzones, agentes, eventos, emails del mes y créditos de IA) con uso y límite reales (`GET /billing/usage`, que usa `PlanLimitsService` y `AiCreditsService`).
- R4: pagos: fecha, concepto, monto, estado y enlace PDF/XML del comprobante (`GET /billing/payments`, colección `payments` que llenan HU45/HU49).
- R5: datos de facturación: boleta (DNI 8) o factura (RUC 11, razón social y dirección), correo; `GET/PUT /billing/info` con validación.
- R6: los avisos de mejora (`UPGRADE_ROUTE`) llevan a esta pantalla; "Cambiar plan" lleva a los precios.

## Fuera de alcance

- Comprar más / add-ons (HU53), cancelar y cambiar de plan desde aquí (HU52): se muestran cuando existan esos flujos.

## Criterios de aceptación

| # | Requisito | Criterio | Prueba |
|---|---|---|---|
| C1 | R3 | La pantalla muestra límites y uso que devuelve la API (que calcula `PlanLimitsService` y el saldo de créditos) | `my-plan.spec.ts` + e2e `billing.e2e-spec.ts` |
| C2 | R4 | El historial lista pagos con enlace de descarga del comprobante | `my-plan.spec.ts` + e2e |
| C3 | R1 | Un usuario sin rol admin no ve la ruta y la API da 403 | e2e + guard |
| C4 | R2–R5 | En 375 px no hay desplazamiento horizontal | e2e de navegador `frontend/e2e/billing.e2e.ts` |
| C5 | R5 | Factura con DNI da 400; boleta con DNI se guarda | e2e |
