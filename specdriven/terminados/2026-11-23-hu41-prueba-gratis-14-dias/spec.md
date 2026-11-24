# HU41 — Prueba gratis de 14 días real · Especificación

Historia: `backlog/hu41-prueba-gratis-14-dias.md` · Fecha: 2026-11-23 · Estado: aprobada

## Objetivo

Que la prueba de 14 días que promete la landing exista de verdad: empieza al registrarse,
se ve cuánto queda y, al vencer, la cuenta queda en solo lectura sin perder datos.

## Usuarios

- Empresa en prueba: sabe cuántos días le quedan y cómo elegir plan.
- Superadmin: puede alargar la prueba.

## Alcance

- Incluye: estado `subscription.status = trialing` y plan `crece` al registrarse; regla única de
  acceso (`accessOf`); interceptor global de solo lectura (402); pausa del agente IA y de las
  campañas de email/SMS; `GET /billing/status`; banner en el shell; alargar la prueba desde la ficha.
- **Fuera de alcance:** pedir tarjeta; correos de los días 10, 13 y 14 (HU50); checkout (HU46).
- Corrección del contexto: `TenantsService.create` ya fijaba `trialEndsAt` a 14 días, pero nadie lo usaba.

## Requisitos (EARS)

- **R1** — Cuando se crea una empresa, el sistema debe dejarla en `trialing`, plan `crece` y `trialEndsAt = ahora + 14 días`.
- **R2** — Si la prueba venció y no hay pago, entonces toda escritura (POST/PUT/PATCH/DELETE) de un usuario de esa empresa debe responder 402 `SUBSCRIPTION_REQUIRED` con "Tu prueba terminó, elige un plan"; las lecturas siguen.
- **R3** — Mientras la cuenta esté en solo lectura, el agente IA no debe responder y las campañas de email/SMS, la recuperación por WhatsApp, los mensajes programados y el reintento automático deben esperar sin cancelarse; la API pública con clave tampoco escribe.
- **R4** — Siempre quedan abiertas: sesión (`/auth`), pago (`/billing`), notificaciones, push, datos de la propia empresa y del propio usuario; el superadmin y las rutas públicas/webhooks no se ven afectados.
- **R5** — El shell debe mostrar los días restantes; desde el día 11 (≤ 3 días) en tono de aviso; vencida, un aviso de solo lectura con "Elegir plan".
- **R6** — Cuando el superadmin fija un fin de prueba futuro, la prueba vencida vuelve a `trialing`.
- **R7** — Los clientes anteriores al catálogo (`legacy`, sin suscripción) no cambian.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | Empresa nueva → `trialEndsAt` a 14 días, plan `crece`, `trialing` | unitaria `tenants.service.spec.ts` |
| C2 | R2, R4 | Prueba vencida → POST de envío 402 con el mensaje; GET 200; `/billing`, `/auth` y webhooks pasan | unitaria `read-only.interceptor.spec.ts` + `subscription-access.spec.ts` |
| C3 | R5 | Con reloj simulado, el banner muestra los días correctos y el tono de aviso | unitaria `trial-banner.spec.ts` |
| C4 | R3 | Cuenta en solo lectura → `runAgent` y la campaña no envían | unitaria |
| C5 | R6 | Alargar la prueba vencida → `subscription.status = trialing` | unitaria `tenants.service.spec.ts` |

## Supuestos y decisiones por defecto

- "Elegir plan" lleva a la sección de precios de la landing (`/#precios`) hasta que exista la pantalla Mi plan (HU44).
- Caché del estado de cobro: 30 s.

## Preguntas abiertas

- Ninguna.
