# HU28 — Lista de eventos cómoda en el móvil · Cierre

- **Cerrada:** 2026-11-22
- **Estado:** Terminada
- **Verificación (spec-verifier):** no ejecutado: el hook de context-mode modifica la llamada y el modo automático la rechaza. Autoverificación: 5 CUMPLE.
- **Commits:** sin commit (se integran al final del lote HU28–HU39)

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Local único se elige solo; con varios, el último | CUMPLE | `events-filter.ts` `pickLocal`; `events.ts` `selectLocal` + `localStorage`; `events.spec.ts` |
| C2 | Tarjeta tocable; "Asistentes" abre su pestaña | CUMPLE | `events.ts` `article (click)/(keydown.enter)`, `openEventDetail(ev, 'registrations')`; spec |
| C3 | Compartir nativo o modal con QR local; sin `api.qrserver.com` | CUMPLE | `events.ts` `share`, `renderQr` (`qrcode`); spec; grep sin coincidencias |
| C4 | Próximos/Pasados/Borradores con orden | CUMPLE | `events-filter.ts` `filterEvents`; spec |
| C5 | Táctil: hover condicionado, ≥ 44 px, variables, overlay sin padding | CUMPLE | `events.ts` estilos (`@media (hover: hover)`, `min-height:44px`, `.overlay` sin padding) |

## Qué se implementó

- **Local**: se elige solo si hay uno y, si hay varios, se recuerda el último en el dispositivo; el selector solo aparece cuando hay varios.
- **Tarjeta**: entera tocable y accesible con teclado.
- **Acciones con texto**:
  - Encargado: "Compartir" y "Asistentes", y un menú "⋯" con Editar, Ver página pública y Eliminar (este con confirmación).
  - Impulsador: "Compartir mi link" con `?ref=`.
- **Compartir**: usa el menú nativo del móvil; si no existe, un modal con QR generado en el navegador y descargable como PNG.
- **Filtro** Próximos/Pasados/Borradores con contadores; se corrige el desfase de un día al formatear la fecha.

## Lo que tiene que hacer el usuario

- Nada.

## Pruebas

- Frontend: `npx ng test frontend --watch=false` → 891/891 (93 archivos) · `npm run build` OK (incluye HU31).

## Pendientes, riesgos y notas

- El filtro y el orden son en el cliente (la lista por local es pequeña).
