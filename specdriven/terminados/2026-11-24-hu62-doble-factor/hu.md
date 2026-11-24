# HU62 — Doble factor de acceso (2FA)

## Historia

**Como** administrador de una empresa cliente,
**quiero** exigir un segundo factor al iniciar sesión,
**para** que una contraseña filtrada no exponga mis contactos y conversaciones.

## Contexto (estado actual)

- El login es solo con correo y contraseña más JWT y refresh. No existe 2FA (no se encontró `totp` ni `mfa`).

## Propuesta

1. 2FA con app de autenticación (TOTP): configuración con QR y 10 códigos de respaldo de un solo uso, guardados con hash.
2. Alternativa: código por correo para quien no use app.
3. El administrador de la empresa puede hacerlo **obligatorio** para todo su equipo.
4. El superadmin tiene 2FA obligatorio.
5. "Recordar este dispositivo 30 días" (cookie firmada).
6. Recuperación con un código de respaldo o un reinicio hecho por el administrador o el superadmin (HU17/HU19), registrado en la auditoría (HU63).

## Criterios de aceptación (borrador)

- C1: con 2FA activo, el login sin código no entrega tokens; con un código TOTP válido, sí.
- C2: cada código de respaldo sirve una sola vez.
- C3: con 2FA obligatorio en la empresa, un usuario sin 2FA debe configurarlo antes de entrar.
