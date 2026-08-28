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

/** Bloque de definición: la respuesta directa a «qué es Maya CRM», para AEO/GEO. */
export const DEFINITION =
  'Maya CRM es una plataforma de ventas y marketing que reúne la captación de contactos, la base de datos ' +
  'de clientes, la conversación por WhatsApp e Instagram y el envío de campañas en un solo lugar. ' +
  'Incluye formularios publicables, páginas de evento con registro, listas y segmentos, bandeja unificada ' +
  'de mensajes, agentes de inteligencia artificial que responden solos y campañas masivas por WhatsApp y ' +
  'email. Funciona desde el navegador, sin instalar nada.';

export const PAINS: Pain[] = [
  {
    title: 'Los leads se pierden en el camino',
    body: 'Entran por Instagram, por el formulario de la web, por una feria y por el WhatsApp de un vendedor. Nadie sabe cuántos fueron ni quién los atendió.',
  },
  {
    title: 'Tu base de datos es una hoja de cálculo',
    body: 'Columnas que cada quien llena distinto, teléfonos repetidos, contactos que solo existen en el celular del comercial que se fue.',
  },
  {
    title: 'Responder tarde te cuesta la venta',
    body: 'El interesado escribe a las once de la noche y le contestas al día siguiente. Para entonces ya le compró al que respondió primero.',
  },
  {
    title: 'Pagas seis herramientas que no se hablan',
    body: 'Formularios por un lado, mailing por otro, el CRM en un tercero, WhatsApp aparte. Ninguna sabe lo que hizo la otra y tú pagas las seis.',
  },
  {
    title: 'No puedes segmentar a quién le escribes',
    body: 'Mandas lo mismo a todos porque separar por interés, ciudad o etapa te llevaría una tarde entera de filtros y copiar y pegar.',
  },
  {
    title: 'No sabes qué hace tu equipo comercial',
    body: 'Cuántos contactos trajo cada vendedor, a quién visitó, qué se le respondió a un cliente. Todo depende de lo que cada uno reporte.',
  },
];

