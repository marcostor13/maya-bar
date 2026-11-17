# HU13 — API de envío de mensajes por las cuentas conectadas · Cierre

- **Cerrada:** 2026-11-14
- **Estado:** Terminada con pendiente del usuario (prueba real, C17)
- **Verificación (spec-verifier):** 14 CUMPLE · 2 PARCIAL (C12, C15) · 1 [usuario]. Los PARCIAL se corrigieron después (ver abajo), sin segunda vuelta del verificador.
- **Commits:** sin commit
- **Decisión:** `specdriven/decisiones/0004-api-publica-claves.md`

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Estado | Evidencia |
|---|---|---|
| C1 clave una vez, solo hash y prefijo | CUMPLE | `api-access.service.ts` create/toView; unitaria y e2e C1 |
| C2 aislamiento por empresa y permiso | CUMPLE | `ownedAccount`; e2e C2 (404 otra empresa, 403 MANAGER) |
| C3 envío y mensaje en la bandeja | CUMPLE | `ConversationsService.sendExternal`; e2e C3 |
| C4 401 clave / 403 dominio o IP | CUMPLE | `ApiKeyGuard`, `originProblem`; unitarias y e2e C4 |
| C5 cuenta no disponible → 409 | CUMPLE | `liveAccount`; unitarias |
| C6 fuera de 24 h sin plantilla → 422 | CUMPLE | e2e C6 |
| C7 plantillas aprobadas con variables | CUMPLE | `resolveTemplate`; unitarias |
| C8 bloqueados / No contactar → 422 | CUMPLE | unitarias |
| C9 límites → 429 con Retry-After | CUMPLE | `consumeQuota`; unitaria y e2e C9 |
| C10 Idempotency-Key | CUMPLE | índice único parcial; e2e C10 |
| C11 estado del mensaje | CUMPLE | e2e C11 (otro acceso → 404) |
| C12 pantalla: crear, clave una vez, revocar | CUMPLE tras corrección | e2e `frontend/e2e/integrations.e2e.ts`; se añadió fecha de creación en la tarjeta. Copiar no tiene prueba automática (portapapeles) |
| C13 regenerar invalida la anterior | CUMPLE | unitaria |
| C14 cuerpo inválido → 400 | CUMPLE | e2e C14 |
| C15 logs sin clave ni contenido | CUMPLE tras corrección | log de envío con cuenta y destinatario enmascarado; los logs MOCK de Instagram/Messenger ya no muestran id completo ni texto |
| C16 etiqueta «API · nombre» en la bandeja | CUMPLE | e2e de navegador |
| C17 prueba real | [usuario] | — |

## Qué se hizo

- Backend `backend/src/api-access/`: esquemas `ApiAccess`/`ApiUsage`, servicios, `ApiKeyGuard`, controladores `/api-access` (admin) y `/public/v1/messages` (público).
- `Message` con `apiAccessId`, `apiAccessName`, `apiIdempotencyKey`; `sendCloudApiTemplate` devuelve el wamid.
- Permiso `integrations` (fijo para el administrador). Página `/integraciones` con documentación, diálogo de clave y ejemplos cURL/fetch; estado de error con reintento.
- El reintento automático (HU7) no reenvía como texto una plantilla fallida enviada por API.

## Lo que tiene que hacer el usuario

- Tras el deploy: crear un acceso para la cuenta de WhatsApp Cloud API, enviar con cURL desde un servidor con `Origin` autorizado y comprobar el mensaje en la bandeja con «API · nombre».

## Pruebas (2026-11-14, por partes por falta de memoria)

- Lint backend OK · build backend y frontend OK · `tsc --noEmit` backend OK.
- Unitarias backend 1608/1608 · e2e de API 89/89 · unitarias frontend 780/780 (+1 tras la corrección de C12) · e2e de navegador 24/24.

## Pendientes, riesgos y notas

- El dominio se comprueba con `Origin`/`Referer`: desde un servidor es un segundo control, no prueba identidad. Para un control fuerte, lista de IPs.
- El registro de envíos es log del servidor, no consultable en la plataforma.
- La cuota se consume también en peticiones que luego dan 409/422.
- Instagram no devuelve id del mensaje: los envíos por IG no pasan a entregado/leído.
- Una cuenta IG/Messenger activa sin token responde `sent` sin enviar (comportamiento anterior a HU13).
- Contactos de WhatsApp con BSUID (sin teléfono) no se alcanzan por número: exigen plantilla.
- Siguientes historias: `backlog/hu14.md` (SMS por API) y `backlog/hu15.md` (webhook de salida).
