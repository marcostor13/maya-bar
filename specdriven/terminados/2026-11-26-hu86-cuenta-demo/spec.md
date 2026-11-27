# HU86 — Cuenta demo con datos ficticios · Especificación

Historia: `backlog/hu86-cuenta-demo.md` · Fecha: 2026-11-26 · Estado: aprobada

## Objetivo

No existe ninguna cuenta con datos para enseñar Maya CRM: en una demo se vería todo
vacío o habría que abrir la cuenta de un cliente. El superadmin necesita una empresa
demo creíble que pueda regenerar en segundos antes de cada demo.

## Usuarios

- Superadmin: crea o restablece la demo y recibe los accesos.
- Quien hace la demo: entra con los accesos y muestra bandeja, embudo, contactos y agente.

## Alcance

- Incluye: empresa "Clínica Dental Sonrisa (demo)" marcada `demo: true`; 4 usuarios
  (1 administrador, 3 del equipo); 1 cuenta de WhatsApp de muestra sin credenciales;
  ~30 contactos; ~30 conversaciones de WhatsApp con mensajes (agente IA, equipo y
  cliente), con responsable, escaladas y sin leer; ~40 oportunidades en todas las etapas
  del embudo repartidas en 90 días; 1 agente de IA configurado para la clínica.
  Botón en el panel del superadmin (Empresas) con confirmación y accesos visibles una vez.
- **Fuera de alcance (fase 2):** campañas con resultados, plantillas, automatizaciones,
  formularios, chat web, base de conocimiento con embeddings, envío real de WhatsApp
  desde la demo (la cuenta de muestra no tiene token: enviar falla con error del proveedor).

## Requisitos (EARS)

- **R1** — Cuando el superadmin pulsa "Crear / restablecer demo", el sistema debe borrar la empresa demo anterior y todos sus datos, y crear una nueva con los datos de ejemplo.
- **R2** — El sistema debe generar una contraseña nueva aleatoria en cada restablecimiento, guardarla con bcrypt en los 4 usuarios y devolverla solo en esa respuesta.
- **R3** — Los datos deben ser ficticios (nombres inventados, teléfonos `51900000xxx`, correos `@demo.mayacrm.site`) y las fechas relativas al momento del restablecimiento, dentro de los últimos 90 días.
- **R4** — La empresa demo no debe tener cobros, prueba que vence ni límites de plan (`legacy`, plan Escala), ni generar avisos de cobro.
- **R5** — Seguridad: solo SUPERADMIN; el borrado solo puede afectar a la empresa con `demo: true`; nunca a otra.
- **R6** — Si una empresa real ya usa el correo o el slug de la demo, entonces el sistema debe negarse (409) sin borrar nada.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1, R3 | Dada una base vacía, cuando se restablece, entonces existen la empresa demo, 4 usuarios, 1 cuenta WA, ≥30 contactos, ≥30 conversaciones con mensajes, ≥40 oportunidades en las 7 etapas y 1 agente | e2e de servicio con Mongo en memoria |
| C2 | R1, R5 | Dado un segundo restablecimiento, entonces no quedan datos de la demo anterior y los de otra empresa siguen intactos | e2e de servicio |
| C3 | R2 | La respuesta trae correo y contraseña; la contraseña guardada es un hash bcrypt que valida | e2e de servicio |
| C4 | R3 | Generador determinista: fechas dentro de 90 días, teléfonos y correos ficticios | unitaria de `demo-data` |
| C5 | R4 | La empresa demo es `legacy`, plan `escala`, sin `trialEndsAt` ni `subscription` | e2e de servicio |
| C6 | R5 | No SUPERADMIN → 403 | unitaria del controlador |
| C7 | R6 | Empresa real con el correo de la demo → 409 y nada se borra | e2e de servicio |
| C8 | R1, R2 | Botón en Empresas: confirma, llama al API, muestra los accesos y avisa con toast | unitaria frontend |
| C9 | — | **[usuario]** Restablecer en producción y entrar con los accesos | manual |

## Supuestos

- Los 3 del equipo tienen rol `MANAGER` (ven toda la empresa: útil en una demo).
- El agente de IA queda con proveedor `auto`; responde con la IA de la plataforma (HU85) o las keys del servidor.
- Las etapas del embudo se siembran con las de fábrica (`LEAD_STAGES`).

## Preguntas abiertas

- Ninguna.
