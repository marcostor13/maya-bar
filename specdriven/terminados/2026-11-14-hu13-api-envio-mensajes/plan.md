# HU13 — API de envío de mensajes · Plan técnico

## Estado actual

- Envío por canal: `ConversationsService.deliver` (privado,
  `backend/src/conversations/conversations.service.ts` ≈ 1330) usa
  `WhatsAppService.sendMessage`, `MessengerService.sendMessage`,
  `InstagramService.sendMessage`. Plantillas: `WhatsAppService.sendCloudApiTemplate`
  (no devuelve el wamid). `upsertConversation`/`touchConversation` privados.
- Ventana de 24 h: solo en `message-retry.service.ts` (`WINDOW_MS`).
- "No contactar": `SuppressionService.isSuppressed`; bloqueos:
  `BlockedContactsService.isBlocked`.
- Permisos: `roles/modules.catalog.ts`, `ModuleGuard`, `ADMIN_LOCKED_MODULES`.
- No existe ningún esquema de claves de API.

## Diseño

- **Datos**
  - `ApiAccess` (`api_accesses`): `tenantId`, `name`, `channel`
    (`whatsapp|instagram|messenger`), `accountId`, `keyHash` (único),
    `keyPrefix`, `allowedDomains[]`, `allowedIps[]`, `perMinuteLimit`,
    `perDayLimit`, `revokedAt?`, `createdBy`, `lastUsedAt?`, `sentCount`.
  - `ApiUsage` (`api_usages`): `accessId`, `bucket` (`m:<min>` / `d:<día>`),
    `count`, `expiresAt` (TTL). Único `{accessId, bucket}`.
  - `Message`: `apiAccessId?`, `apiAccessName?`, `apiIdempotencyKey?`; índice
    único parcial `{apiAccessId, apiIdempotencyKey}`.
- **API**
  - Admin (JWT + `ModuleGuard('integrations')`), `/api-access`: `GET /`,
    `GET /accounts`, `POST /`, `PATCH /:id`, `POST /:id/regenerate`,
    `POST /:id/revoke`.
  - Pública (`ApiKeyGuard`), `/public/v1/messages`: `POST`, `GET /:id`.
- **Servicios**
  - `ApiAccessService`: CRUD, generación/hash de clave, `authenticate(key)`,
    `checkOrigin`, `consumeQuota` (dos `findOneAndUpdate` con `$inc` + upsert).
  - `ApiMessagesService`: validaciones (cuenta, bloqueos, "No contactar",
    plantilla, ventana) y llamada a `ConversationsService.sendExternal`.
  - `ConversationsService.sendExternal(...)` (nuevo, público): upsert de la
    conversación, crea el `Message`, entrega (texto/medio con `deliver`, o
    plantilla) y guarda estado; reutiliza los helpers privados.
  - `WhatsAppService.sendCloudApiTemplate` devuelve el wamid.
- **Interfaz**
  - Página `/integraciones` (`pages/integrations/integrations.ts`): lista
    (tarjetas/tabla), estado vacío, formulario en `app-form-page`, diálogo con
    la clave una sola vez + botón copiar + ejemplos, revocar/regenerar con
    `ConfirmService`, sección de documentación.
  - Menú Gestión → "Integraciones"; ruta con `moduleGuard('integrations')`.
  - Bandeja: etiqueta "API · nombre" en la burbuja.

## Seguridad

- Claves de 256 bits; solo hash en BD; comparación por índice (sin timing
  útil: el hash es la clave de búsqueda).
- Aislamiento: el acceso fija tenant y cuenta; la cuenta se revalida en cada
  envío; `GET` filtra por `apiAccessId`.
- Dominio (`Origin`/`Referer`) + IP opcional (`req.ip`, `trust proxy` 1).
- Límites por acceso; `mediaUrl` solo `https`.
- Logs sin clave ni contenido; destinatario enmascarado.

## Observabilidad

- Log por envío: acceso, canal, destinatario enmascarado, resultado.
- En la pantalla: último uso y nº de envíos por acceso. Fallos visibles en la
  bandeja (mensaje en rojo, como hoy).

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Clave filtrada | Dominio + IP opcional, límites, revocar/regenerar al instante |
| Spam fuera de ventana | Regla de 24 h y plantillas aprobadas (Meta) |
| Reintentos del cliente duplican | `Idempotency-Key` |
| `conversations.service.ts` crece | Solo un método fino; la lógica de validación va en `api-access/` |

## Estrategia de pruebas

- Unitarias: `api-access.service.spec.ts` (claves, dominios, IPs, cuotas,
  regenerar/revocar, aislamiento), `api-messages.service.spec.ts` (ventana,
  plantillas, bloqueos, idempotencia, estado).
- e2e de API: `test/api-access.e2e-spec.ts` (crear, enviar con proveedor mock,
  401/403/429, idempotencia, GET de estado).
- e2e de navegador: crear, ver clave, revocar.
- Manual [usuario]: envío real con cURL.

## Fases

1. Backend completo (esquemas, servicios, controladores, pruebas).
2. Frontend (página, menú, ruta, etiqueta en la bandeja) + e2e de navegador.

## ADRs

- `decisiones/0004-api-publica-claves.md`: claves con hash, dominio por
  `Origin` como segundo control, límites en Mongo.
