# Cierre HU62 — Doble factor de acceso

## Qué quedó
- TOTP propio (sin dependencias) verificado con los vectores del RFC 6238; ±1 paso; el mismo código no sirve dos veces.
- Alternativa por correo. 10 códigos de respaldo de un solo uso (hash SHA-256), regenerables con la contraseña.
- `/auth/login` devuelve `{ twoFactorRequired, method, challengeToken }` o `{ twoFactorSetupRequired, reason, challengeToken }` sin tokens. Rutas: `verify`, `resend`, `enroll/start|confirm` (con reto), `status`, `setup`, `setup/confirm`, `backup-codes`, `disable`, `reset/:userId`, `policy`.
- Obligatorio por empresa (Configuración → Seguridad, solo administrador) y para el superadmin (`SUPERADMIN_2FA`, por defecto `required`; las e2e lo ponen en `optional` salvo la de HU62).
- "Recordar este dispositivo 30 días": marca JWT ligada a la fecha de activación.
- Usuarios → "Reiniciar 2FA" (administrador de la empresa; el superadmin a cualquiera).

## Verificación
- spec-verifier bloqueado por el hook (ver memoria). Autoverificación:
  - C1 CUMPLE — `test/two-factor.e2e-spec.ts` C1: sin código no hay `access_token`; código falso 401; TOTP válido entrega sesión; repetido 401; dispositivo recordado entra directo; desactivar exige contraseña.
  - C2 CUMPLE — e2e C2: el respaldo entra una vez (en mayúsculas incluso) y la segunda vez 401; quedan 9.
  - C3 CUMPLE — e2e C3: política de empresa → `twoFactorSetupRequired`; configura con el reto y recibe sesión y códigos; no puede desactivarlo (403) ni cambiar la política; otra empresa no lo reinicia (404); el admin sí y vuelve a pedirse.
  - Superadmin: con `SUPERADMIN_2FA=required` el login pide configurarlo.
- Pruebas: `totp.spec.ts` (3), e2e propia (4), unitarias de auth/users/mail 114, e2e auth/app/platform/provisioning en verde (lista de rutas públicas ampliada con las del reto), frontend login (+3), seguridad (2), usuarios (33), build OK.

## Pendiente
- **[deploy]** Al subir, el superadmin deberá configurar su 2FA en el primer login (o poner `SUPERADMIN_2FA=optional` temporalmente).
- Registrar en la auditoría los reinicios y usos de respaldo cuando exista HU63 (hoy quedan en el log).
- Entradas por enlace de acceso (HU47) y verificación de correo no pasan por el reto: son cuentas recién creadas sin 2FA; la obligación se aplica en su siguiente login.
