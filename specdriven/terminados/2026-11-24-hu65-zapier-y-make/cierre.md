# Cierre HU65 — Integración con Zapier y Make

## Qué quedó
- **Claves de automatización** (Integraciones → Uso de la clave): sin dominio; dan acceso a `/api/v1`. Las claves web siguen igual y reciben 403 en la API del CRM.
- **API del CRM:**
  - `me`.
  - Contactos: crear o actualizar (por email y luego teléfono), ver, buscar, `since` y etiquetas.
  - Oportunidades: crear (con contacto existente o nuevo) y listar.
  - Plantilla de WhatsApp: con `Idempotency-Key` y usando las reglas de envío de HU13 (bloqueo, no contactar).
- **REST hooks:**
  - Cinco disparadores.
  - Firma `X-Maya-Signature`; 410 borra.
  - Reintentos 0/5/30 s; desactivación tras 20 fallos.
  - Clave revocada → no se envía.
  - URL https pública (protección SSRF).
- **OpenAPI 3.0** en `/api/v1/openapi.json`.
- **Apps:** app de Zapier en `integrations/zapier/` (5 disparadores y 4 acciones) y app de Make en `integrations/make/`. La guía está en `docs/integraciones-zapier-make.md`.

## Verificación
spec-verifier sigue bloqueado por el hook, así que la verificación es propia:
- **C1 CUMPLE** — `test/api-crm.e2e-spec.ts` C1:
  - `POST /api/v1/hooks` → 201.
  - Crear un contacto desde la app llama a la URL con `{event:'contact.created', data:{contact}}`, con exactamente los campos documentados y la firma HMAC verificada.
  - Otra empresa no dispara los avisos de esta.
  - Al desuscribir dejan de llegar.
- **C2 CUMPLE** — e2e C2:
  - La especificación es OpenAPI 3.0.x.
  - Todas las `$ref` resuelven, los `operationId` son únicos, toda operación tiene respuestas y los parámetros de ruta están declarados.
  - Todos los esquemas compilan con Ajv.
  - Una respuesta real de `POST /contacts` y el ejemplo de hook validan contra sus esquemas.
- **Además:**
  - Acciones de crear y actualizar, etiquetas, oportunidad, `lead.stage_changed`, `message.received` y 410.
  - Aislamiento: clave web → 403; otra empresa → 404; sin clave → 401; clave revocada → 401.
  - `api-access.e2e` y `app.e2e` en verde (la ruta de OpenAPI se añadió a las públicas), unitarias de api-access 66/66, `integrations.spec` 14/14 y build y lint OK.

## Pendiente [usuario]
- Cuentas de desarrollador de Zapier y Make, y publicar las apps: los pasos están en `docs/integraciones-zapier-make.md`. Las apps no se probaron dentro de Zapier ni de Make.