export const CAPABILITY_GROUPS: CapabilityGroup[] = [
  {
    id: 'captacion',
    eyebrow: 'Captación',
    title: 'Que ningún interesado se quede fuera de tu base de datos',
    intro:
      'Cada canal por el que llega gente —tu web, un evento, una feria, un promotor— entra al mismo sitio y con su origen marcado.',
    items: [
      {
        icon: 'FileText',
        name: 'Formularios publicables',
        replaces: 'Reemplaza Google Forms',
        body: 'Creas el formulario, lo pegas en cualquier web o landing y los contactos entran directo a tu CRM ya etiquetados.',
        bullets: [
          'Campos a medida mapeados a la ficha del contacto',
          'Respuesta automática por WhatsApp y por email al registrarse',
          'Etiquetas y listas asignadas de forma automática',
          'API pública: funciona desde tu web actual sin tocar tu CRM',
        ],
      },
      {
        icon: 'Ticket',
        name: 'Eventos con página propia',
        replaces: 'Reemplaza el flyer y la lista a mano',
        body: 'Webinars, ferias, lanzamientos o capacitaciones con su propia landing, control de cupos y entrada con código único.',
        bullets: [
          'Página pública por evento lista para compartir',
          'Registro con ticket único y aforo bajo control',
          'Título y descripción generados con inteligencia artificial',
          'Todo asistente queda como contacto al que puedes volver a escribir',
        ],
      },
      {
        icon: 'Upload',
        name: 'Importación masiva',
        replaces: 'Reemplaza el copiar y pegar',
        body: 'Sube tu Excel, tu CSV o pega una tabla directamente. Maya detecta las columnas y las cuadra con los campos del contacto.',
        bullets: [
          'Excel, CSV o texto pegado desde cualquier tabla',
          'Detección automática de nombre, email y teléfono',
          'Control de duplicados al importar',
        ],
      },
      {
        icon: 'MapPin',
        name: 'Promotores y fuerza de campo',
        replaces: 'Reemplaza el reporte de WhatsApp',
        body: 'Cada promotor tiene su enlace de referido, su panel y su registro de visitas con ubicación. Sus contactos son suyos y no se mezclan.',
        bullets: [
          'Enlace de referido por promotor: sabes quién trajo a cada contacto',
          'Registro de visita con GPS en un toque',
          'Métricas de contactos, registros y visitas por día, semana y mes',
          'Datos aislados: un promotor no ve la cartera de otro',
        ],
      },
    ],
  },
  {
    id: 'conversacion',
    eyebrow: 'Conversación e IA',
    title: 'Responde en segundos, a cualquier hora, sin contratar a nadie más',
    intro:
      'WhatsApp e Instagram en una sola bandeja, con un asistente entrenado con tu información que atiende mientras tu equipo duerme.',
    items: [
      {
        icon: 'Bot',
        name: 'Agentes de inteligencia artificial',
        replaces: 'Reemplaza responder a mano a medianoche',
        body: 'Le das instrucciones y le subes tus documentos. El agente responde con tu información real, no con frases genéricas.',
        bullets: [
          'Base de conocimiento propia: sube tus PDF y responde con ellos',
          'Elige el modelo: Claude, OpenAI, Gemini o DeepSeek',
          'Saludo, tono y mensaje de respaldo definidos por ti',
          'Lo publicas cuando estás conforme, no antes',
        ],
      },
      {
        icon: 'MessagesSquare',
        name: 'Bandeja unificada',
        replaces: 'Reemplaza saltar entre apps',
        body: 'WhatsApp e Instagram en una sola pantalla, con la ficha del contacto al lado de cada conversación.',
        bullets: [
          'Conversaciones en tiempo real, asignables al equipo',
          'La IA responde y tú entras a la conversación cuando quieras',
          'Cada mensaje queda ligado al historial del contacto',
        ],
      },
      {
        icon: 'LayoutTemplate',
        name: 'Plantillas de WhatsApp',
        replaces: 'Reemplaza escribir lo mismo cien veces',
        body: 'Gestiona tus plantillas aprobadas por Meta para poder escribir al primer contacto sin depender de la ventana de 24 horas.',
        bullets: [
          'Plantillas con variables por contacto',
          'Cabecera con imagen, video o documento',
          'Se usan igual en campañas y en respuestas automáticas',
        ],
      },
    ],
  },
  {
    id: 'base',
    eyebrow: 'Base de datos y activación',
    title: 'Segmenta en segundos y escríbele al grupo correcto',
    intro:
      'Una ficha por persona con todo su historial. Desde ahí filtras, agrupas y lanzas la campaña sin exportar nada.',
    items: [
      {
        icon: 'ContactRound',
        name: 'Contactos',
        replaces: 'Reemplaza tu Excel de clientes',
        body: 'Ficha única por persona con su origen, sus etiquetas, sus campos propios y todo lo que ha pasado con ella.',
        bullets: [
          'Etiquetas y campos personalizados por tu operación',
          'Historial de conversaciones, formularios y eventos',
          'Búsqueda inmediata sobre toda la cartera',
        ],
      },
      {
        icon: 'List',
        name: 'Listas y segmentos',
        replaces: 'Reemplaza filtrar a mano',
        body: 'Agrupa por interés, ciudad, etapa o cualquier etiqueta y reutiliza el grupo cada vez que lances algo.',
        bullets: [
          'Listas estáticas y segmentos por etiqueta',
          'Un contacto puede estar en varias listas a la vez',
          'Se alimentan solas desde formularios y eventos',
        ],
      },
      {
        icon: 'Megaphone',
        name: 'Campañas de WhatsApp y email',
        replaces: 'Reemplaza tu herramienta de mailing',
        body: 'Escribe una vez y envía al segmento correcto, con imagen, video o documento adjunto.',
        bullets: [
          'WhatsApp con plantillas de Meta o desde tu propio número',
          'Email con asunto y cuerpo personalizados',
          'Segmentación por etiquetas o por listas',
          'Estado del envío y número real de destinatarios',
        ],
      },
      {
        icon: 'Gauge',
        name: 'Panel de control',
        replaces: 'Reemplaza pedir el reporte los lunes',
        body: 'Contactos nuevos, registros, visitas y actividad del equipo en una sola pantalla, actualizada en vivo.',
        bullets: [
          'Indicadores por periodo y por sede',
          'Actividad reciente de cada persona del equipo',
          'Se abre igual desde el móvil que desde el escritorio',
        ],
      },
    ],
  },
  {
    id: 'equipo',
    eyebrow: 'Equipo y control',
    title: 'Cada persona ve exactamente lo que le toca',
    intro:
      'Roles configurables módulo por módulo y acción por acción. Marketing no toca la cartera de un comercial, y un promotor solo ve la suya.',
    items: [
      {
        icon: 'Users',
        name: 'Usuarios y permisos',
        replaces: 'Reemplaza compartir una sola contraseña',
        body: 'Das de alta a tu equipo con contraseña temporal y decides, módulo por módulo, qué puede ver, crear, editar o borrar.',
        bullets: [
          'Matriz de permisos editable por empresa',
          'Roles propios además de los que vienen listos',
          'Cambio de contraseña obligatorio en el primer ingreso',
          'Dar de baja a alguien sin perder su historial',
        ],
      },
      {
        icon: 'Building2',
        name: 'Multi-sede y multi-marca',
        replaces: 'Reemplaza un sistema por oficina',
        body: 'Todas tus sedes o unidades de negocio en una cuenta, con datos y permisos separados y una vista consolidada para dirección.',
        bullets: [
          'Equipos y carteras aislados por sede',
          'Configuración clonable para abrir la siguiente',
          'Vista global para quien dirige',
        ],
      },
    ],
  },
];

