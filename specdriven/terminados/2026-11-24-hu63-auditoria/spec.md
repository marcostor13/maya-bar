# HU63 — Registro de actividad (auditoría) · Especificación

Historia: `hu.md` · Fecha: 2026-11-24 · Estado: aprobada

## Objetivo
Ver quién hizo qué y cuándo en la cuenta.

## Alcance
- Incluye: colección `audit_log` (empresa, usuario, correo, rol, acción, recurso, id, resumen sin datos sensibles, resultado, IP, dispositivo, fecha) con TTL de 12 meses; decorador `@Audit` + interceptor global que registra al terminar bien; registro manual de inicios de sesión (correctos, fallidos y con 2FA). Acciones: login y 2FA, usuarios y roles, exportaciones e importaciones, borrado de contactos y conversaciones, conexión/desconexión de canales, claves de API, cambios de plan y complementos, acciones del superadmin sobre una empresa (quedan en el registro de esa empresa). Pantalla Configuración → Registro de actividad con filtros por usuario, acción y fechas, paginación y CSV.
- **Fuera de alcance:** cobros entrantes por webhook de Mercado Pago (ya tienen su propio historial de pagos); cada edición de contacto u oportunidad (ya están en sus bitácoras).

## Requisitos (EARS)
- **R1** — Cuando un usuario exporta contactos, el sistema debe registrar el usuario, la cantidad y la fecha.
- **R2** — El sistema debe mostrar a cada administrador solo los registros de su empresa.
- **R3** — El sistema nunca debe guardar contraseñas, tokens ni códigos en el registro.

## Criterios de aceptación
| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | Exportar los contactos deja un registro con el usuario, la cantidad y la fecha | e2e |
| C2 | R2 | Un usuario de una empresa no ve los registros de otra | e2e |
