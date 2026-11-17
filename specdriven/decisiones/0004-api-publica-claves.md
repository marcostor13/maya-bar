# 0004 — Claves de API por cuenta, con dominio autorizado y límites en Mongo

- **Fecha:** 2026-11-14 · **Estado:** aceptada
- **Historia:** hu13

## Contexto

Las empresas quieren enviar mensajes por sus cuentas conectadas (WhatsApp,
Instagram, Messenger) desde su propio servidor. Hasta ahora toda la API exigía
la sesión (JWT) de una persona. El usuario pidió además que el acceso solo
funcione desde los dominios que la empresa autorice.

## Decisión

- Un **acceso** = una clave secreta ligada a **una** cuenta y a un tenant. Se
  guarda solo su hash SHA-256 (que es también la clave de búsqueda, índice
  único) y un prefijo visible; la clave se muestra una vez.
- Autenticación `Authorization: Bearer mk_…` en un guard propio (`ApiKeyGuard`),
  separado del JWT.
- **Dominio autorizado** comprobado con la cabecera `Origin` (o `Referer`).
  Desde un servidor esa cabecera la pone quien llama: es un segundo control,
  no una prueba de identidad. Para un control fuerte hay lista opcional de IPs
  (`req.ip`, con `trust proxy` 1 detrás de Traefik).
- **Límites** por minuto y por día con contadores en Mongo (`api_usages`,
  `$inc` atómico + TTL), válidos con varias instancias del backend.
- **Idempotencia** con índice único parcial `{apiAccessId, apiIdempotencyKey}`
  en `messages`.
- El envío reutiliza el camino de la bandeja (`ConversationsService.sendExternal`):
  el mensaje queda en la conversación y recibe los estados por los webhooks.

## Alternativas consideradas

- Verificar la propiedad del dominio con un registro DNS TXT — no limita desde
  dónde se llama, solo prueba la propiedad; más fricción. Queda para el futuro.
- Comparar la IP de quien llama con la IP a la que resuelve el dominio — falla
  con CDNs y funciones serverless, cuya IP de salida no es la del dominio.
- Uso desde el navegador (CORS abierto) — expone la clave; fuera de alcance.
- Throttler en memoria — no sirve con varias instancias.

## Consecuencias

- Positivas: aislamiento por cuenta y tenant; revocar/regenerar al instante;
  reutiliza envíos, estados, reintentos y bandeja.
- Negativas / costes: la comprobación de dominio desde servidor es débil por
  diseño (documentado en la pantalla); dos escrituras en Mongo por envío para
  los límites.
