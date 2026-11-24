# Cierre HU68 — Cotizaciones desde la oportunidad

## Qué quedó
- **Configuración → Productos:** catálogo propio (MANAGER y TENANT_ADMIN) e importación de una tienda WooCommerce (actualiza lo ya importado).
- **Ficha de la oportunidad:** sección "Cotizaciones" con número, estado y total, y el botón "Nueva".
- **Editor `/cotizaciones/:id`** (pantalla completa):
  - Ítems del catálogo o libres, con cantidad, precio, % de descuento y "precio con IGV".
  - IGV de 18 %, 10.5 % o exonerado; validez, notas y opción de pago en línea.
  - Totales en vivo.
  - Acciones: PDF, WhatsApp, Email y Guardar. Copiar el link público.
  - Si está cerrada, queda en solo lectura.
- **Envío:**
  - Email: link y PDF.
  - WhatsApp: el PDF va como documento al chat (exige la ventana de 24 h; si está cerrada, lo explica).
  - Cada envío queda en el historial de la oportunidad.
- **Link público `/q/:token`:**
  - Muestra logo, ítems y totales, con los botones Aceptar, Rechazar (con motivo opcional) y Pagar.
  - La primera visita marca la cotización como "Vista".
  - Una cotización vencida no se acepta.
  - Al volver de Mercado Pago muestra un aviso según `?pago=`.
- **Pago:** Checkout Pro en la cuenta de Mercado Pago que la empresa conectó en HU67, sin comisión de Maya. El webhook de HU67 reparte por prefijo (`quo:`) y es idempotente.
- **Cierre:** al aceptar o pagar, la oportunidad pasa a la etapa ganada (`outcome=won`) con `value` igual al total, y queda la actividad en el historial.

## Verificación
spec-verifier sigue bloqueado por el hook, así que la verificación es propia:
- **C1 CUMPLE:**
  - `src/quotes/quote-calc.spec.ts` 4/4: IGV incluido y sumado, descuento, redondeo por línea, exonerado y valores inválidos.
  - e2e `test/quotes.e2e-spec.ts` C1:
    - Subtotal 925.40, IGV 166.57 y total 1091.97; numeración COT-0001 y COT-0002.
    - Otra empresa recibe 404.
    - El texto extraído del PDF contiene el número, la empresa, el cliente, los ítems, "S/ 925.40", "IGV (18%)", "S/ 166.57", "S/ 1,091.97" y las notas.
  - El cálculo del frontend se probó con los mismos valores.
- **C2 CUMPLE** — e2e:
  - Se envía por email con el link; WhatsApp sin cuenta da 400; el link la marca "viewed".
  - Al aceptar, la oportunidad queda `status: won` y `value: 1091.97`, con las actividades "enviada por email" y "aceptada por el cliente".
  - Volver a aceptarla o editarla da 409.
- **Además:**
  - Un rechazo no gana la oportunidad y una cotización vencida da 409.
  - Pago: la preferencia usa el token de la empresa y `quo:<id>`; un pago pendiente no gana; uno aprobado y repetido queda pagado una sola vez y gana la oportunidad.
  - Catálogo por empresa; una URL de tienda no pública da 400.
- **Pruebas y build:**
  - e2e `app`, `event-tickets` y `quotes`: 17/17.
  - Unitarias del backend afectadas: 115/115.
  - Frontend: 1013/1014. El que falló es `campaign-editor` por tiempo bajo carga; solo pasa 16/16.
  - Build y lint OK.
- Dependencia nueva: `pdfkit` (y `@types/pdfkit`).

## Pendiente [usuario]
Probar un envío real por WhatsApp (documento por URL pública: `PUBLIC_API_URL` debe ser accesible por Meta) y un pago real con la cuenta conectada.
