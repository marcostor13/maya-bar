# HU64 — Reportes configurables

## Historia

**Como** gerente comercial,
**quiero** armar y guardar mis propios reportes (ventas por vendedor, por origen, por etapa y por periodo),
**para** no depender del dashboard fijo ni de exportar a Excel.

## Contexto (estado actual)

- El dashboard es fijo:
  - KPIs comparados, canal, mapa de calor y tiempos de respuesta.
  - Datos por usuario (HU20) y costos de mensajes (HU18).

## Propuesta

1. Constructor sencillo:
   - **Fuente**: oportunidades, contactos, conversaciones, campañas o eventos.
   - **Métrica**: conteo, suma de monto, tasa de conversión o tiempo medio.
   - **Agrupar por**: vendedor, etapa, origen, canal, etiqueta o fecha (día, semana o mes).
   - **Filtros** y **visualización**: tabla, barras o línea.
2. Guardar reportes, fijarlos en el dashboard y compartirlos con roles.
3. Exportación a CSV y envío programado por correo (semanal o mensual).
4. Consultas con agregación de Mongo indexada y límite de rango para no cargar la base.

## Criterios de aceptación (borrador)

- C1: "Oportunidades ganadas por vendedor del mes" da las mismas cifras que contar a mano en la base de prueba.
- C2: un reporte guardado y fijado aparece en el dashboard del rol compartido.
