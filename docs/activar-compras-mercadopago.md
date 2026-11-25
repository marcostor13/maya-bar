# Activar las compras con Mercado Pago — paso a paso

Checklist para que un cliente pueda comprar un plan de Maya desde la landing o
desde su cuenta y quede activado solo. El detalle técnico de cada parte está en
[`cobros-mercadopago.md`](cobros-mercadopago.md) y
[`facturacion-nubefact.md`](facturacion-nubefact.md).

**Estado en producción (2026-11-24, noche):** `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`,
`MP_WEBHOOK_SECRET`, `MP_CLIENT_ID`, `MP_CLIENT_SECRET` y `ONBOARDING_BOOKING_URL`
ya están en Coolify (credenciales de producción `APP_USR-`). Nubefact no está
configurado: la facturación es manual (sección 5).

Todo lo de abajo lo haces tú: son tus cuentas, tus credenciales y tus datos
fiscales.

## 1. Cuenta de Mercado Pago lista para cobrar

1. Usa la cuenta de Mercado Pago **Perú** que va a recibir el dinero (de
   preferencia una cuenta de empresa a nombre del RUC).
2. Completa los datos del negocio y la cuenta bancaria para retirar.
3. Si vas a cobrar en dólares, confirma en tu cuenta que acepta USD. Si no,
   vende solo en soles.

## 2. Crear la aplicación y sacar las credenciales

1. Entra a <https://www.mercadopago.com.pe/developers/panel/app> con esa cuenta.
2. **Crear aplicación** → "Pagos online" → productos **Checkout Pro** y
   **Suscripciones**.
3. **Credenciales de producción** → copia el **Access Token** (`APP_USR-…`) y
   la **Public Key**. Mercado Pago las activa cuando completas los datos del
   negocio.

## 3. Configurar el webhook

1. En la aplicación → **Webhooks** → **Configurar notificaciones** → modo
   **Productivo**.
2. URL: `https://api.mayacrm.site/billing/webhooks/mercadopago`
3. Eventos: **Pagos**, **Planes y suscripciones** y **Pagos de suscripciones**.
4. Guarda y copia la **Clave secreta**.

## 4. Pegar las variables en Coolify (backend → Environment)

| Variable | Valor | ¿Obligatoria? |
|---|---|---|
| `MP_ACCESS_TOKEN` | Access Token de producción | Sí |
| `MP_PUBLIC_KEY` | Public Key de producción | Sí |
| `MP_WEBHOOK_SECRET` | Clave secreta del webhook | Sí: sin ella el webhook responde 401 y los pagos no activan la cuenta |
| `ONBOARDING_BOOKING_URL` | Tu enlace de Calendly/Google para agendar la implementación | Solo si vendes el paquete de implementación |
| `MP_CLIENT_ID` / `MP_CLIENT_SECRET` | Client ID / Secret de la app | Solo para vender entradas de eventos con la cuenta de cada empresa (HU67) |

Luego **Redeploy** del backend.

## 5. Aviso de ventas y facturación manual (HU75)

- Cada pago aprobado manda un correo **"Nueva venta"** a `admin@ignia.site`
  con el plan, el monto, el medio de pago, el id de Mercado Pago, el comprador
  y sus datos de facturación (RUC/DNI, razón social, dirección). Para cambiar
  el destino: `SALES_NOTIFY_EMAIL` en Coolify (varios separados por coma).
- **Maya no emite boletas ni facturas** mientras `INVOICING_AUTO` no sea
  `true`. Cada pago queda en **Panel → Facturación → Comprobantes → Por
  facturar**. Emite el comprobante tú y pulsa **Marcar facturado** (puedes
  anotar la serie y número, p. ej. `B001-15`).

## 6. Facturación automática con Nubefact (pendiente)

Cuando quieras que Maya emita sola: configura Nubefact y pon
`INVOICING_AUTO=true`. Los pagos anteriores siguen en "Por facturar". Pasos en [`facturacion-nubefact.md`](facturacion-nubefact.md):
emisor electrónico ante SUNAT, series con tu contador, cuenta en Nubefact y
las variables `NUBEFACT_URL` y `NUBEFACT_TOKEN` (más las series si no son las
de por defecto).

## 7. Probar con una compra real

1. En una ventana privada, entra a <https://mayacrm.site>, elige un plan
   **mensual** y paga con tu propia tarjeta.
2. Comprueba:
   - Vuelves a `/checkout/resultado` con el pago aprobado.
   - Llega el correo con el acceso a la cuenta nueva y entras.
   - En **Configuración → Mi plan y consumo** aparece el plan y el pago (y el
     comprobante, si configuraste Nubefact).
   - Como superadmin, la suscripción aparece en el panel de suscripciones.
   - Llega el correo "Nueva venta" a admin@ignia.site y el pago aparece en "Por facturar".
3. Si algo falla, el log del backend en Coolify dice por qué (firma del webhook,
   credenciales o pago rechazado).
4. Cancela esa suscripción desde **Mi plan** y pide el reembolso desde tu panel
   de Mercado Pago (o déjala como cuenta propia).

> Para probar sin dinero real: usa las **credenciales de prueba** y las
> tarjetas de prueba de Mercado Pago en un entorno de pruebas, nunca en
> producción con clientes. Mercado Pago no mezcla pagos de prueba y reales.

## 8. Abrir la venta

- Los precios de la landing salen del catálogo de planes (HU40/HU56). Revisa
  que sean los que quieres cobrar antes de anunciar.
- Cupones y precio fundador (HU54) se crean desde el panel de superadmin.
