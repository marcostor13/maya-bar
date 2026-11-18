# HU14 — Enviar SMS desde la API de integraciones · Plan técnico

## Estado actual

- `backend/src/api-access/`: accesos (HU13) con canales whatsapp/instagram/messenger.
- `backend/src/sms/sms.service.ts`: proveedor SMS genérico, `requireConfig`, `dispatch`, `toE164`.
- `frontend/src/app/pages/integrations/integrations.ts`: pantalla.

## Diseño

- **Datos:** `API_CHANNELS` + `'sms'`. Nueva colección `api_sms_messages`
  (`ApiSmsMessage`: tenantId, accessId, accessName, to, text, segments, status,
  error, providerId, idempotencyKey, at). Índice único parcial
  `(accessId, idempotencyKey)`.
- **API:** sin rutas nuevas. `ApiAccessService.accounts/ownedAccount/liveAccount`
  resuelven `sms` vía `SmsService.findConfig`. `ApiSmsService.send/status`.
  `PublicApiController` deriva a `ApiSmsService` si el acceso es `sms`.
- **Interfaz:** canal `SMS` (icono `MessageSquare`), doc y ejemplo con número.
- **Integración:** `SmsService.dispatch` (ya valida https y host público).

## Seguridad

Clave, origen e IP los valida `ApiKeyGuard` como en HU13. El proveedor se
revalida por empresa en cada envío. Log con número enmascarado.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Doble envío por reintento | Índice único de idempotencia + búsqueda previa |
| Proveedor lento | Timeout de 15 s del `SmsService` |

## Estrategia de pruebas

- Unitarias `api-sms.service.spec.ts`; e2e en `test/api-access.e2e-spec.ts`
  con `SmsService.dispatch` espiado; unitaria frontend de Integraciones.

## Fases

1. Backend + pantalla en una sola entrega.
