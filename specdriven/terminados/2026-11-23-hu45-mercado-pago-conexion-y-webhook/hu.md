# HU45 — Conexión con Mercado Pago y webhook seguro

## Historia

**Como** dueño de Maya,
**quiero** que la plataforma reciba y valide las notificaciones de Mercado Pago,
**para** que ningún pago se pierda ni se pueda falsificar.

## Contexto (estado actual)

- No hay ninguna integración de pagos: no se encontró Mercado Pago, Culqi, Stripe ni Izipay en el código.
- Ya hay webhooks entrantes que responden 200 y procesan después (WhatsApp), con su trampa conocida: los e2e deben esperar el resultado.

## Propuesta

1. Variables de entorno: `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY` y `MP_WEBHOOK_SECRET`, con credenciales de prueba en desarrollo y en los e2e.
2. Cliente `MercadoPagoClient` en `billing/` sobre la API REST, con timeout y reintentos:
   - Preferencias de Checkout Pro (pago único).
   - `preapproval` (suscripción).
   - Consulta de pagos y reembolsos.
3. `POST /billing/webhooks/mercadopago`:
   - Valida la firma `x-signature` (HMAC-SHA256 con `ts`, `data.id` y `x-request-id`). Si no es válida, responde 401 y deja registro.
   - Guarda el evento en bruto en `billing_events` con un índice único por `id de evento + tipo` (idempotencia).
   - Responde 200 al instante y lo procesa en un worker.
   - Nunca confía en el cuerpo: vuelve a consultar el pago o la suscripción a la API de Mercado Pago antes de cambiar estados.
4. Tipos que maneja: `payment`, `subscription_preapproval` y `subscription_authorized_payment`.
5. Cron de conciliación cada hora: consulta en Mercado Pago los pagos pendientes de más de 30 minutos, por si un webhook no llegó.
6. **[usuario]** Crear la aplicación en Mercado Pago Developers con la cuenta de Perú, configurar la URL del webhook y pegar las credenciales en Coolify.

## Fuera de alcance

- Stripe y otros países: historia aparte cuando haya demanda.

## Criterios de aceptación (borrador)

- C1: un webhook con la firma alterada recibe 401 y no cambia nada.
- C2: el mismo evento enviado dos veces se procesa una sola vez.
- C3: si el cuerpo dice `approved` pero la API dice `rejected`, se usa lo que dice la API (e2e con Mercado Pago simulado).
- C4: un pago aprobado sin webhook se concilia en la siguiente corrida del cron.