export const STEPS: Step[] = [
  {
    n: '01',
    title: 'Nos cuentas cómo vendes',
    body: 'Una conversación por WhatsApp. Vemos por dónde te entran los contactos, cómo los atiendes hoy y qué se te está escapando.',
  },
  {
    n: '02',
    title: 'Dejamos tu cuenta lista',
    body: 'Importamos tu base actual, montamos tus formularios, conectamos tu WhatsApp y entrenamos al agente de IA con tu información.',
  },
  {
    n: '03',
    title: 'Tu equipo entra y vende',
    body: 'Se abre desde el navegador, sin instalar nada. Acompañamos las primeras semanas hasta que corre solo.',
  },
];

export const SEGMENTS: Segment[] = [
  {
    icon: 'Building2',
    name: 'Inmobiliarias',
    body: 'Interesados de portales, ferias y redes en una sola cartera, con el asesor asignado y el seguimiento a la vista.',
  },
  {
    icon: 'GraduationCap',
    name: 'Educación y academias',
    body: 'Formularios de admisión, campañas por convocatoria y un asistente que responde requisitos y fechas a cualquier hora.',
  },
  {
    icon: 'HeartPulse',
    name: 'Clínicas y servicios',
    body: 'Consultas por WhatsApp atendidas al instante, base de pacientes segmentada y recordatorios masivos.',
  },
  {
    icon: 'Store',
    name: 'Retail y showroom',
    body: 'Cada visitante que deja sus datos entra a una lista a la que le puedes escribir cuando llegue la nueva colección.',
  },
  {
    icon: 'Ticket',
    name: 'Eventos y productoras',
    body: 'Landing por evento, registro con ticket, promotores con enlace de referido y campañas al público que ya asistió.',
  },
  {
    icon: 'Sparkles',
    name: 'Agencias y consultoras',
    body: 'Un CRM por cliente o marca, con permisos separados y todo el histórico de conversaciones en un solo lugar.',
  },
];

export const DIFFERENTIATORS: Pain[] = [
  {
    title: 'WhatsApp en el centro, no de adorno',
    body: 'Aquí no es un botón que abre otra app: es bandeja, campañas, plantillas y respuesta automática, todo dentro del mismo CRM.',
  },
  {
    title: 'IA de verdad, no un chatbot de botones',
    body: 'Los agentes responden con tus documentos usando recuperación sobre tu propia información, y eliges el modelo que quieras.',
  },
  {
    title: 'Una sola base de datos',
    body: 'Quien llenó tu formulario, quien se registró a tu evento y quien te escribió por Instagram son el mismo contacto. Sin integraciones que mantener.',
  },
  {
    title: 'Pensada para LATAM',
    body: 'Español desde el primer día, WhatsApp como canal principal y flujos hechos para cómo se vende aquí, no traducidos de otro mercado.',
  },
];

