# HU80 — Páginas de funciones · Cierre
Fecha: 2026-11-25 · Estado: **Terminada**

## Qué se hizo
6 páginas: crm-whatsapp, agentes-ia-whatsapp, campanas-whatsapp, formularios, eventos, bandeja-unificada. Datos en `frontend/src/app/pages/content/data/`; precios y límites desde el catálogo.

## Verificación
- `content.spec.ts` 9/9 (estructura, enlaces, fuentes, formato de números); build con 21 rutas prerenderizadas.
- spec-verifier: El verificador encontró 2 afirmaciones falsas (cada vendedor no ve todas las conversaciones; push al asignar conversación) y planes sin indicar (promotores, roles a medida): corregidas. Afirmaciones contrastadas con el código: dedupe de formularios, lista de no contactar, check-in, RAG con PDF, modelos, agente en Instagram.
