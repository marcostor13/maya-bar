# HU40 — Catálogo único de planes y precios

## Historia

**Como** dueño de Maya,
**quiero** que los planes, precios y límites vivan en un solo lugar del backend,
**para** que la landing, el checkout, los límites y los comprobantes usen siempre las mismas cifras.

## Contexto (estado actual)

- `tenant.plan` admite `'starter' | 'pro' | 'enterprise'` (`backend/src/tenants/tenant.schema.ts:4`) con valor por defecto `starter`, y no limita nada.
- Los precios están escritos a mano en `frontend/src/app/pages/landing/landing.data.ts` (`PLANS`, `ADDONS`, `SETUP_PACKAGES`), con Inicia/Crece/Escala/Empresa a US$29/79/169 y S/ 89/249/549.
- `planExpiresAt` y `trialEndsAt` existen en el esquema pero nadie los usa.

## Propuesta

1. Nuevo módulo `billing` con `plans.catalog.ts`. Cada plan lleva:
   - `id` (`inicia|crece|escala|empresa`) y su nombre.
   - Precios por moneda (PEN sin IGV, USD) y por periodo (mensual, trimestral con −5 %, anual = 10 meses).
   - Límites: usuarios, números de WhatsApp, contactos, buzones, agentes IA, eventos activos, emails de campaña al mes y créditos de IA al mes.
   - Lista de funciones (`features`) que se usará para activar o bloquear módulos.
2. Precios recomendados en el benchmark: Inicia S/ 99, Crece S/ 249, Escala S/ 549 y Empresa a medida (US$29/79/169).
3. Migración: `starter→inicia`, `pro→crece`, `enterprise→escala`. Las empresas existentes quedan como `legacy: true`, sin límites, hasta que el superadmin decida.
4. `GET /public/plans` (sin autenticación, con caché) devuelve el catálogo para la landing y el checkout.
5. Cambiar un precio en el catálogo no cambia lo que ya paga un cliente: el precio pactado se guarda en su suscripción (HU48).

## Fuera de alcance

- Editar precios desde una pantalla de superadmin: por ahora se cambian en código.

## Criterios de aceptación (borrador)

- C1: `GET /public/plans` devuelve los 4 planes con precios PEN y USD para los 3 periodos y sus límites.
- C2: tras la migración, ninguna empresa queda con un valor de `plan` fuera del catálogo.
- C3: el precio trimestral es el mensual × 3 × 0,95 y el anual el mensual × 10, redondeados a entero (prueba unitaria).
