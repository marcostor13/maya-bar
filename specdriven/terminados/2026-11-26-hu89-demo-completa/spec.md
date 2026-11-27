# HU89 — Demo completa · Spec

## Requisitos
- R1. Al restablecer la demo se crean, además de lo de HU86, datos de: campañas (WhatsApp,
  email, SMS, borradores) con destinatarios y aperturas/clics; plantillas de WhatsApp,
  de texto y de email; links cortos con clics de 30 días; formularios con envíos; listas
  estáticas y dinámicas; automatizaciones con ejecuciones; planes de recuperación;
  prospección con investigación; productos y cotizaciones; llamadas; bajas; regla y
  bitácora de reparto; notas, llamadas, tareas y cambios de etapa; reportes (fijados);
  bitácora de auditoría; documentos y revisión del agente de IA; puntaje de contactos;
  conversaciones de Instagram, Messenger y chat web; atribución al anuncio.
- R2. Nada queda en un estado que los procesos en segundo plano tomen para enviar o llamar
  a servicios externos (campañas `sent/draft`, ejecuciones terminadas, recuperación
  `done/review`, prospección `done`, llamadas cerradas, tareas vencidas ya recordadas).
- R3. Los valores con índice único global llevan un sufijo de la empresa: restablecer
  varias veces no choca.
- R4. Todo se borra al restablecer (cada documento lleva `tenantId`).
- R5. Datos ficticios coherentes con una clínica dental de Lima.

## Criterios de aceptación
- C1. e2e: tras restablecer, cada modelo de R1 tiene documentos.
- C2. e2e: con el usuario demo, las listas de cada módulo responden 200 y no vacías;
  el analytics incluye el canal instagram.
- C3. e2e: no hay campañas `scheduled/sending`, ejecuciones `active`, recuperación
  `analyzing/scheduled/sending`, búsquedas `searching` ni llamadas abiertas.
- C4. e2e: restablecer varias veces seguidas funciona (sin choques de índices únicos).
- C5. Build, lint y suites en verde.
