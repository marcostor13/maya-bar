---
name: maya-outbound-send
description: Reglas para cualquier envío saliente o masivo en Maya CRM (email, SMS, WhatsApp) y para los links cortos con seguimiento - variables, lista de no contactar, lotes en segundo plano, estado por destinatario, proveedor SMS genérico y captura de clics. Úsala al tocar campañas, plantillas, SMS o links.
---

# Envíos salientes y links — Maya CRM

Diseño acordado en `docs/plan-campanas-links.md` (sección 2). Esto es el
resumen operativo.

## 1. Variables

- Sintaxis única, llaves simples: `{nombre}`, `{primer_nombre}`, `{email}`,
  `{telefono}`, `{empresa}`, `{link}`, `{baja}`, `{campo:clave}`.
- Todo pasa por `backend/src/shared/contact-tokens.ts`. **Prohibido** un
  `.replace(/\{nombre\}/…)` suelto: si falta una variable, se añade al motor.
- `{{1}}`, `{{2}}` son de las plantillas de Meta; no se mezclan.
- El frontend ofrece las variables como chips que se insertan en el cursor y
  muestra vista previa con un contacto de ejemplo. El catálogo de variables lo
  sirve el backend, no se duplica a mano.
- En HTML de email los valores sustituidos se **escapan**; en texto plano no.

## 2. A quién se envía

- Audiencia: todos, etiquetas, listas (`ListsService.resolveCustomers`) o ids
  elegidos a mano. Siempre deduplicada.
- **Lista de no contactar**: `SuppressionService.filterAllowed` al resolver la
  audiencia y `isSuppressed` otra vez justo antes de cada envío (puede haber
  cambiado). Un bloqueado queda `skipped`, no `failed`.
- Email sin dirección o SMS sin teléfono válido → `skipped` con motivo.
- Todo email masivo lleva link de baja (`{baja}` o el pie automático) y
  cabecera `List-Unsubscribe`. La baja es un endpoint público que añade a
  `suppression`.

## 3. Cómo se envía

- **Nunca dentro de la petición HTTP** ni con `Promise.allSettled` sobre toda
  la audiencia. "Enviar" solo materializa los destinatarios en
  `campaignrecipients` (`pending`) y marca la campaña `sending`/`scheduled`.
- Un `@Cron` por minuto toma campañas con bloqueo atómico (`lockedUntil`),
  procesa un lote, guarda `sent|failed|skipped` + `error` + `providerId` por
  destinatario y actualiza contadores. Patrón: `recovery.service.ts` `tick()`.
- Al arrancar no se marca nada como fallido: el siguiente tick reanuda.
- Reintentos: máximo 2 por destinatario y solo ante errores transitorios.
- Teléfonos: normalizar a E.164 con el prefijo por defecto de la empresa.

## 4. Proveedor de SMS

- Interfaz `SmsProvider.send({ to, from, message })` → `{ id?, raw }`.
- Implementación única `http`: el usuario define URL, método, cabeceras y
  cuerpo con `{to}`, `{message}`, `{from}`; el éxito se decide por código HTTP
  y, opcionalmente, por un campo del JSON. Los presets solo rellenan el form.
- Credenciales cifradas con `SecretBox`. La URL debe ser `https` y no apuntar
  a red privada (misma defensa SSRF que `contact-import`).
- Segmentos: 160 caracteres GSM-7 (153 por parte si hay varias) y 70 UCS-2
  (67 por parte). Tildes y emojis fuerzan UCS-2: avísalo en el editor.

## 5. Links cortos

- `GET /l/:code` en el dominio de la API y `GET /:code` cuando el `Host` es un
  dominio corto verificado. Responde `302` (no `301`: el navegador lo cachea y
  se pierden clics) con `Cache-Control: no-store`.
- El clic se registra **sin retrasar** la redirección y nunca la rompe: si
  guardar falla, se redirige igual.
- Se guarda: IP (primer valor de `X-Forwarded-For`), user-agent crudo y
  desglosado, `Accept-Language`, `Referer`, query string, cookies recibidas,
  visitante (`mlv`, cookie propia de 1 año), contacto y campaña si el link es
  personal, y `isBot`.
- Bots y previsualizadores (`facebookexternalhit`, `WhatsApp`, `TelegramBot`,
  `Slackbot`, `bot|crawler|spider|preview`, peticiones `HEAD`) se guardan
  marcados y se excluyen de los totales por defecto.
- Destinos: solo `http(s)`. Códigos: base62 de 7 caracteres, únicos por dominio.
- Un link personal pertenece a un contacto; `{link}` en una campaña lo crea al
  materializar el destinatario.
- Dominio propio: registro `A` a `SERVER_IP` + añadirlo a `SHORT_LINK_DOMAINS`
  y `npm run provision` (Traefik necesita el dominio en la app para enrutar y
  emitir el certificado). La app solo verifica el DNS y muestra el estado.

## 6. Verificación

Además del build y las pruebas del módulo, cada cambio aquí debe tener una
prueba unitaria de: sustitución de variables, filtro de no contactar, y que un
fallo de un destinatario no detiene el lote.
