# HU63 — Registro de actividad (auditoría)

## Historia

**Como** administrador de una empresa o superadmin,
**quiero** ver quién hizo qué y cuándo en la cuenta,
**para** resolver dudas, detectar abusos y cumplir lo que pide una empresa mediana.

## Contexto (estado actual)

- Hay bitácora por contacto y por oportunidad, pero no un registro de acciones de usuarios: exportar, borrar, cambiar permisos, iniciar sesión, cambiar el plan, etc.

## Propuesta

1. Colección `audit_log`:
   - Campos: `tenantId`, `userId`, acción, recurso, id, resumen del cambio (sin datos sensibles), IP, dispositivo y fecha.
   - Retención: 12 meses.
2. Acciones registradas:
   - Inicio de sesión (correcto o fallido) y 2FA.
   - Usuarios y roles.
   - Exportaciones e importaciones.
   - Borrado de contactos y conversaciones.
   - Conexión y desconexión de canales.
   - Claves de API.
   - Cambios de plan y cobros.
   - Acciones del superadmin sobre una empresa.
3. Pantalla en Configuración, con filtros por usuario, acción y fechas, y exportación a CSV.

## Criterios de aceptación (borrador)

- C1: exportar los contactos deja un registro con el usuario, la cantidad y la fecha.
- C2: un usuario de una empresa no ve los registros de otra.
