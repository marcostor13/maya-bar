# HU62 — Doble factor de acceso · Especificación

Historia: `hu.md` · Fecha: 2026-11-24 · Estado: aprobada

## Objetivo
Que una contraseña filtrada no baste para entrar a la cuenta.

## Alcance
- Incluye: TOTP (RFC 6238, compatible con las apps habituales) con QR y clave manual; alternativa por código de correo (10 min, 5 intentos); 10 códigos de respaldo de un solo uso guardados con hash; obligatorio por empresa (lo fija el administrador); obligatorio para el superadmin (`SUPERADMIN_2FA`, por defecto `required`); "recordar este dispositivo" 30 días (marca firmada, deja de valer al reiniciar o reactivar); reinicio por el administrador de la empresa o el superadmin; anti-repetición del mismo código TOTP.
- **Fuera de alcance:** registro en la auditoría (llega con HU63); SMS como segundo factor.

## Requisitos (EARS)
- **R1** — Mientras un usuario tenga 2FA activo, cuando inicia sesión con la contraseña correcta, el sistema debe devolver un reto y no tokens.
- **R2** — Cuando el código del reto es válido, el sistema debe abrir la sesión; si no, rechazarla.
- **R3** — Cuando se usa un código de respaldo, el sistema debe invalidarlo.
- **R4** — Mientras la empresa exija 2FA, un usuario sin 2FA debe configurarlo antes de recibir tokens y no puede desactivarlo.

## Criterios de aceptación
| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1, R2 | Con 2FA activo el login sin código no entrega tokens; con un TOTP válido sí | e2e |
| C2 | R3 | Cada código de respaldo sirve una sola vez | e2e |
| C3 | R4 | Con 2FA obligatorio, el usuario sin 2FA lo configura antes de entrar | e2e |
