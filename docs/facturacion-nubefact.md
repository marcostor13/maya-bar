# Comprobantes electrónicos SUNAT con Nubefact

Maya emite sola la boleta o factura de cada pago aprobado y la manda por correo al cliente. Si el pago se reembolsa, emite la nota de crédito. Para que funcione tienes que hacer lo siguiente.

## 1. Antes de empezar (SUNAT y contador)

- Tu RUC debe estar activo y habilitado como **emisor electrónico** ante SUNAT.
- Confirma con tu contador:
  - Las **series** que vas a usar. Por defecto son F001 para facturas, B001 para boletas, FC01 para notas de crédito de factura y BC01 para notas de crédito de boleta.
  - Que el **IGV es del 18 %** incluido en el precio. Maya separa la base y el IGV del total cobrado.
  - Qué hacer con los **pagos en dólares desde fuera de Perú**: solo recibo de Mercado Pago (la opción por defecto) o factura de exportación de servicios sin IGV.

## 2. Cuenta en Nubefact

1. Crea tu cuenta en https://www.nubefact.com y registra las series que acordaste con tu contador.
2. En **Configuración → API (Integración)** copia la **RUTA** (una URL) y el **TOKEN**.
3. Haz primero las pruebas en el modo demo de Nubefact y pasa a producción cuando estés listo.

## 3. Variables en Coolify (backend)

| Variable | Valor |
|---|---|
| `NUBEFACT_URL` | La RUTA de tu cuenta |
| `NUBEFACT_TOKEN` | El TOKEN |
| `INVOICE_SERIES_FACTURA` | `F001`, o la que uses |
| `INVOICE_SERIES_BOLETA` | `B001` |
| `INVOICE_SERIES_NC_FACTURA` | `FC01` |
| `INVOICE_SERIES_NC_BOLETA` | `BC01` |
| `INVOICE_FOREIGN_MODE` | `receipt` (solo recibo) o `export` (factura de exportación) |

Si las series ya tienen comprobantes emitidos, dímelo antes del primer cobro: hay que arrancar el correlativo en el número siguiente (colección `invoice_counters`).

## Cómo funciona

- **Tipo de comprobante:**
  - Con RUC válido sale una **factura**.
  - Con DNI sale una **boleta**.
  - Sin documento, se emite boleta solo si el monto es menor de S/ 700.
- **Si Nubefact falla:** el pago y el acceso del cliente no se afectan. El comprobante se reintenta con esperas crecientes. Tras 8 intentos queda en la cola del superadmin, en `GET /billing/admin/receipts`, desde donde se reintenta a mano con `POST /billing/admin/receipts/:id/retry`.
- **Correlativo:** el número se reserva antes de enviar. Si se corta a mitad, el reintento consulta el comprobante en Nubefact en lugar de duplicarlo.
- **Dónde lo ve el cliente:** el PDF y el XML aparecen en **Configuración → Mi plan y consumo**, en el historial de pagos.
