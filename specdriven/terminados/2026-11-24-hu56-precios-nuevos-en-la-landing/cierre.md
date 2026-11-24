# HU56 — Precios nuevos en la landing · Cierre

## Resultado
- **C1 CUMPLE:** `dist/frontend/browser/index.html` contiene "S/ 99" y "S/ 249" en la FAQ y en el JSON-LD.
  - Las tarjetas se prerenderizan en dólares.
  - En el navegador pasan a soles si la zona horaria es `America/Lima`.
- **C2 CUMPLE:** el botón "Contratar Crece" en anual lleva a `/checkout?plan=crece&periodo=anual&moneda=…`.
- **C3 CUMPLE** (era PARCIAL; corregido). Comprobado de verdad:
  1. Se subió Crece a S/ 259 en `plans.catalog.ts` y `catalog:check` falló.
  2. `npm run catalog` regeneró el JSON con 259.
  3. Se restauró el precio y el check volvió a pasar.

## Hallazgos corregidos
Las cifras del copy que estaban a mano ahora salen del catálogo:
- agentes de IA;
- buzones;
- eventos activos;
- emails de campaña;
- precios de la FAQ de implementación;
- el % de descuento anual (`setup.annualCredit`).

Pruebas añadidas:
- moneda PEN, con `moneda=PEN` en el botón;
- banner de cupos fundador con `cupon=FUNDADOR`;
- cifras del copy salidas del catálogo.

## Decisiones y pendientes
- **Commit:** `frontend/src/app/shared/catalog.generated.json` es un archivo nuevo y tiene que ir en el commit. La imagen Docker del frontend lo necesita porque se construye sin el backend.
- **Puesta en marcha:** la historia decía "descontable del primer año". Se aplica la regla de HU55, que la landing ya explica: se descuenta hasta el 10 % del año, y en Inicia anual son S/ 99, no los S/ 490.
- **Recuperación llave en mano (S/ 690):**
  - Solo tiene precio en soles y no se cobra por el checkout; se vende por contacto.
  - Escala conserva la función `recovery` en el backend hasta HU66: la plataforma da más de lo que anuncia, y eso no rompe nada.
- **Registro:** ignora `plan` y `pago` en la URL, como ya pasaba antes de esta historia.

## Pruebas
- `landing.spec.ts`: 6 pruebas.
- `npm run catalog:check` pasa; es un paso de `npm run verify`.
