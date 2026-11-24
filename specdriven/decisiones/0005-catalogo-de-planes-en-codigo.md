# 0005 — Catálogo de planes en código

- **Fecha:** 2026-11-23 · **Estado:** aceptada
- **Historia:** hu40

## Contexto

Precios y límites estaban repartidos entre la landing y nada en el backend; el cobro
(Mercado Pago, SUNAT) y los límites necesitan una fuente única.

## Decisión

El catálogo vive en `backend/src/billing/plans.catalog.ts` y se publica en
`GET /public/plans`. El precio que paga cada cliente se congela en su suscripción (HU48).

## Alternativas consideradas

- Colección en Mongo editable por el superadmin — más trabajo y riesgo de errores sin
  necesidad hoy; se puede migrar luego leyendo el mismo contrato.

## Consecuencias

- Positivas: una sola cifra, versionada en git. · Negativas: cambiar un precio exige deploy.
