# HU53 — Add-ons y recargas · Spec

## Alcance
- **Catálogo** (`billing/addons.catalog.ts`). Precios sin IGV, iguales a la landing.
  - Mensuales:
    - `extra_user`: +1 usuario, S/ 39 / US$ 12.
    - `extra_whatsapp`: +1 número, S/ 49 / US$ 15.
    - `extra_contacts`: +10.000 contactos, S/ 35 / US$ 10.
  - Recargas:
    - `credits_1000`: S/ 49 / US$ 15.
    - `credits_5000`: S/ 199 / US$ 59.
    - `emails_10000`: S/ 29 / US$ 9.
- **Compra en un paso** (`POST /billing/addons/buy`, solo TENANT_ADMIN).
  - Abre un Checkout Pro de pago único, más IGV en PEN.
  - El enlace vence a los 30 min.
- **Add-on mensual:** requiere un plan pagado activo y sin cancelar.
  - Hoy se cobra el prorrateo hasta el fin del periodo, en cualquier periodicidad.
  - Al aprobarse:
    - suma el límite en `addons` y la cantidad en `addonItems`;
    - sube `subscription.amount`;
    - en mensual con `preapproval`, sincroniza el monto en Mercado Pago (cron de HU52);
    - en trimestral o anual, entra en el precio de la próxima renovación.
  - Los cambios de plan (HU52) conservan los add-ons en el precio.
- **Recarga:** se puede comprar también en prueba.
  - Suma al saldo (`aiCreditsPurchased` o `campaignEmailsPurchased`) y renueva el vencimiento a 12 meses.
  - Si la recarga anterior ya venció, el saldo viejo no se suma.
  - Se gasta después de lo incluido en el plan.
  - Los emails de campaña que pasan del cupo del mes se descuentan atómicamente de la recarga al encolar; si no alcanza, 402.
- **Comprobante (HU49) y correo de pago confirmado (HU50):** como cualquier compra, con la descripción del add-on.
- **UI:**
  - Sección "Extras y recargas" (`#addons`) en Mi plan.
  - El botón "Comprar add-on" del aviso de límite lleva ahí.

## Fuera de alcance
- Quitar add-ons mensuales contratados: soporte, a mano.
- Comprar varias unidades a la vez desde la UI: la API acepta `qty`, pero la UI compra de a una.

## Criterios de aceptación
- **C1:** comprar 1.000 créditos aprobados sube el saldo en 1.000 y genera un comprobante.
- **C2:** un usuario extra en Inicia permite crear el 3.er usuario y suma S/ 39 al siguiente cobro mensual.
