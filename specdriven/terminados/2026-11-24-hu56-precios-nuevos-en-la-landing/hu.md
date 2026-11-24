# HU56 — Precios nuevos en la landing

## Historia

**Como** visitante de la landing,
**quiero** ver los precios vigentes, el pago trimestral y un botón que me lleve a pagar,
**para** decidir y suscribirme en el momento.

## Contexto (estado actual)

- `frontend/src/app/pages/landing/landing.data.ts` tiene los precios escritos a mano: S/ 89/249/549, mensual o anual.
- La landing está prerenderizada (SSR); ver la memoria `landing_seo_ssr`. Los precios deben quedar en el HTML para SEO.

## Propuesta

1. Precios del benchmark:
   - Inicia: S/ 99 (US$29); Crece: S/ 249; Escala: S/ 549.
   - Selector mensual, trimestral (−5 %) y anual (2 meses gratis).
   - Soles por defecto con la zona horaria `America/Lima`, como hoy.
2. Contenido de cada plan:
   - Inicia: 1 evento activo y prospección con créditos.
   - Escala: recuperación de clientes solo tras HU66; mientras tanto, como servicio "Campaña de recuperación llave en mano, S/ 690".
3. "Puesta en marcha S/ 490, descontable del primer año" en lugar de "gratis con anual".
4. Botones de cada plan → `/checkout?plan=…&periodo=…` (HU46), además de "Probar 14 días gratis" (registro).
5. Contador de cupos fundador (HU54) cuando el cupón esté activo.
6. Los datos salen del catálogo (HU40): se leen en el build o el prerender para que el HTML siga trayendo los precios.

## Criterios de aceptación (borrador)

- C1: el HTML prerenderizado contiene "S/ 99" y "S/ 249".
- C2: el botón de Crece anual lleva a `/checkout?plan=crece&periodo=anual`.
- C3: cambiar un precio en el catálogo y volver a generar el build cambia la landing sin tocar `landing.data.ts`.
