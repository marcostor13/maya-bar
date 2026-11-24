# HU68 — Plan

## Backend (`src/quotes/`)
- `quote-calc.ts`: cálculo puro, redondeando por línea.
- Esquemas `Product` y `Quote`.
- `quote-pdf.ts` (pdfkit).
- `QuotesService`:
  - Catálogo e importación WooCommerce (`WooStoreService.listAll`).
  - CRUD y numeración con índice único y reintento.
  - Envío: email con `sendHtml`; WhatsApp con `sendExternal` de tipo documento y comprobación de la ventana de 24 h.
  - Parte pública: ver, aceptar, rechazar y pagar.
  - `closeLead` cierra la oportunidad con `LeadsService.move` a la etapa `outcome=won` y fija `value`.
- `EventTicketsService` cede su conexión de Mercado Pago:
  - Hace públicos `sellerToken` y `notificationUrl`.
  - Añade `registerPaymentHandler('quo', …)`, y el mismo webhook de HU67 reparte los pagos por el prefijo de `external_reference`.

## Frontend
- `QuotesApiService`.
- Configuración → Productos.
- Ficha de la oportunidad → `app-lead-quotes`.
- `/cotizaciones/:id`, editor a pantalla completa con `app-form-page`.
- `/q/:token`, página pública.
