# HU89 — La demo muestra todas las funcionalidades · Cierre

- **Cerrada:** 2026-11-26
- **Estado:** Terminada
- **Verificación:** mecánica completa (spec-verifier no disponible por el mismo bloqueo de HU88).

## Criterios
| # | Estado | Evidencia |
|---|---|---|
| C1–C3 | CUMPLE | `test/demo.e2e-spec.ts` "HU89: todas las pantallas…" |
| C4 | CUMPLE | el mismo archivo restablece la demo 7 veces seguidas sin choques |
| C5 | CUMPLE | build, lint, unit, e2e API 317/317 |

## Qué trae la demo ahora
6 campañas (WhatsApp, email con aperturas y clics, SMS, 2 borradores), 5 plantillas de WhatsApp (aprobadas, pendiente, rechazada), 5 de texto, 3 de email, 5 links con ~360 clics de 30 días, 2 formularios con 15 envíos, 3 listas, 4 automatizaciones con 34 ejecuciones, 2 planes de recuperación, 7 prospectos (convenios corporativos) con investigación, 7 productos y cotizaciones por lead, 18 llamadas, 3 bajas, regla y bitácora de reparto, notas/llamadas/tareas/cambios de etapa, 4 reportes (2 fijados), bitácora de auditoría, 3 documentos y una revisión del agente de IA, puntaje de contactos, 6 conversaciones de Instagram/Messenger/web y atribución al anuncio.

## Riesgos conocidos
- Las tareas futuras de los leads disparan el recordatorio push al vencer (sin dispositivos ni WhatsApp: no sale nada).
- No hay calendario conectado (tokens cifrados) ni costos de WhatsApp por mensaje.
