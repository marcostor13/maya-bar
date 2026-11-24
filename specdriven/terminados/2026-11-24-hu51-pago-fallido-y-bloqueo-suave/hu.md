# HU51 — Pago fallido, gracia y bloqueo suave

## Historia

**Como** dueño de Maya,
**quiero** que un cobro fallido dé días de gracia y luego limite la cuenta sin borrar nada,
**para** recuperar el pago sin perder al cliente ni regalar el servicio.

## Contexto (estado actual)

- La única restricción es la suspensión total del superadmin (HU16), que corta el login.

## Propuesta

1. Cobro mensual rechazado → `past_due`:
   - Mercado Pago reintenta según su política, y Maya avisa los días 0, 3 y 6 (HU50).
   - Banner rojo con "Actualizar medio de pago", que lleva a un nuevo `preapproval` o a un pago único.
2. **7 días de gracia** con todo funcionando.
3. Desde el día 8 → `expired`: **solo lectura**.
   - Se puede entrar, ver y exportar contactos y conversaciones.
   - No se puede enviar, crear ni importar, y el agente IA y las campañas se pausan.
   - Los mensajes entrantes siguen llegando para no perder clientes.
4. A los 60 días en `expired`: aviso al superadmin. Los datos no se borran automáticamente.
5. Al pagar, todo se reactiva en el momento: el agente y las campañas pausadas, también.

## Criterios de aceptación (borrador)

- C1: en `past_due` (día 3) se puede enviar mensajes; en `expired`, `POST` de envío responde 402 y `GET /customers/export` funciona.
- C2: en `expired`, un mensaje entrante de WhatsApp se guarda en la bandeja.
- C3: pagar en `expired` deja la cuenta `active` y el agente vuelve a responder.
