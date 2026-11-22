# HU30 — Check-in en la puerta, pensado para el móvil

## Historia

**Como** persona que recibe a los invitados en la puerta con el móvil,
**quiero** escanear las entradas una tras otra a pantalla completa y saber al instante si la entrada es válida,
**para** dejar pasar rápido y sin errores aunque haya cola.

## Contexto (estado actual)

Archivo: `pages/events/tabs/event-checkin-tab.ts`.

- **El escáner es un modal pequeño** (`.scanner-modal`, l.120: `max-width: 420px`, `min-height: 250px`) con la caja de lectura fija en 250 px (l.201).
  - El resultado es una franja de texto (l.77-85) y un toast.
  - Sin vibración ni sonido: con ruido y prisa no se nota si leyó.
- **Un código inválido** solo da un toast de error; no hay un estado "rojo" claro.
- **El contador mezcla unidades.** `checkedInCount` cuenta registros con check-in, pero `totalAttendees` suma personas (`partySize`) (`event-detail.store.ts` l.73-78).
  - Ejemplo: "3 / 10 presentes" puede ser 3 registros de 10 personas.
  - La "tasa de asistencia" de Estadísticas usa la misma cuenta, así que también sale mal.
- **La lista de check-in hereda los filtros de Asistentes**: estado y búsqueda vienen de `loadRegistrations` con `regStatusFilter`.
  - Muestra registros cancelados con botón "Check-in" (l.54-57).
  - Un grupo (`partySize` > 1) no se distingue de una entrada individual.
- **Estilos poco táctiles**:
  - El buscador mide 15 px (l.102): iOS hace zoom al tocarlo.
  - La tarjeta se desplaza con hover (l.108).
  - Colores fijos (`#fff`, `#dcfce7`, etc.).
- **No se puede deshacer** un check-in hecho por error.

## Propuesta

1. **Modo escáner a pantalla completa** (`100dvh`, áreas seguras), con cámara trasera y escaneo continuo.
   - Encima, una tarjeta grande de resultado durante 2 s:
     - Verde: "Bienvenido, Ana · grupo de 3".
     - Ámbar: "Ya ingresó a las 21:04".
     - Rojo: "Entrada no válida" o "Registro cancelado".
   - Vibración (`navigator.vibrate`) distinta para cada color y un pitido opcional.
   - Linterna si el dispositivo la soporta.
   - Contador fijo arriba.
2. **Contador coherente**: personas presentes / personas esperadas, contando `partySize` de los registros con check-in. Se corrige también la tasa de Estadísticas.
3. **Lista manual propia**:
   - Solo registros confirmados.
   - Búsqueda de 16 px por nombre, email, teléfono o ticket.
   - Chip "Grupo de N".
   - Botón grande "Dar ingreso".
4. **Deshacer** durante unos segundos tras un check-in manual o escaneado, con endpoint de backend para quitar el check-in.
5. **Estilo**: colores con variables y sin efectos de hover en táctil.

## Supuestos

- El backend devuelve en el check-in por código el estado (válido, ya usado, cancelado); si no distingue "cancelado", se añade.
- Quitar un check-in necesita un endpoint nuevo, restringido a quien puede hacer check-in.

## Fuera de alcance

- Check-in sin conexión (cola local); queda como posible historia aparte.

## Criterios de aceptación (borrador)

- C1: el escáner ocupa la pantalla en 360 × 640, lee seguido sin cerrar y muestra verde, ámbar o rojo con vibración.
- C2: el contador y la tasa cuentan personas en los dos lados.
- C3: la lista de check-in no muestra cancelados ni depende del filtro de Asistentes.
- C4: un check-in se puede deshacer y el contador se actualiza.
- C5: el buscador no provoca zoom en iOS (≥ 16 px).
