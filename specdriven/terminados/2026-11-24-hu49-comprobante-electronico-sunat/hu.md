# HU49 — Comprobante electrónico SUNAT (boleta o factura)

## Historia

**Como** cliente que paga Maya en Perú,
**quiero** recibir por correo mi boleta o factura electrónica válida ante SUNAT,
**para** sustentar el gasto en mi contabilidad.

## Contexto (estado actual)

- No hay facturación electrónica (no se encontró SUNAT ni Nubefact). Mercado Pago **no** emite comprobantes SUNAT: solo un recibo propio.
- El checkout (HU46) recoge el tipo de comprobante, el DNI o RUC, la razón social y la dirección.

## Propuesta

1. Integración con un PSE/OSE por API; **Nubefact** por defecto, detrás de la interfaz `InvoiceProvider` para poder cambiarlo.
2. Al confirmar un `payment`:
   - **Factura** (01) si hay RUC; **boleta** (03) si hay DNI, o sin documento si el monto es menor de S/ 700.
   - Serie y correlativo los asigna el proveedor.
   - IGV del 18 % desglosado y descripción "Suscripción Maya CRM — Plan Crece (mensual) dd/mm–dd/mm".
3. Guarda el número, el PDF, el XML y el CDR (o su enlace). Envía el PDF y el XML al correo de facturación (HU50) y los muestra en "Mi plan" (HU44).
4. **Reembolso** o anulación → **nota de crédito** (07) que referencia el comprobante.
5. Pagos en US$ desde fuera de Perú: factura de exportación de servicios (sin IGV) o solo recibo, según la configuración del superadmin.
6. Fallo del proveedor: reintentos con espera y una cola visible para el superadmin. El acceso del cliente **no** depende del comprobante.
7. **[usuario]**:
   - RUC activo y emisor electrónico habilitado ante SUNAT.
   - Cuenta en Nubefact (o similar), con su token y la ruta de su API en Coolify.
   - Confirmar con su contador la serie y el tratamiento del IGV.

## Criterios de aceptación (borrador)

- C1: un pago de S/ 293,82 (S/ 249 + IGV) con RUC genera una factura con base de 249,00, IGV de 44,82 y total de 293,82 (prueba con el proveedor simulado).
- C2: el cliente recibe un correo con el PDF y el XML adjuntos o enlazados.
- C3: un reembolso genera una nota de crédito ligada a la factura original.
- C4: si el proveedor cae, el pago y el acceso siguen activos y el comprobante se emite al reintentar.
