# HU82 · Especificación
Historia: `hu.md` · Fecha: 2026-11-25 · Estado: aprobada (pedido del usuario). Usa la base de HU79.

## Requisitos
- **R1** — Las páginas de la historia existen con estructura "respuesta primero", ≥3 FAQ, enlaces relacionados y fecha.
- **R2** — Solo datos verificables: funciones reales del producto (código y landing), precios del catálogo; en HU82 datos de la competencia con fuente oficial, fecha de revisión y "No verificado" donde no se pudo confirmar; en HU83 tarifas de Meta de `docs/costos-mensajes.md`.

## Criterios
| # | Criterio | Verificación |
|---|---|---|
| C1 | Páginas publicadas y prerenderizadas | build (21 rutas) + `content.spec.ts` |
| C2 | Estructura y enlaces válidos | `content.spec.ts` |
| C3 | Datos con fuente (HU82: nota con fecha + fuentes; HU83: fuente de Meta) | `content.spec.ts` + revisión |
