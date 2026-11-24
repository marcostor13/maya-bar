# HU41 — Prueba gratis de 14 días real

## Historia

**Como** empresa que se registra en Maya,
**quiero** 14 días gratis con todo el plan Crece y saber cuántos me quedan,
**para** probar con mi equipo antes de pagar, tal como promete la landing.

## Contexto (estado actual)

- La landing promete "14 días gratis, sin tarjeta" (`landing.data.ts`, `GUARANTEES`).
- `AuthService.registerTenant` (`backend/src/auth/auth.service.ts:225`) crea la empresa y el usuario, pero **no** llena `trialEndsAt`. Hoy la prueba no vence nunca.
- La suspensión ya existe (`TenantsService.isActive`, caché de 60 s) y corta login, JWT y API keys.

## Propuesta

1. Al registrarse: `subscription.status = 'trialing'`, `plan = 'crece'` y `trialEndsAt = ahora + 14 días`.
2. Banner en el shell con los días restantes y el botón "Elegir plan" (lleva al checkout, HU46). Desde el día 11 el banner pasa a tono de aviso.
3. Al vencer sin pagar, la cuenta queda en **solo lectura** (`expired`), sin borrar datos:
   - Puede entrar, ver y exportar, pero no enviar ni crear.
   - Los agentes de IA y las campañas se pausan.
   - Ver el bloqueo suave en HU51.
4. Correos los días 10, 13 y 14 (los envía HU50).
5. El superadmin puede alargar la prueba de una empresa.

## Fuera de alcance

- Pedir tarjeta al registrarse.

## Criterios de aceptación (borrador)

- C1: una empresa nueva tiene `trialEndsAt` a 14 días y el plan `crece`.
- C2: con la prueba vencida, `POST` de envío de mensajes responde 402 con el mensaje "Tu prueba terminó, elige un plan"; `GET` sigue funcionando.
- C3: el banner muestra los días restantes correctos (prueba con reloj simulado).
