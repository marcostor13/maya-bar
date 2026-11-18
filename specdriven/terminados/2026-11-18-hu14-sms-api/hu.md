# HU14 — Enviar SMS desde la API de integraciones

## Historia

**Como** empresa que usa Maya CRM,
**quiero** crear un acceso de la API de integraciones (HU13) ligado a mi proveedor de SMS,
**para** enviar SMS desde mi web o mi sistema con la misma clave, dominios autorizados y límites.

## Contexto

HU13 dejó el SMS fuera de alcance: la API solo envía por WhatsApp, Instagram y Messenger.
El proveedor SMS genérico ya existe (ver la skill `maya-outbound-send`).

## Qué se espera

- En «Integraciones», poder elegir el proveedor SMS activo como cuenta del acceso.
- `POST /public/v1/messages` con `to` (número internacional) y `text` envía un SMS; respeta «No contactar» y los límites del acceso.
- El estado del envío se consulta igual (`GET /public/v1/messages/:id`).
- Queda registrado como el resto de envíos por API.
