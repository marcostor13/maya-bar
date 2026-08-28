/**
 * Contenido de la landing. Vive separado del componente porque es copy de
 * marketing: se edita mucho más a menudo que la plantilla, y así el diff de un
 * cambio de mensaje no toca el HTML ni los estilos.
 *
 * Las FAQ además alimentan el JSON-LD `FAQPage`, así que la respuesta de cada
 * una arranca con una frase autocontenida: es lo que un motor de respuestas
 * (Google AI Overviews, ChatGPT, Perplexity) puede citar sin más contexto.
 */

export interface Pain {
  title: string;
  body: string;
}

export interface Capability {
  icon: string;
  name: string;
  replaces: string;
  body: string;
  bullets: string[];
}

export interface CapabilityGroup {
  id: string;
  eyebrow: string;
  title: string;
  intro: string;
  items: Capability[];
}

export interface Step {
  n: string;
  title: string;
  body: string;
}

export interface Segment {
  icon: string;
  name: string;
  body: string;
}

export interface Guarantee {
  title: string;
  body: string;
}

export interface Faq {
  q: string;
  a: string;
}

/** Bloque de definición: la respuesta directa a «qué es Maya», para AEO/GEO. */
export const DEFINITION =
  'Maya es una plataforma todo-en-uno para restaurantes, bares, discotecas, cafeterías y productoras de eventos. ' +
  'Reúne carta digital con QR, pedidos desde la mesa, pantalla de cocina, reservas, eventos con página propia, ' +
  'CRM de clientes, campañas por WhatsApp y email, y agentes de inteligencia artificial que atienden conversaciones ' +
  'de WhatsApp e Instagram. Todo funciona sobre la misma base de datos y desde el navegador, sin instalar nada.';

export const PAINS: Pain[] = [
  {
    title: 'Pagas siete herramientas que no se hablan',
    body: 'Carta QR por un lado, reservas por otro, mailing en un tercero, el CRM en una hoja de cálculo. Ninguna sabe lo que hizo la otra y tú pagas las siete.',
  },
  {
    title: 'Los pedidos se pierden entre la mesa y la cocina',
    body: 'Comandas en papel, un mesero que no vuelve, platos que salen tarde. Cada error es una mesa que no repite y una reseña que no querías.',
  },
  {
    title: 'No sabes quién es tu cliente',
    body: 'Miles de personas pasan por tu local cada mes y no tienes ni su nombre ni su WhatsApp. Cuando la semana viene floja, no tienes a quién escribirle.',
  },
  {
    title: 'Los mensajes se acumulan sin responder',
    body: 'WhatsApp e Instagram llenos de «¿tienen mesa?», «¿a qué hora abren?», «¿cuánto cuesta la entrada?». Se responden tarde o no se responden.',
  },
  {
    title: 'Tus eventos dependen de un flyer',
    body: 'Publicas la fiesta, la gente pregunta por DM y anotas los nombres a mano. Sin lista real, sin cupos, sin saber qué promotor trajo a quién.',
  },
  {
    title: 'Abrir el segundo local duele',
    body: 'Cada sede con su carta, su Excel y sus reglas. Replicar lo que funciona cuesta semanas en vez de minutos.',
  },
];

