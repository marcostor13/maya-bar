# HU64 — Reportes configurables · Especificación

Historia: `hu.md` · Fecha: 2026-11-24 · Estado: aprobada

## Objetivo
Que el gerente arme, guarde y comparta sus propios reportes sin exportar a Excel.

## Alcance
- Incluye: constructor con fuente (oportunidades, contactos, conversaciones, campañas, registros a eventos), métrica (cantidad, suma de monto, tasa de conversión, días medios hasta ganar), agrupación (vendedor, etapa, estado, origen, canal, etiqueta, tipo, evento, día/semana/mes, total), filtros (fecha de creación/cierre/envío, periodo relativo o personalizado, estado, etapa, origen, etiqueta, canal, responsable) y visualización (tabla, barras, línea). Guardar, fijar en el dashboard, compartir con roles, exportar a CSV y envío por correo semanal (lunes 8:00) o mensual (día 1, 8:00), hora de Lima. Agregaciones de Mongo sobre campos indexados con rango máximo de 366 días.
- **Fuera de alcance:** fórmulas a medida y uniones entre fuentes.

## Requisitos (EARS)
- **R1** — Cuando se ejecuta un reporte, el sistema debe agregar solo los datos de la empresa dentro del rango y devolver las cifras por grupo y el total.
- **R2** — Si el rango supera 366 días o la combinación no aplica a la fuente, entonces el sistema rechaza el reporte.
- **R3** — Mientras un reporte esté fijado, el sistema debe mostrarlo en el dashboard del administrador, de quien lo creó y de los roles con los que se compartió.

## Criterios de aceptación
| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | "Oportunidades ganadas por vendedor del mes" da las mismas cifras que contar a mano en la base | e2e |
| C2 | R3 | Un reporte guardado y fijado aparece en el dashboard del rol compartido | e2e + unitaria frontend |
