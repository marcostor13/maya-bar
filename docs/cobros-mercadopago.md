# Cobros con Mercado Pago — configuración

Lo que tienes que hacer tú (no lo puede hacer la plataforma por ti) para que Maya cobre los planes.

## 1. Crear la aplicación

1. Entra a <https://www.mercadopago.com.pe/developers/panel/app> con la cuenta de Mercado Pago **de Perú** que va a recibir el dinero.
2. **Crear aplicación** → tipo "Pagos online" → producto **Checkout Pro** y **Suscripciones**.
3. En **Credenciales de prueba** copia `Access Token` y `Public Key` (para desarrollo).
4. En **Credenciales de producción** (las activa Mercado Pago tras completar los datos del negocio) copia las de producción.

## 2. Configurar el webhook

1. En la aplicación → **Webhooks** → **Configurar notificaciones**.
2. URL de producción: `https://<tu-dominio-api>/billing/webhooks/mercadopago`
3. Eventos: **Pagos**, **Planes y suscripciones** (`subscription_preapproval`) y **Pagos de suscripciones** (`subscription_authorized_payment`).
4. Guarda y copia la **Clave secreta** que muestra la pantalla.

## 3. Pegar las variables en Coolify

| Variable | Valor |
|---|---|
| `MP_ACCESS_TOKEN` | Access Token de producción (`APP_USR-…`) |
| `MP_PUBLIC_KEY` | Public Key de producción |
| `MP_WEBHOOK_SECRET` | Clave secreta del webhook |

Redespliega el backend.

## Cómo funciona

- Cada notificación se valida con la firma `x-signature`; sin firma válida responde 401 y queda en el log.
- El evento se guarda en `billing_events` (un reenvío no se procesa dos veces) y se responde 200 al instante.
- El estado **siempre** se toma de la API de Mercado Pago, nunca del cuerpo del webhook.
- Cada minuto se reintentan los eventos que fallaron; cada hora se concilian los pagos pendientes de más de 30 minutos.

## Probar

Con credenciales de prueba, usa el "Simulador de notificaciones" de la pantalla de Webhooks y las tarjetas de prueba de Mercado Pago.

## URLs que usa el checkout

- `FRONTEND_URL` (https en producción): de aquí salen las URL de vuelta (`/checkout/resultado`). Mercado Pago rechaza la suscripción mensual si no es https.
- `PUBLIC_API_URL`: de aquí sale `notification_url` (`/billing/webhooks/mercadopago`) de cada pago.
- Cobro en dólares: confirma en tu cuenta de Mercado Pago Perú que acepta USD. Si no los acepta, ofrece solo soles.

## Implementación (HU55)

- `ONBOARDING_BOOKING_URL` (backend, en Coolify): enlace para agendar la primera sesión (Calendly, Google Calendar…). Va en el correo "Agenda tu …" que recibe el cliente al pagar la implementación. Si queda vacío, el correo apunta a `/settings/plan`, que no sirve para agendar: configúralo antes de vender paquetes.
- Las tareas pagadas se ven en `/admin/onboarding` (superadmin) y a los superadmins les llega un aviso por correo.