export const CAPABILITY_GROUPS: CapabilityGroup[] = [
  {
    id: 'operacion',
    eyebrow: 'Operación',
    title: 'Del código QR de la mesa a la barra, sin papel',
    intro:
      'El servicio completo en un solo flujo: el cliente pide desde su teléfono, cocina y barra lo ven al instante y tú ves cómo va cada mesa.',
    items: [
      {
        icon: 'QrCode',
        name: 'Carta digital y pedidos QR',
        replaces: 'Reemplaza tu carta en PDF',
        body: 'Un QR por mesa abre tu carta real. El cliente arma su pedido, lo envía y sigue su estado en vivo.',
        bullets: [
          'Categorías, variantes y modificadores por plato',
          'Fotos, alérgenos y etiquetas: vegano, sin gluten, picante',
          'Sistema 86: agotas un plato y desaparece de la carta al instante',
          'Botones de «llamar al mesero» y «pedir la cuenta»',
        ],
      },
      {
        icon: 'ChefHat',
        name: 'Pantalla de cocina (KDS)',
        replaces: 'Reemplaza las comandas en papel',
        body: 'Cada estación ve solo lo suyo. Cocina, barra y postres trabajan en paralelo con tiempos a la vista.',
        bullets: [
          'Ruteo automático de cada ítem a su estación',
          'Tiempo transcurrido y alerta cuando un pedido se pasa del objetivo',
          'Un toque para avanzar el pedido; se sincroniza en todos los dispositivos',
          'Tiempo real por WebSocket, sin recargar la pantalla',
        ],
      },
      {
        icon: 'CalendarCheck',
        name: 'Reservas',
        replaces: 'Reemplaza el cuaderno y las llamadas',
        body: 'Página pública de reservas con tus turnos, tu aforo y tu duración de mesa. Confirmación automática por enlace.',
        bullets: [
          'Turnos y capacidad configurables por local',
          'Reserva en cuatro pasos desde el móvil',
          'Confirmación del cliente con token único',
          'Panel del anfitrión con la agenda del día',
        ],
      },
      {
        icon: 'Store',
        name: 'Multi-local y multi-marca',
        replaces: 'Reemplaza un sistema por sede',
        body: 'Todas tus sedes en una cuenta. Clona la configuración de un local y abre el siguiente el mismo día.',
        bullets: [
          'Carta, horarios y aforo propios por sede',
          'Clonado de local con un clic',
          'Permisos y datos aislados por sede',
          'Vista consolidada para dirección',
        ],
      },
    ],
  },
  {
    id: 'clientes',
    eyebrow: 'Clientes e IA',
    title: 'Convierte a cada visita en un contacto que puedes volver a llamar',
    intro:
      'Todo el que pide, reserva o se registra a un evento entra en tu base de datos. Desde ahí segmentas, escribes y automatizas.',
    items: [
      {
        icon: 'Bot',
        name: 'Agentes de IA',
        replaces: 'Reemplaza responder a mano a medianoche',
        body: 'Un asistente entrenado con tu carta, tus horarios y tus reglas responde por WhatsApp e Instagram las 24 horas.',
        bullets: [
          'Base de conocimiento propia: sube tus documentos y responde con ellos (RAG)',
          'Elige el modelo: Claude, OpenAI, Gemini o DeepSeek',
          'Saludo, tono y mensaje de respaldo definidos por ti',
          'Publicas el agente cuando estás conforme, no antes',
        ],
      },
      {
        icon: 'MessagesSquare',
        name: 'Bandeja unificada',
        replaces: 'Reemplaza saltar entre apps',
        body: 'WhatsApp e Instagram en una sola bandeja, con el historial del cliente al lado de cada conversación.',
        bullets: [
          'Conversaciones en tiempo real, asignables al equipo',
          'La IA responde y tú intervienes cuando quieres',
          'Cada mensaje queda ligado a la ficha del contacto',
        ],
      },
      {
        icon: 'ContactRound',
        name: 'CRM y listas',
        replaces: 'Reemplaza tu Excel de clientes',
        body: 'Una ficha por cliente con su historial, sus etiquetas y sus campos propios. Listas para segmentar en segundos.',
        bullets: [
          'Etiquetas y campos personalizados',
          'Listas estáticas y segmentos por etiqueta',
          'Importación masiva desde Excel, CSV o texto pegado',
        ],
      },
      {
        icon: 'Megaphone',
        name: 'Campañas de WhatsApp y email',
        replaces: 'Reemplaza tu herramienta de mailing',
        body: 'Escribe una vez y envía al segmento correcto. Con imagen, video o documento adjunto.',
        bullets: [
          'WhatsApp con plantillas aprobadas por Meta o número propio',
          'Email con asunto y cuerpo personalizados',
          'Segmentación por etiquetas o listas',
          'Estado de envío y conteo de destinatarios',
        ],
      },
      {
        icon: 'FileText',
        name: 'Formularios publicables',
        replaces: 'Reemplaza Google Forms',
        body: 'Crea un formulario, pégalo en cualquier web y los contactos entran directo a tu CRM con sus etiquetas.',
        bullets: [
          'Campos a medida mapeados a la ficha del cliente',
          'Respuesta automática por WhatsApp y por email',
          'Etiquetas y listas asignadas al registrarse',
        ],
      },
      {
        icon: 'Zap',
        name: 'Eventos con página propia',
        replaces: 'Reemplaza el flyer y la lista a mano',
        body: 'Cada evento tiene su landing pública, control de cupos y entrada con código único. La IA te escribe el copy.',
        bullets: [
          'Página pública por evento lista para compartir',
          'Registro con ticket único y control de aforo',
          'Título y descripción generados con IA',
          'Enlace de invitación por promotor para saber quién trajo a quién',
        ],
      },
    ],
  },
  {
    id: 'gestion',
    eyebrow: 'Gestión y equipo',
    title: 'Cada persona ve exactamente lo que le toca',
    intro:
      'Roles configurables por módulo y por acción. El mesero no ve las campañas, marketing no toca la cocina.',
    items: [
      {
        icon: 'Users',
        name: 'Equipo y permisos',
        replaces: 'Reemplaza compartir una sola contraseña',
        body: 'Da de alta a tu equipo con contraseña temporal y decide, módulo por módulo, qué puede ver, crear, editar o borrar.',
        bullets: [
          'Roles listos: gerente, anfitrión, mesero, cocina, barra, marketing',
          'Matriz de permisos editable por empresa',
          'Cambio de contraseña obligatorio en el primer ingreso',
          'Baja de un usuario sin perder su historial',
        ],
      },
      {
        icon: 'MapPin',
        name: 'Impulsadores y promotores',
        replaces: 'Reemplaza el conteo a mano de comisiones',
        body: 'Cada promotor tiene su panel, su enlace de referido y sus visitas con GPS. Sus contactos son suyos y no se mezclan.',
        bullets: [
          'Código de referido por promotor',
          'Registro de visitas con ubicación en un toque',
          'Métricas de contactos, registros y visitas por periodo',
        ],
      },
      {
        icon: 'Gauge',
        name: 'Panel de control',
        replaces: 'Reemplaza pedir el reporte los lunes',
        body: 'Tus locales, tus pedidos y tu actividad del día en una sola pantalla, actualizada en vivo.',
        bullets: [
          'Indicadores por local',
          'Actividad reciente del equipo',
          'Acceso desde cualquier navegador, también en el móvil',
        ],
      },
    ],
  },
];

