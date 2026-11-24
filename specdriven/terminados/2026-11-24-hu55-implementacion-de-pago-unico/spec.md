# HU55 — Implementación de pago único descontable · Spec

## Alcance

### Catálogo (`billing/setup.catalog.ts`)
- `puesta`: Puesta en marcha, S/ 490 / US$ 149.
- `pro`: Implementación Pro, S/ 1.490 / US$ 449.
- Cada paquete trae su checklist. Precios sin IGV, iguales a la landing.

### Descuento
- Con el plan anual, el paquete se descuenta del total, hasta el 10 % del precio de lista del año.
- En mensual y trimestral no hay descuento.
- La implementación no cambia el monto del plan que se repite.

### Checkout
- Selector "Lo configuro yo / Puesta en marcha / Implementación Pro", también por `?implementacion=`.
- La cotización (`?setup=`) devuelve `setup` (precio, descuento, IGV y total) y `dueToday`.
- Pago único (trimestral o anual): el plan y la implementación van en la misma preferencia, como 2 ítems.
- Mensual: se crea el `preapproval` del plan y, en el mismo paso, una preferencia aparte para la implementación (`<publicId>:setup`).
- La pantalla de resultado ofrece "Pagar …" mientras la implementación no esté pagada.

### Al pagarse la implementación
- Se marca una sola vez (`setup.paidAt`).
- Se crea la tarea de onboarding (`onboarding_tasks`, una por compra) con el contacto, el paquete, el plan y la checklist.
- Se envía un correo al cliente con el enlace para agendar (`ONBOARDING_BOOKING_URL`) y un aviso a los superadmins.

### Panel del superadmin
- `/admin/onboarding`, con la opción "Implementaciones" en el menú.
- Lista con filtro por estado (`pending`, `scheduled`, `in_progress`, `done`).
- Se puede cambiar el estado y marcar los pasos de la checklist.
- API: `GET /billing/admin/onboarding` y `PATCH /billing/admin/onboarding/:id`.

### Comprobante (HU49)
- Plan e implementación en el mismo pago: dos líneas. La de la implementación lleva su descuento.
- Pago aparte en mensual: una línea, "Servicio de implementación: …".

### Landing
- La nota de los paquetes pasa a "Se descuenta del plan anual (hasta el 10 % del año)".

## Fuera de alcance
- Agenda integrada: es un enlace externo configurable.
- Contratar la implementación después de la compra del plan.

## Criterios de aceptación
- **C1:** Crece anual con la puesta en marcha muestra la línea de S/ 490 y el descuento correspondiente, y el total coincide con la preferencia de Mercado Pago.
- **C2:** tras el pago aparece la tarea de onboarding en el panel del superadmin.
