# HU27 — Volver a contactar cuando venció la ventana de 24 h · Plan técnico

## Estado actual

- `backend/src/api-access/api-messages.service.ts`: `windowOpen` (24 h desde el
  último entrante) y `resolveTemplate` (valida aprobada, variables, cabecera);
  `templateVariableCount`/`renderTemplate` exportadas.
- `backend/src/conversations/conversations.service.ts`: `sendManual`,
  `retryMessage`, `finishDelivery`, `deliver`, `sendExternal` (plantilla vía
  `wa.sendCloudApiTemplate`), `sendFromAgent`. Ninguno mira la ventana.
- `inbox-tools.service.ts` `deliverOne`: programados por `sendManual` (un error
  deja el programado en fallido con su motivo).
- Frontend `pages/inbox/inbox.ts`: compositor sin noción de ventana ni plantillas.

## Diseño

- **Helpers puros** `backend/src/whatsapp-templates/template-send.ts`:
  `templateVariableCount`, `renderTemplate`, `resolveTemplateSend(template, input)`
  (la validación que hoy está en `resolveTemplate`). La API (HU13) pasa a usarlos.
- **Ventana** `backend/src/conversations/wa-window.ts`: `WINDOW_MS`, `windowExpiry(lastIn)`.
- **Datos**: `Message.template?: { name, language, variables, header? }` (para
  reintentar como plantilla y pintarla). Sin migración.
- **API** (conversaciones, `CRM_ROLES`):
  - `GET /conversations/:id/window` → `{ applies, open, expiresAt|null }`.
  - `GET /conversations/:id/templates` → aprobadas de la cuenta del chat (no
    AUTHENTICATION, multimedia solo con archivo guardado): `_id, name, language,
    category, body, headerType, headerText, footer, variables, headerVariables`.
  - `POST /conversations/:id/messages/template` `{ templateId, variables[], headerText?, clientId? }`.
- **Servicio**: `windowStatus(conv)`; `assertCanWriteFree(conv)` en `sendManual`
  (texto libre) y `retryMessage` (si no es plantilla); `sendTemplate(...)`
  (mismas reglas que `sendManual`: bloqueo, asignación, clientId); `deliver`
  entrega como plantilla si `msg.template`; `sendFromAgent` omite si cerrada.
- **Interfaz**: `pages/inbox/wa-template-picker.ts` (modal: lista, variables,
  vista previa, enviar). En `inbox.ts`: señal `waWindow`, `now` cada minuto,
  `windowExpiresAt` = máx(servidor, último entrante cargado + 24 h); aviso de
  tiempo restante; con la ventana cerrada, barra "Ventana cerrada" + "Enviar
  plantilla" en lugar del compositor; botón de plantilla también con ventana abierta.
- **Cálculo puro** `pages/inbox/wa-window.ts` (frontend) para probarlo aislado.

## Seguridad

`getConversation(id, tenantId)` aísla por tenant; la plantilla se busca por
`tenantId + accountId del chat + _id`; asignación y bloqueo como en `sendManual`;
DTO validado (`variables` ≤ 20, cada una ≤ 1024).

## Observabilidad

Log de agente omitido por ventana (id de conversación, sin contacto). El
operador ve el error de Meta en el mensaje fallido, como siempre.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Ventana de 72 h de anuncios: se bloquea texto válido | Supuesto conservador; plantilla siempre disponible |
| Reloj del dispositivo desfasado | `expiresAt` viene del servidor; el tick solo cuenta |
| Refactor de `resolveTemplate` rompe la API | Specs existentes de api-messages siguen pasando |

## Estrategia de pruebas

- Unitarias backend: helpers, `windowStatus`, bloqueo de texto, `sendTemplate`,
  `deliver` de plantilla, agente.
- e2e API `inbox-template.e2e-spec.ts`: ventana, plantilla, 409, 422, tenant, rol.
- Unitarias frontend: `wa-window.ts` y el picker.

## Fases

1. Backend completo (deja la bandeja igual, pero con 409 claro).
2. Interfaz.