export const STEPS: Step[] = [
  {
    n: '01',
    title: 'Nos cuentas cómo trabajas',
    body: 'Una conversación por WhatsApp. Vemos tu carta, tus sedes y qué te está costando más caro hoy.',
  },
  {
    n: '02',
    title: 'Dejamos tu cuenta lista',
    body: 'Cargamos tu carta, generamos los QR de tus mesas, configuramos turnos y roles, y conectamos tu WhatsApp.',
  },
  {
    n: '03',
    title: 'Tu equipo entra y trabaja',
    body: 'Se abre desde el navegador, sin instalar nada. Acompañamos las primeras semanas hasta que corre solo.',
  },
];

export const SEGMENTS: Segment[] = [
  {
    icon: 'UtensilsCrossed',
    name: 'Restaurantes',
    body: 'Carta con QR, comandas directas a cocina, reservas y una base de clientes que crece con cada servicio.',
  },
  {
    icon: 'Martini',
    name: 'Bares y discotecas',
    body: 'Barra con su propia pantalla, eventos con lista y cupos, promotores con enlace de referido y aforo bajo control.',
  },
  {
    icon: 'Coffee',
    name: 'Cafeterías y cadenas',
    body: 'Una carta que se replica en todas tus sedes, con precios y disponibilidad propios de cada punto.',
  },
  {
    icon: 'Ticket',
    name: 'Productoras de eventos',
    body: 'Landing por evento, registro con ticket único, campañas al público que ya asistió y atención automática por WhatsApp.',
  },
];

export const DIFFERENTIATORS: Pain[] = [
  {
    title: 'Una sola base de datos',
    body: 'La persona que pidió por QR el viernes es la misma que reservó el sábado y la que recibe tu campaña el jueves. Ninguna integración que mantener.',
  },
  {
    title: 'IA de verdad, no un chatbot de botones',
    body: 'Los agentes responden con tu información real usando recuperación sobre tus documentos, y eliges el modelo que quieras.',
  },
  {
    title: 'Pensada para LATAM',
    body: 'WhatsApp como canal principal, español desde el primer día y flujos hechos para cómo se trabaja aquí, no traducidos de otro mercado.',
  },
  {
    title: 'Se abre en el navegador',
    body: 'Sin servidores, sin instalaciones, sin cambiar de equipos. Funciona en la tablet de la cocina y en el móvil del mesero.',
  },
];

