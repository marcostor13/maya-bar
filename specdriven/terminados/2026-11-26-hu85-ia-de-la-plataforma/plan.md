# HU85 — IA de la plataforma gratis · Plan técnico

## Estado actual

- `backend/src/ai/ai.service.ts:67` combina keys de empresa con las de entorno; `:80` `metered` comprueba y descuenta créditos salvo `byok`.
- `backend/src/billing/ai-credits.service.ts:188` `record` anota créditos y costo (`costUsd` 0 si `byok`).
- `backend/src/recovery/recovery-analysis.service.ts:117` exige créditos salvo key propia de DeepSeek.
- `backend/src/prospecting/prospecting-research.service.ts:77` `hasAi` usa `hasAnyKey` (síncrono).
- No existe configuración global editable por el superadmin; las keys de servidor viven en `.env`.

## Diseño

- **Datos:** colección `platform_ai_settings`, documento único `key: 'default'`:
  `enabled`, `provider`, `model`, `apiKeyEnc` (SecretBox), `keyLast4`, `updatedBy`, timestamps.
  `usage_ledger` gana `platformAi?: boolean` (aditivo, sin migración).
- **Servicio** `PlatformAiService` (`backend/src/ai/platform-ai/`): `active()` con caché 30 s →
  `{provider, model, apiKey} | null`; `view()`; `save(dto, actor)`; `listModels(provider, apiKey?)`; `test(dto)`.
- **AiService:** recibe `PlatformAiService` (`@Optional`). `platformFor(apiKeys)` devuelve la
  cuenta si está activa y la empresa no tiene keys. `chat`/`chatMessages` la usan en lugar del
  proveedor pedido; `metered` en modo plataforma no comprueba créditos y anota `platform: true`.
  `hasAnyKey` → async; nuevo `platformFor` público para la recuperación y la vista del agente.
- **API (SUPERADMIN):** `GET/PUT admin/platform-ai`, `POST admin/platform-ai/models`, `POST admin/platform-ai/test`.
  **Empresa:** `GET ai-agents/platform-ai` → `{active, provider?, model?}`.
- **Interfaz:** página `/admin/ai` "IA de la plataforma" (card con interruptor, proveedor, key tipo
  password con pista `••••1234`, modelo con listado y "Otro", botones Probar y Guardar, toasts),
  enlace en el menú PLATAFORMA. Aviso en Avanzado del agente.

## Seguridad

Superadmin verificado en el servidor; key cifrada en reposo; respuestas con `keyLast4`;
auditoría sin la key (sin `bodyFields` sensibles); DTO validado (proveedor en lista, longitudes).
Los errores del proveedor en "Probar" se devuelven sin la key.

## Observabilidad

`Logger` al guardar (proveedor, modelo, id del actor). Consumo en `usage_ledger` con `platformAi`.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Gasto sin tope del dueño | Consumo registrado por empresa (panel de costos existente); se desactiva al instante |
| Key inválida rompe la IA de todos | Botón Probar antes de guardar; desactivar vuelve al flujo anterior |
| Gemini sin herramientas | Aviso en la pantalla |

## Estrategia de pruebas

Unitarias backend (servicio, controlador, AiService, créditos, recuperación) y frontend
(página admin, aviso del agente). Manual del usuario en producción.

## Fases

1. Backend completo (desplegable: sin configuración no cambia nada).
2. Interfaz admin y aviso en el agente.

## ADRs

- No aplica: no cambia proveedor ni librería; es configuración aditiva.
