# HU72 — Plan agencia y marca blanca

## Historia

**Como** agencia de marketing,
**quiero** gestionar a mis clientes como sub-cuentas de Maya con mi marca y mi dominio,
**para** revenderlo como mi propio servicio.

## Contexto (estado actual)

- La arquitectura es multitenant con `tenantId`. `tenant.branding` (logo, favicon y colores) ya existe y se usa en las landings de eventos (HU26). Hay dominio propio para landings (HU25).
- No hay sub-cuentas ni relación agencia → clientes (no se encontró `subaccount`).
- Referencia: GoHighLevel (US$97/297/497).

## Propuesta

1. Empresa de tipo `agency` con `childTenants`. El usuario de la agencia cambia entre sub-cuentas sin volver a iniciar sesión.
2. Marca blanca: logo, colores, nombre de la app y dominio propio del panel (`crm.agencia.com`), y correos salientes con la marca de la agencia.
3. Plan Agencia: por ejemplo, S/ 990/mes con 5 sub-cuentas Crece y sub-cuenta extra a precio mayorista. Facturación a la agencia (HU48).
4. Panel de la agencia: uso y estado de cada cliente.
5. Opcional, en una fase 2: la agencia cobra a sus clientes (reventa con su propio Mercado Pago).

## Criterios de aceptación (borrador)

- C1: un usuario de la agencia ve y entra en sus 5 sub-cuentas y no en otras.
- C2: el panel servido en el dominio de la agencia muestra su logo y su nombre, sin "Maya".
