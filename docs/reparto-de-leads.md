# Reparto de oportunidades (leads)

Cada empresa tiene varios usuarios y las oportunidades se reparten entre ellos.
Regla principal: **quien toma una oportunidad la lleva hasta que la suelta o la
deriva**. Mientras tanto, nadie más del equipo puede trabajarla.

## Cómo lo resuelven otros CRM

| Plataforma | Modelo |
|---|---|
| Salesforce | *Lead queues*: los leads entran a una cola; un vendedor pulsa **Accept** y pasa a ser el *owner*. "Change Owner" reasigna y avisa por correo. Reglas de asignación para repartir automáticamente. |
| HubSpot | Propiedad *Contact/Deal owner*; vista "Sin asignar"; workflows de rotación (round robin); aviso al nuevo dueño. Permisos "solo lo asignado / equipo / todo". |
| Pipedrive | Cada trato tiene dueño; "Transferir propiedad" con aviso; grupos de visibilidad. |
| Zoho CRM | Reglas de asignación, colas y cambio de dueño con notificación e historial. |
| Kommo | Sección de *leads entrantes* para aceptar o rechazar; usuario responsable; distribución automática con bots. |
| Freshsales | *Claim* desde colas por territorio. |

Todos coinciden en cuatro piezas: un **dueño único**, una **bolsa o cola sin
asignar**, **transferir con aviso** y un **historial de propiedad**. Además,
alguien que supervisa puede reasignar cualquier lead.

## Qué implementamos

- **Bolsa sin asignar**: una oportunidad sin `ownerId`. Todos los usuarios con
  acceso a Seguimiento la ven, también los impulsadores, que por lo demás solo
  ven lo suyo.
- **Tomar** (`PATCH /leads/:id/claim`): es atómico, así que si dos personas
  pulsan a la vez, solo una se la queda y la otra recibe "Ya la tomó X". Solo se
  pueden tomar oportunidades abiertas.
- **Bloqueo**: mover de etapa, editar, anotar, completar tareas o eliminar lo
  puede hacer solo el responsable. Sobre una oportunidad de la bolsa, primero
  hay que tomarla.
- **Soltar** (`PATCH /leads/:id/release`, con motivo opcional): la oportunidad
  vuelve a la bolsa.
- **Derivar** (`PATCH /leads/:id/transfer`, con `toUserId` y una nota): pasa a
  otra persona al momento, sin paso de aceptación, igual que en Salesforce,
  HubSpot o Pipedrive. Quien la recibe tiene un push (web y app) con la nota.
  Solo se puede derivar a usuarios activos del tenant cuyo rol tenga el módulo
  Seguimiento.
- **Supervisores** (`TENANT_ADMIN`, `MANAGER`, `SUPERADMIN`): pueden trabajar,
  asignar, quitar y derivar cualquier oportunidad. Si le quitan o le cambian una
  oportunidad a alguien, esa persona recibe un aviso.
- **Historial**: cada movimiento queda como actividad `assignment` ("Reparto"),
  por ejemplo "Ana la tomó", "Ana se la derivó a Pedro" con la nota, o "Carla se
  la quitó a Pedro — motivo". La plataforma escribe estas entradas y nadie puede
  borrarlas.
- **Carga de trabajo**: `GET /leads/owners` devuelve cuántas oportunidades
  abiertas lleva cada persona. Se muestra al derivar y en el filtro.
- **Alta**: por defecto la oportunidad es de quien la crea. En el formulario se
  puede elegir "Sin asignar (a la bolsa)" (`ownerId: ''`) u otra persona, que
  recibe un aviso.
- **Filtros**: `ownerId=me` para "Mías", `ownerId=none` para la bolsa, o un id
  de usuario. Hay un KPI "Sin asignar · N mías" que abre la bolsa con un toque.
- Los recordatorios de tareas ya iban al `ownerId`, así que siguen al nuevo
  responsable sin cambios.

Cambiar el responsable con `PATCH /leads/:id` pasa por el mismo flujo de
derivar o soltar, con las mismas reglas, historial y avisos.

## Siguientes pasos posibles

- Reparto automático (round robin o por carga) de lo que entra por los canales.
- Límite de oportunidades abiertas por persona.
- Devolver a la bolsa lo que no tenga actividad en N días.
