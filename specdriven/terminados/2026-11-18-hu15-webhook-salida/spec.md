# HU15 — Webhook de salida de la API de integraciones · Especificación

Historia: `hu.md` · Fecha: 2026-11-18 · Estado: aprobada

## Objetivo

Que el sistema de la empresa sepa sin consultar cuándo un mensaje enviado por
la API (HU13/HU14) se envía, entrega, lee o falla, y cuándo el contacto
responde en esa conversación.

## Usuarios

- Administrador (Integraciones): configura la URL y guarda el secreto.
- Sistema externo: recibe los avisos y comprueba la firma.

## Alcance

- Incluye: URL https por acceso, secreto HMAC (se muestra una vez, se puede
  rotar), eventos, reintentos con espera creciente, aviso de prueba y registro
  de los últimos avisos en pantalla.
- **Fuera de alcance:** avisos de mensajes que no salieron por la API (salvo
  respuestas en conversaciones donde el acceso escribió), reenvío manual de un
  aviso fallido, varias URLs por acceso.

## Requisitos (EARS)

- **R1** — Cuando el administrador guarda una URL de aviso en un acceso
  vigente, el sistema debe validarla (https, host público) y, si el acceso no
  tenía secreto, generar uno y mostrarlo una sola vez.
- **R2** — Cuando el administrador rota el secreto, el sistema debe generar
  uno nuevo y el anterior deja de firmar en ese momento. Quitar la URL deja
  de enviar avisos.
- **R3** — Cuando un mensaje enviado por un acceso con URL pasa a `sent`,
  `delivered`, `read` o `failed`, el sistema debe encolar un aviso
  `message.sent|delivered|read|failed` (uno por mensaje y evento, aunque el
  estado se notifique dos veces). Vale también para SMS (`sent`/`failed`).
- **R4** — Cuando llega un mensaje del contacto en una conversación donde el
  acceso envió algún mensaje, el sistema debe encolar `message.received`.
- **R5** — Cada aviso es un `POST` JSON con cabeceras `X-Maya-Event`,
  `X-Maya-Delivery`, `X-Maya-Timestamp` y `X-Maya-Signature: sha256=<hex>`,
  HMAC-SHA256 con el secreto sobre `<timestamp>.<cuerpo>`.
- **R6** — Si la URL no responde 2xx (o tarda más de 10 s), entonces el sistema
  debe reintentar a 1 min, 5 min, 30 min, 2 h y 6 h; tras 6 intentos el aviso
  queda `failed`.
- **R7** — Cuando el administrador abre los avisos de un acceso, el sistema
  debe mostrar los últimos 20 con evento, estado, intentos, último código HTTP
  y error.
- **R8** — Cuando el administrador pulsa «Enviar prueba», el sistema debe
  encolar un evento `ping`.
- **R9** (seguridad) — El secreto se guarda cifrado y nunca vuelve en las
  listas; la URL no puede apuntar a la red interna ni seguir redirecciones;
  todo aislado por empresa (404 entre empresas); el cuerpo del aviso no lleva
  datos que el acceso no podría ver ya.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1, R9 | Guardar `http://` o `https://127.0.0.1` → 400; https pública → 200 con `secret` una vez; la lista no lo trae | unitaria + e2e |
| C2 | R2 | Rotar devuelve otro secreto; quitar la URL borra `webhookUrl` y el secreto (el acceso queda sin aviso) | unitaria |
| C3 | R3 | Un mensaje por API que recibe acks `delivered` (dos veces) y `read` genera un aviso `delivered` y uno `read` | e2e API |
| C4 | R4 | Un entrante en esa conversación genera `message.received` con el texto | e2e API |
| C5 | R5 | La firma enviada coincide con HMAC(secreto, timestamp.cuerpo) | unitaria |
| C6 | R6 | Respuesta 500 → intento 1 pendiente a +1 min; al 6.º fallo `failed` | unitaria |
| C7 | R7, R8 | «Enviar prueba» crea un `ping` visible en la lista de avisos | e2e API + unitaria frontend |
| C8 | R9 | Otra empresa no ve ni cambia el webhook ni los avisos (404) | e2e API |
| C9 | R3 | Un SMS por API genera `message.sent` | unitaria |

## Supuestos y decisiones por defecto

- Los avisos se guardan 30 días (TTL).
- El primer intento sale al momento; el trabajador barre los pendientes cada 30 s.
- `message.received` solo para conversaciones donde el acceso escribió.

## Preguntas abiertas

- Ninguna.
