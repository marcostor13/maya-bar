# HU54 — Precio fundador y cupones

## Historia

**Como** dueño de Maya,
**quiero** ofrecer −30 % de por vida a los primeros 30 clientes y crear cupones,
**para** conseguir los primeros casos de éxito y hacer promociones.

## Contexto (estado actual)

- No hay descuentos ni cupones. El benchmark recomienda un programa fundador (−30 % de por vida, solo en trimestral o anual, 30 cupos) a cambio de un caso de éxito.

## Propuesta

1. Colección `coupons`:
   - Código, tipo (% o monto fijo) y valor.
   - Planes y periodos válidos.
   - Duración: una vez, N meses o de por vida.
   - Cupos máximos y usados, vigencia y estado activo.
2. Cupón `FUNDADOR`: 30 %, de por vida, solo trimestral o anual, 30 cupos.
   - La landing muestra "Quedan N cupos fundador".
   - Al agotarse, deja de aplicarse.
3. El descuento queda guardado en la suscripción (precio pactado, HU48) y aparece en el checkout y en el comprobante como descuento.
4. CRUD de cupones en superadmin (HU57).
5. El cupo se reserva al crear el checkout y se libera si el pago no se aprueba en 24 h.

## Criterios de aceptación (borrador)

- C1: con `FUNDADOR`, Crece anual cuesta 2.490 × 0,7 = S/ 1.743 + IGV en el checkout y en el comprobante.
- C2: el cupón 31 se rechaza con "Cupos agotados".
- C3: `FUNDADOR` en periodo mensual se rechaza con el motivo.
