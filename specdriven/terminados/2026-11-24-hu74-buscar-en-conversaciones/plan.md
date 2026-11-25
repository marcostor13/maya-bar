# HU74 — Buscar dentro de las conversaciones · Plan técnico

## Estado actual

- `backend/src/conversations/conversations.service.ts` `listConversations`: `q`
  filtra solo `contact`, `contactName` y `lastMessagePreview` con regex escapada.
- `backend/src/conversations/message.schema.ts`: índices por `conversationId`;
  `tenantId` con índice simple.
- `frontend/src/app/pages/inbox/inbox.ts`: buscador con debounce de 300 ms; filas
  de mensaje con `id="msg-<id>"`; paginación hacia atrás con `before`.

## Diseño

- **Datos**: índice nuevo `Message {tenantId: 1, at: -1}`. Sin migración.
- **API**: `GET /conversations?q=` sin cambios de contrato salvo el campo nuevo
  opcional `match: { messageId, at, snippet }` en cada conversación.
  - Con `q.trim().length >= 2`: consulta de mensajes
    `{tenantId, author ≠ system, $or: [text, transcript, subject] ~ rx}` ordenada
    por `at` desc, `limit 500`, `maxTimeMS 5000`, proyección mínima. Primera
    coincidencia por conversación → mapa. Al `$or` de la conversación se añade
    `{_id: {$in: ids}}`. Tras la consulta, a cada conversación del mapa se le
    añade `match`.
  - Error de la consulta de mensajes (timeout) → se registra y se sigue sin ellos.
  - Helper puro `searchSnippet(text, q)` en `conversations/search-snippet.ts`.
- **Interfaz**: placeholder "Buscar por nombre, número o mensaje"; en la fila,
  si `c.match`, icono de búsqueda + fragmento con `<mark>`. Al abrir con
  `match`, se guarda `jumpTo`; tras cargar los mensajes se busca la fila; si no
  está, se cargan páginas anteriores (máx. 10); luego `scrollIntoView` y clase
  `.search-hit` 2,5 s. Helper puro `highlightParts(text, q)` en
  `inbox/search-highlight.ts`.

## Seguridad

Aislamiento: `tenantId` sale del JWT en ambas consultas. Inyección de regex:
`q` se escapa. Sin datos nuevos expuestos: el fragmento es de mensajes que el
usuario ya puede leer en la bandeja (mismos roles `CRM_ROLES`).

## Observabilidad

`logger.warn` si la búsqueda de mensajes falla o se corta (sin el texto buscado).

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Empresas con muchos mensajes: regex sin índice de texto | índice `{tenantId, at}`, `limit 500`, `maxTimeMS 5000`, fallback |
| Un chat con la coincidencia fuera de las 500 más recientes no aparece | aceptado y documentado; caso raro |
| El mensaje está muy atrás en el chat | carga hasta 500 mensajes; luego toast |

## Estrategia de pruebas

- Unitarias: `searchSnippet` (backend), `highlightParts` (frontend).
- e2e de API: `backend/test/inbox-search.e2e-spec.ts` (C1–C6).
- Manual: salto y resaltado en el navegador (C9).

## Fases

1. Backend + pruebas. 2. Frontend + pruebas. Cada fase es desplegable sola.

## ADRs

- No aplica (decisión regex vs `$text` anotada en la spec).
