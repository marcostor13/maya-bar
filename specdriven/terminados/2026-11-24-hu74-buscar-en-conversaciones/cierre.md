# HU74 — Buscar dentro de las conversaciones · Cierre

- **Cerrada:** 2026-11-24
- **Estado:** Terminada (falta la prueba manual de C9 en el navegador)
- **Verificación (spec-verifier):** 8 CUMPLE, 1 NO VERIFICADO (C9, manual)
- **Commits:** sin commit

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Mensaje antiguo → chat con `match` y fragmento | CUMPLE | `backend/test/inbox-search.e2e-spec.ts` |
| C2 | Otra empresa no aparece | CUMPLE | e2e; filtro `tenantId` en `conversations.service.ts` (`searchMessages`) |
| C3 | 1 carácter no busca en mensajes | CUMPLE | e2e |
| C4 | Transcripción de audio | CUMPLE | e2e |
| C5 | Filtro de canal se respeta | CUMPLE | e2e |
| C6 | Caracteres de regex literales | CUMPLE | e2e + `search-snippet.spec.ts` |
| C7 | Fragmento ~90 caracteres con "…" | CUMPLE | `search-snippet.spec.ts` |
| C8 | Coincidencias marcadas | CUMPLE | `search-highlight.spec.ts` |
| C9 | Salto y resaltado al abrir | NO VERIFICADO | código en `inbox.ts` (`jumpToMatch`); prueba manual pendiente |

## Qué se implementó

- `GET /conversations?q=` (≥ 2 caracteres) busca también en `text`, `transcript` y `subject` de los mensajes de la empresa (sin los de sistema), máx. 500 coincidencias y 5 s; si falla, sigue sin ellas. Añade `match {messageId, at, snippet}`.
- Índice `Message {tenantId: 1, at: -1}`.
- Bandeja: placeholder "Buscar por nombre, número o mensaje"; fragmento con `<mark>`; al abrir salta al mensaje (hasta 10 páginas de 50) y lo resalta 2,5 s, o avisa con un toast.
- Tras el verificador: la carga de páginas del salto marca `loadingOlder` y descarta duplicados (carrera con el scroll).

## Lo que tiene que hacer el usuario

- Nada de configuración. Probar en la bandeja buscando una palabra de un mensaje antiguo.

## Pruebas

- `backend npm run build` → OK · `backend npm test` → 153 suites, 1816 pruebas OK
- `npx jest --config test/jest-e2e.json test/inbox-search` → 6 OK
- `frontend npx ng test frontend --watch=false` → 125 archivos, 1029 pruebas OK · `frontend npm run build` → OK (aviso previo: estilos de `inbox.ts` superan el presupuesto)

## Pendientes, riesgos y notas

- Empresas con muchísimos mensajes: la regex sin anclar puede llegar a los 5 s y entonces solo se busca por nombre/número (queda `logger.warn`). Si pasa, evaluar Atlas Search.
- Sin e2e para la coincidencia por `subject` de correo ni para filtros distintos del canal.