export const GUARANTEES: Guarantee[] = [
  {
    title: 'Puesta en marcha acompañada',
    body: 'No te entregamos un usuario y una contraseña. Cargamos tu carta, dejamos tus QR listos y entrenamos a tu equipo.',
  },
  {
    title: 'Sin permanencia',
    body: 'Te quedas porque te sirve. Si decides parar, paras.',
  },
  {
    title: 'Tus datos son tuyos',
    body: 'Tu carta, tus clientes y tus conversaciones se exportan cuando quieras. Nada queda secuestrado.',
  },
  {
    title: 'Empieza por un módulo',
    body: 'No hace falta cambiarlo todo el mismo día. Arranca por la carta QR o por los eventos y suma el resto cuando quieras.',
  },
];

export const FAQS: Faq[] = [
  {
    q: '¿Qué es Maya exactamente?',
    a: 'Maya es una plataforma web todo-en-uno para negocios de hospitalidad. En una sola cuenta reúne carta digital con QR, pedidos desde la mesa, pantalla de cocina, reservas, eventos con página pública, CRM de clientes, campañas por WhatsApp y email, y agentes de IA que responden conversaciones. Sustituye al conjunto de herramientas sueltas que hoy usa la mayoría de restaurantes y bares.',
  },
  {
    q: '¿Necesito instalar algo o comprar equipos?',
    a: 'No. Maya funciona en el navegador de cualquier computadora, tablet o móvil. No hay que instalar programas, comprar hardware ni contratar un servidor: entras con tu usuario y ya está.',
  },
  {
    q: '¿Cuánto tarda en estar funcionando?',
    a: 'La mayoría de locales queda operativo en la misma semana. La puesta en marcha incluye la carga de tu carta, la generación de los QR de tus mesas, la configuración de turnos y roles y la conexión de tu WhatsApp.',
  },
  {
    q: '¿Sirve si tengo varios locales?',
    a: 'Sí. Maya es multi-local desde el diseño: cada sede tiene su carta, sus horarios, su aforo y su equipo, y puedes clonar la configuración de un local para abrir el siguiente en minutos. La dirección ve todo consolidado.',
  },
  {
    q: '¿Cómo funcionan los agentes de inteligencia artificial?',
    a: 'Creas un agente, le das instrucciones y le subes tus documentos (carta, horarios, políticas). El agente usa esa información para responder por WhatsApp e Instagram con tus datos reales, no con respuestas genéricas. Puedes elegir entre Claude, OpenAI, Gemini o DeepSeek, y decidir cuándo publicarlo.',
  },
  {
    q: '¿Puedo enviar campañas por WhatsApp a mis clientes?',
    a: 'Sí. Puedes enviar campañas de WhatsApp y de email segmentadas por etiquetas o por listas, con imagen, video o documento adjunto. Para WhatsApp se admiten tanto plantillas aprobadas por Meta como el envío desde tu propio número.',
  },
  {
    q: '¿Reemplaza a mi caja o punto de venta?',
    a: 'Maya cubre el pedido, la cocina, la reserva y la relación con el cliente. Puede convivir con tu caja actual mientras haces la transición, así que no tienes que cambiarlo todo el mismo día.',
  },
  {
    q: '¿Cada empleado ve toda la información del negocio?',
    a: 'No. Los permisos se configuran módulo por módulo y acción por acción. Un mesero ve pedidos y nada más; marketing ve campañas y clientes pero no la cocina. La matriz de permisos la define cada empresa.',
  },
  {
    q: '¿Qué tipo de negocios usan Maya?',
    a: 'Restaurantes, bares, discotecas, cafeterías, cadenas con varias sedes y productoras de eventos. Cualquier negocio que atienda mesas, gestione reservas u organice eventos con lista de invitados.',
  },
  {
    q: '¿Cuánto cuesta?',
    a: 'El precio depende del tamaño de tu operación: cuántas sedes tienes y qué módulos vas a usar. Escríbenos por WhatsApp, te hacemos unas preguntas y te pasamos una propuesta concreta el mismo día.',
  },
];
