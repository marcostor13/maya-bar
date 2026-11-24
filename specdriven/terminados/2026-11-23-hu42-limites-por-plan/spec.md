# HU42 — Límites por plan aplicados · Especificación

Historia: `backlog/hu42-limites-por-plan.md` · Fecha: 2026-11-23 · Estado: aprobada

## Objetivo

Que cada plan limite de verdad lo que promete (usuarios, números, buzones, agentes, eventos,
contactos, emails de campaña) y active sus funciones, para que el cliente que crece suba de plan.

## Usuarios

- Administrador de la empresa: entiende el tope y puede mejorar el plan o comprar un add-on.
- Dueño de Maya: los planes se diferencian.

## Alcance

- Incluye: `PlanLimitsService` (límite del plan + add-ons `tenant.addons`), comprobación en la
  creación de usuarios, números de WhatsApp, buzones, agentes IA, contactos (alta manual),
  publicación de eventos y lanzamiento de campañas de email; funciones por plan (campañas de
  WhatsApp desde Crece; recuperación y multi-sede desde Escala); 402 `PLAN_LIMIT` /
  `PLAN_FEATURE`; diálogo en el frontend con "Mejorar plan" y "Comprar add-on"; `legacy` exento.
- **Fuera de alcance:** borrar lo que sobra al bajar de plan (HU52); compra de add-ons (HU53);
  candado visual en el menú (se resuelve con el diálogo al intentar la acción); límite de
  contactos en importaciones masivas y altas automáticas por mensajes entrantes (nunca se
  bloquea un cliente que escribe).

## Requisitos (EARS)

- **R1** — Cuando una empresa intenta crear un recurso limitado y el uso actual ya es ≥ límite del plan + add-ons, el sistema debe responder 402 `{ code: 'PLAN_LIMIT', resource, limit }`.
- **R2** — En Inicia, cuando se publica un evento y ya hay 1 publicado vigente, el sistema debe responder 402; guardar como borrador debe funcionar.
- **R3** — Cuando una empresa usa una función fuera de su plan, el sistema debe responder 402 `{ code: 'PLAN_FEATURE', feature }`.
- **R4** — Si la empresa es `legacy` o del plan Empresa, no se aplica ningún límite.
- **R5** — Cuando la API responde 402 `PLAN_LIMIT`/`PLAN_FEATURE`, el frontend debe mostrar un diálogo con el motivo y los botones "Mejorar plan" y "Comprar add-on".
- **R6** — Lanzar una campaña con el cupo de emails del mes ya agotado debe responder 402 antes de enviar.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1, R5 | Inicia con 2 usuarios → crear (o reactivar) el 3.º da 402 `PLAN_LIMIT`; la UI ofrece mejorar o add-on | e2e `plan-limits.e2e-spec.ts` + `plan-limit.spec.ts` |
| C2 | R2 | Inicia con 1 evento publicado → publicar otro 402; borrador OK | unitaria `plan-limits.service.spec.ts` + e2e |
| C3 | R1 | Con add-on +1 usuario, el 3.º se crea | unitaria |
| C4 | R4 | `legacy` sin límites | unitaria |
| C5 | R3 | Inicia → crear o enviar campaña de WhatsApp 402 `PLAN_FEATURE` | unitaria + e2e |

## Supuestos y decisiones por defecto

- "Evento activo" = publicado con fecha ≥ hoy − 1 día.
- Usuarios = activos, sin contar superadmin. Contactos = altas manuales (`POST /customers`).
- En prueba (`trialing`, plan Crece) se aplican los límites de Crece.
- "Mejorar plan" lleva a la pantalla Mi plan (HU44) cuando exista; mientras, a `/#precios`.

## Preguntas abiertas

- Ninguna.