export const GUARANTEES: Guarantee[] = [
  {
    title: 'Migración incluida',
    body: 'No te entregamos un panel vacío. Traemos tu base actual, montamos tus formularios y dejamos el WhatsApp conectado.',
  },
  {
    title: 'Sin permanencia',
    body: 'Te quedas porque te sirve. Si decides parar, paras.',
  },
  {
    title: 'Tus datos son tuyos',
    body: 'Tus contactos, tus listas y tus conversaciones se exportan cuando quieras. Nada queda secuestrado.',
  },
  {
    title: 'Empieza por una pieza',
    body: 'No hace falta cambiarlo todo el mismo día. Arranca por la bandeja de WhatsApp o por los formularios y suma el resto cuando quieras.',
  },
];

export const FAQS: Faq[] = [
  {
    q: '¿Qué es Maya CRM?',
    a: 'Maya CRM es una plataforma web de ventas y marketing que reúne en una sola cuenta la captación de contactos, la base de datos de clientes, la conversación por WhatsApp e Instagram y el envío de campañas. Sustituye al conjunto de herramientas sueltas que usan hoy la mayoría de equipos comerciales: formularios, hoja de cálculo, mailing y chat por separado.',
  },
  {
    q: '¿Sirve para cualquier tipo de negocio?',
    a: 'Sí. Maya CRM no es específica de un sector: la usan inmobiliarias, academias, clínicas, retail, agencias y productoras de eventos. Cualquier equipo que capte interesados, los atienda por WhatsApp y quiera volver a escribirles después encaja.',
  },
  {
    q: '¿Necesito instalar algo o comprar equipos?',
    a: 'No. Maya CRM funciona en el navegador de cualquier computadora, tablet o móvil. No hay que instalar programas, comprar hardware ni contratar un servidor: entras con tu usuario y ya está.',
  },
  {
    q: '¿Cuánto tarda en estar funcionando?',
    a: 'La mayoría de equipos queda operativo en la misma semana. La puesta en marcha incluye la importación de tu base actual, la creación de tus formularios, la conexión de tu WhatsApp y el entrenamiento del agente de inteligencia artificial con tu información.',
  },
  {
    q: '¿Cómo funcionan los agentes de inteligencia artificial?',
    a: 'Creas un agente, le das instrucciones y le subes tus documentos: catálogo, precios, políticas, preguntas frecuentes. El agente usa esa información para responder por WhatsApp e Instagram con tus datos reales. Puedes elegir entre Claude, OpenAI, Gemini o DeepSeek, y decidir cuándo publicarlo.',
  },
  {
    q: '¿Puedo enviar campañas masivas por WhatsApp?',
    a: 'Sí. Puedes enviar campañas de WhatsApp y de email segmentadas por etiquetas o por listas, con imagen, video o documento adjunto. Para WhatsApp se admiten tanto plantillas aprobadas por Meta como el envío desde tu propio número.',
  },
  {
    q: '¿Puedo traer mi base de datos actual?',
    a: 'Sí. Puedes importar desde Excel, CSV o pegando directamente una tabla. Maya detecta las columnas y las cuadra con los campos del contacto, y controla los duplicados durante la importación. La migración va incluida en la puesta en marcha.',
  },
  {
    q: '¿Cada vendedor ve toda la cartera?',
    a: 'No, salvo que tú quieras. Los permisos se configuran módulo por módulo y acción por acción, y los promotores trabajan con sus datos aislados: cada uno ve solo los contactos que él trajo. La matriz de permisos la define cada empresa.',
  },
  {
    q: '¿Sé de dónde vino cada contacto?',
    a: 'Sí. Cada contacto guarda su origen: qué formulario llenó, a qué evento se registró o qué promotor lo trajo mediante su enlace de referido. Eso permite medir qué canal y qué persona del equipo están trayendo resultados.',
  },
  {
    q: '¿Cuánto cuesta?',
    a: 'El precio depende del tamaño de tu operación: cuántos usuarios sois y qué módulos vais a usar. Escríbenos por WhatsApp, te hacemos unas preguntas y te pasamos una propuesta concreta el mismo día.',
  },
];
