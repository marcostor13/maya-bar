# Índice del backlog — benchmark 2026-11-23

Origen: benchmark global de Maya CRM (artifact "Benchmark Maya CRM 2026") y
`docs/plan-comercial-maya-crm.md`. Orden recomendado de implementación.

## Bloque A — Cobrar: planes, Mercado Pago y comprobantes (P0)

Flujo completo que cubren: elegir plan → pagar en Mercado Pago → webhook confirma →
se crea o activa la cuenta → correo de confirmación con acceso → comprobante
electrónico SUNAT por correo → renovación, fallo, cambio y cancelación.

| HU | Título | Depende de |
|---|---|---|
| HU40 | Catálogo único de planes y precios | — |
| HU41 | Prueba gratis de 14 días real | HU40 |
| HU42 | Límites por plan aplicados | HU40 |
| HU43 | Créditos de IA medidos | HU40 |
| HU44 | Pantalla "Mi plan y consumo" | HU42, HU43 |
| HU45 | Conexión con Mercado Pago y webhook seguro | HU40 |
| HU46 | Checkout desde la landing y desde la cuenta | HU45 |
| HU47 | Alta y acceso automático a la cuenta tras el pago | HU46 |
| HU48 | Ciclo de vida de la suscripción y renovaciones | HU45, HU47 |
| HU49 | Comprobante electrónico SUNAT (boleta/factura) | HU47 |
| HU50 | Correos de cobro: confirmación, recibo, avisos | HU47, HU49 |
| HU51 | Pago fallido, gracia y bloqueo suave | HU48 |
| HU52 | Cambio de plan y cancelación | HU48 |
| HU53 | Add-ons y recargas de créditos | HU46, HU43 |
| HU54 | Precio fundador y cupones | HU46 |
| HU55 | Implementación de pago único descontable | HU46 |
| HU56 | Precios nuevos en la landing | HU40 |
| HU57 | Panel de suscripciones e ingresos (superadmin) | HU48 |

## Bloque B — Lo que se pide en la demo (P1)

| HU | Título |
|---|---|
| HU58 | Automatizaciones y secuencias |
| HU59 | Reparto automático round-robin |
| HU60 | Meta Lead Ads → contactos |
| HU61 | Aperturas y clics de email |
| HU62 | Doble factor de acceso (2FA) |
| HU63 | Registro de actividad (auditoría) |
| HU64 | Reportes configurables |
| HU65 | Integración con Zapier y Make |
| HU66 | Prueba real de recuperación, SMS y email antes de venderlos |

## Bloque C — Crecer (P2)

| HU | Título |
|---|---|
| HU67 | Pago en línea de entradas de eventos |
| HU68 | Cotizaciones desde la oportunidad |
| HU69 | Chat web para la página del cliente |
| HU70 | Puntaje de leads con IA |
| HU71 | App iOS |
| HU72 | Plan agencia y marca blanca |
| HU73 | Agente de IA por voz |

Fuera del backlog por ahora (no es para esta etapa): marketplace de apps,
objetos a medida, certificación SOC 2.

## Decisiones tomadas por defecto (revisables)

- Mensual = suscripción automática de Mercado Pago (tarjeta). Trimestral y anual
  = pago único por Checkout Pro (tarjeta, Yape, PagoEfectivo) con aviso de
  renovación; pueden pasar a suscripción si el usuario lo prefiere.
- Precios en soles + IGV para Perú; US$ para el resto de LATAM (Mercado Pago del
  país o, más adelante, Stripe).
- Comprobante SUNAT por un PSE/OSE con API (Nubefact por defecto). Mercado Pago no
  emite comprobantes SUNAT.
- Los mensajes de Meta siguen fuera del plan, sin recargo.
