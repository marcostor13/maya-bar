# HU44 — Pantalla "Mi plan y consumo"

## Historia

**Como** administrador de una empresa cliente,
**quiero** ver mi plan, cuánto he usado, mis pagos y mis comprobantes,
**para** saber cuándo comprar más y descargar mis facturas sin pedirlas.

## Contexto (estado actual)

- No existe ninguna pantalla de suscripción.
- Configuración (`frontend/src/app/pages/settings/settings.ts`) tiene secciones con índice (HU39).

## Propuesta

Ruta `/settings/plan` (permiso `settings`, solo el rol de administrador de la empresa):

1. **Plan actual**:
   - Nombre, periodo, precio pactado y estado (prueba, activo, pago pendiente o cancelado).
   - Próxima fecha de cobro o de vencimiento.
   - Botones "Cambiar plan" y "Cancelar".
2. **Consumo del mes**: barras de usuarios, números, contactos, buzones, agentes, eventos, emails y créditos de IA, cada una con "Comprar más".
3. **Pagos**: fecha, concepto, monto, estado y enlace al comprobante (PDF/XML, HU49).
4. **Datos de facturación**: tipo de comprobante (boleta o factura), DNI o RUC, razón social, dirección y correo de facturación.

## Criterios de aceptación (borrador)

- C1: la pantalla muestra los límites y el uso real, que coinciden con `PlanLimitsService` y el saldo de créditos.
- C2: el historial lista los pagos con enlace de descarga del comprobante.
- C3: un usuario sin rol de administrador no ve la ruta.
- C4: en un móvil de 375 px se ve sin desplazamiento horizontal.
