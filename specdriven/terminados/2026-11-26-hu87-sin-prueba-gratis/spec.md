# HU87 — Quitar la prueba gratis: el alta es con pago · Especificación

Historia: `backlog/hu87-sin-prueba-gratis.md` · Fecha: 2026-11-26 · Estado: aprobada (decisiones del usuario en la historia)

## Objetivo

Hoy cualquiera crea en `/register` una empresa con 14 días gratis del plan Crece. Se vende con
demo en vivo (HU86) y pago por adelantado: la única forma de tener cuenta nueva es pagar en el
checkout (HU46/HU47), y la prueba gratis desaparece del producto, la web y los documentos de venta.

## Usuarios

- Visitante: ve planes y precios, pide una demo por WhatsApp o paga y recibe su acceso.
- Superadmin: sigue creando empresas a mano (venta fuera de la web) y no ve controles de prueba.

## Alcance

- Incluye: cierre del registro público, empresas nuevas sin prueba, quitar aviso, recordatorios,
  "Alargar prueba" y KPIs de prueba, textos públicos (landing, páginas de contenido, login,
  registro, metadatos), docs de venta y del agente.
- **Fuera de alcance:** borrar datos históricos de prueba (no hay empresas en prueba); evento
  `Purchase` de Meta al pagar (pendiente aparte); rehacer las imágenes de anuncios viejas
  (campañas borradas, se reemplazan por videos).

## Requisitos (EARS)

Funcionales:
- **R1** — Cuando alguien llama a `POST /auth/register`, el sistema debe responder 410 con un mensaje que indique que el alta es con pago, sin crear empresa ni usuario.
- **R2** — Cuando se crea una empresa (alta pagada, superadmin o agencia), el sistema no debe asignarle `trialEndsAt` ni `subscription: trialing`.
- **R3** — Cuando un visitante entra a `/register` sin un correo pendiente de confirmar, la web debe llevarlo al checkout conservando el plan y el periodo elegidos.
- **R4** — Si un usuario con correo pendiente de confirmar llega a `/register` desde el login, la web debe seguir mostrándole la confirmación por código.
- **R5** — La web pública (landing, páginas de contenido, login, metadatos y datos para buscadores) no debe ofrecer prueba gratis; los CTA llevan a pedir demo por WhatsApp o a los planes y el checkout.
- **R6** — El panel no debe mostrar el aviso de días de prueba (el banner sigue solo para impago y solo lectura), el botón "Alargar prueba", el KPI "Pruebas activas", la columna "Trial hasta" ni el campo "Fin de la prueba"; y no debe enviar recordatorios de prueba.
- **R7** — Los documentos de venta (`docs/agente-ventas-maya.md`, `docs/meta-ads-contenido.md`) no deben ofrecer prueba gratis: el cierre es demo → enlace de pago.

No funcionales:
- **R8** — Seguridad: ninguna ruta pública debe crear una empresa operable sin pago.
- **R9** — Compatibilidad: empresas existentes (legacy, activas, vencidas) mantienen su acceso tal cual.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1, R8 | Dado un POST válido a `/auth/register`, entonces 410 y no aumenta el número de empresas ni usuarios | e2e |
| C2 | R2 | Cuando `TenantsService.create` crea una empresa, entonces no tiene `trialEndsAt` ni `subscription` | unitaria |
| C3 | R2, R9 | Dado un pago de un cliente nuevo, entonces la empresa queda `active` con su plan (HU47 sin cambios) | e2e existente de alta pagada |
| C4 | R3, R4 | `/register?plan=crece&pago=anual` lleva a `/checkout?plan=crece&periodo=anual`; con `verifyEmail` en el estado muestra el código | unitaria del componente |
| C5 | R5 | No quedan "14 días", "prueba gratis", "sin tarjeta" ni "Crear cuenta gratis" en `frontend/src/app` fuera de pruebas | grep + unitarias de landing/contenido |
| C6 | R6 | El banner no muestra días de prueba; no hay botón "Alargar prueba" ni endpoint `extend-trial`; el KPI y la columna no están; `trialReminders` no existe | grep + unitarias + e2e |
| C7 | R7 | Los docs no ofrecen prueba gratis | grep |
| C8 | R9 | Las pruebas de acceso de empresas existentes siguen en verde | suites completas |

## Supuestos y decisiones por defecto

- Una empresa creada a mano por el superadmin queda con acceso completo (como legacy) hasta que
  el superadmin active un plan: es una venta cerrada fuera de la web. Se documenta.
- La lógica de `accessOf` para `trialing` se conserva: solo lee datos históricos, no crea pruebas.
- El banner del shell (`trial-banner.ts`) se conserva porque también avisa de impago y solo lectura (HU51); solo pierde el mensaje de prueba.
- La portada de Facebook decía "Prueba gratis 14 días": se regeneró en `docs/meta-assets/portada-facebook-1640x624.png`; subirla es del usuario (publicación pública).
- El CTA principal de la web es "Pide tu demo" (WhatsApp 991 172 822, mensaje predefinido) y el
  secundario "Ver planes".
- El evento de Meta `CompleteRegistration` deja de dispararse (ya no hay registro).

## Preguntas abiertas

- Ninguna.
