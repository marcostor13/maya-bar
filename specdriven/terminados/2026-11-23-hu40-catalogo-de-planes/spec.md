# HU40 — Catálogo único de planes y precios · Especificación

Historia: `backlog/hu40-catalogo-de-planes.md` · Fecha: 2026-11-23 · Estado: aprobada

## Objetivo

Que planes, precios y límites vivan en un único catálogo del backend, para que landing,
checkout, límites y comprobantes usen siempre las mismas cifras.

## Usuarios

- Dueño de Maya: cambia precios en un solo sitio.
- Visitante de la landing / checkout: ve precios coherentes.
- Superadmin: asigna planes válidos.

## Alcance

- Incluye: `backend/src/billing/plans.catalog.ts`, `GET /public/plans`, migración de
  `starter|pro|enterprise` a `inicia|crece|escala` con `legacy: true`, validación del
  DTO y selector del superadmin con los planes nuevos.
- **Fuera de alcance:** editar precios desde una pantalla; aplicar límites (HU42);
  precio pactado por suscripción (HU48); pintar la landing desde la API (HU56).

## Requisitos (EARS)

- **R1** — Cuando se pide `GET /public/plans`, el sistema debe devolver los 4 planes con
  precio PEN (sin IGV) y USD para mensual, trimestral y anual, sus límites y funciones, sin autenticación y con `Cache-Control` público.
- **R2** — El precio trimestral debe ser `round(mensual × 3 × 0,95)` y el anual `mensual × 10`.
- **R3** — Cuando arranca el backend, el sistema debe convertir `starter→inicia`,
  `pro→crece`, `enterprise→escala` marcando `legacy: true`; la migración es idempotente.
- **R4** — Si se intenta guardar un `plan` fuera del catálogo, entonces el sistema debe responder 400.
- **R5** — Empresa a medida (`empresa`) no tiene precio público (`null`).

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1, R5 | Cuando se llama `GET /public/plans`, entonces llegan 4 planes con PEN y USD en 3 periodos y límites | unitaria del controlador |
| C2 | R3 | Dada una empresa `pro`, cuando corre la migración, entonces queda `crece` y `legacy: true`; ninguna queda fuera del catálogo | unitaria del servicio |
| C3 | R2 | Trimestral = mensual×3×0,95 redondeado; anual = mensual×10 | unitaria del catálogo |
| C4 | R4 | Cuando el superadmin envía `plan: 'pro'`, entonces 400 | unitaria del DTO |

## Supuestos y decisiones por defecto

- Precios del benchmark: Inicia S/ 99 · US$29, Crece S/ 249 · US$79, Escala S/ 549 · US$169.
- Las empresas sin plan explícito (default) también pasan a `inicia` con `legacy: true`.
- Las empresas creadas después nacen `inicia`, `legacy: false`.

## Preguntas abiertas

- Ninguna.
