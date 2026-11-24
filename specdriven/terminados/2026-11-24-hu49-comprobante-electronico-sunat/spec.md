# HU49 — Comprobante electrónico SUNAT · Spec

## Objetivo

Cada pago aprobado en Perú recibe su boleta o factura electrónica válida, por correo y en Mi plan.

## Requisitos

- R1: interfaz `InvoiceProvider`, con Nubefact como implementación por defecto (`NUBEFACT_URL`, `NUBEFACT_TOKEN`). Se puede cambiar sin tocar el resto.
- R2: un pago aprobado deja su comprobante en cola dentro de `payment.receipt` (`pending`). Un intento inmediato y un cron por minuto lo emiten.
  - **Tipo**: factura (01) si hay RUC válido; boleta (03) si hay DNI, o sin documento si el total es menor de S/ 700.
  - **Serie** configurable (F001, B001, FC01, BC01) y correlativo atómico por serie (`invoice_counters`), reservado antes de llamar al proveedor.
  - **IGV**: 18 % separado del total.
  - **Descripción**: "Suscripción Maya CRM — Plan X (periodo) dd/mm–dd/mm".
  - **Datos del cliente**: los de facturación del checkout; si no están, los de la empresa.
- R3: se guardan el número, el PDF, el XML, el CDR y la aceptación de SUNAT. Se manda un correo con los enlaces al PDF y al XML una sola vez, al correo de facturación, al del comprador o al del administrador. "Mi plan" ya muestra el PDF y el XML (HU44).
- R4: un pago reembolsado con comprobante emitido genera una nota de crédito (07, tipo 6 devolución total) que referencia el original.
- R5: pagos en US$: `INVOICE_FOREIGN_MODE=receipt` (por defecto, queda `skipped`) o `export` (exportación sin IGV).
- R6: si el proveedor falla:
  - Se reintenta con espera exponencial, hasta 8 intentos; después queda en `failed`.
  - Si se cortó a mitad, se consulta el número ya reservado en lugar de duplicarlo.
  - El superadmin tiene la cola `GET /billing/admin/receipts` y el reintento `POST /billing/admin/receipts/:id/retry`.
  - El acceso del cliente no depende del comprobante.
- R7: guía para el usuario en `docs/facturacion-nubefact.md` y variables en `.env.example`.

## Fuera de alcance

- Pantalla de la cola para el superadmin (HU57). Correos con plantilla de marca (HU50).

## Criterios de aceptación

| # | Criterio | Prueba |
|---|---|---|
| C1 | Un pago de S/ 293,82 con RUC da una factura con base 249,00, IGV 44,82 y total 293,82 | `invoicing.e2e-spec.ts` (proveedor simulado + cuerpo de Nubefact) |
| C2 | El cliente recibe un correo con los enlaces al PDF y al XML | ídem |
| C3 | Un reembolso da una nota de crédito ligada a la factura original | ídem |
| C4 | Si el proveedor cae, el pago y el acceso siguen y el comprobante sale al reintentar, con el mismo número | ídem |
