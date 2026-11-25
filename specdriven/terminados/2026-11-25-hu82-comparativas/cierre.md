# HU82 — Comparativas · Cierre
Fecha: 2026-11-25 · Estado: **Terminada**

## Qué se hizo
4 comparativas: HubSpot, Kommo, Leadsales y Wati, con tabla, fuente oficial, fecha de revisión 25-11-2026 y 'No verificado' donde no se pudo confirmar. Datos en `frontend/src/app/pages/content/data/`; precios y límites desde el catálogo.

## Verificación
- `content.spec.ts` 9/9 (estructura, enlaces, fuentes, formato de números); build con 21 rutas prerenderizadas.
- spec-verifier: Forma CUMPLE. Las cifras de la competencia salen de sus páginas oficiales consultadas el 25-11-2026; no hay capturas. Revisar cada trimestre (pendiente en docs/pendientes-usuario.md). Corregidas 2 frases (email frente a Kommo; comparación de 3 usuarios con Inicia + usuario adicional).
