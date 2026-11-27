import { ContentPage } from '../content.model';
import { FROM_PRICE, PLAN_FACTS, plansTable } from '../facts';

const UPDATED = '2026-11-25';
const crece = PLAN_FACTS.find((p) => p.id === 'crece')!;
const META_PRICING = { label: 'Meta: precios de WhatsApp Business Platform', url: 'https://developers.facebook.com/docs/whatsapp/pricing' };

/** HU80: páginas de funciones. Solo datos verificables del producto. */
export const FUNCTION_PAGES: ContentPage[] = [
  {
    slug: 'crm-whatsapp',
    kind: 'funcion',
    title: 'CRM para WhatsApp con IA y campañas | Maya CRM',
    description: `CRM para vender por WhatsApp: bandeja para todo el equipo, agentes de IA, campañas y contactos en un solo lugar. Desde ${FROM_PRICE} al mes.`,
    h1: 'CRM para WhatsApp: vende por WhatsApp con todo tu equipo y con IA',
    answer: `Un CRM para WhatsApp guarda cada conversación de WhatsApp en la ficha del contacto, deja que varios vendedores atiendan el mismo número y permite enviar campañas a segmentos. Maya CRM hace eso y suma formularios, eventos, Instagram, Messenger y agentes de inteligencia artificial que responden solos. Los planes empiezan en ${FROM_PRICE} al mes por equipo, con demo en vivo antes de contratar.`,
    updated: UPDATED,
    sections: [
      {
        h2: 'Qué resuelve frente a usar WhatsApp Business en el celular',
        items: [
          'Un solo número para todo el equipo: cada conversación se asigna a un vendedor y se puede reasignar.',
          'El historial no se pierde cuando un vendedor se va: queda en la ficha del contacto, no en su teléfono.',
          'Cada contacto tiene su origen (formulario, evento, promotor, Instagram), etiquetas y campos propios.',
          'Respuesta a cualquier hora con un agente de IA entrenado con tus documentos.',
          'Campañas a una lista o a una etiqueta en vez de mensajes uno por uno.',
        ],
      },
      {
        h2: 'Cómo funciona en Maya CRM',
        steps: [
          'Conectas tu número de WhatsApp: por la API oficial de Meta (Cloud API) o, si lo prefieres, tu número propio escaneando un código QR.',
          'Los mensajes llegan a la bandeja unificada junto con Instagram, Messenger y correo, con la ficha del contacto al lado.',
          'El agente de IA contesta las preguntas frecuentes; un vendedor entra a la conversación cuando quiere.',
          'Los interesados quedan como contactos con etiquetas y listas, listos para el seguimiento o para una campaña.',
        ],
      },
      {
        h2: 'API oficial o número propio por QR',
        paragraphs: [
          'Con la API oficial de WhatsApp Business puedes usar plantillas aprobadas por Meta para escribir primero y enviar campañas masivas. Meta cobra cada mensaje directamente a tu cuenta según el país y la categoría; Maya CRM no les suma ningún recargo.',
          'Si conectas tu número propio por QR no pagas por mensaje, pero no tienes plantillas de Meta. Para volumen y campañas conviene la API oficial.',
        ],
      },
      { h2: 'Precios y límites por plan', table: plansTable() },
    ],
    faqs: [
      { q: '¿Necesito la API oficial de WhatsApp para usar Maya CRM?', a: 'No. Puedes conectar tu número propio por QR o la API oficial de WhatsApp Business. La API oficial es la que permite plantillas aprobadas por Meta y campañas masivas.' },
      { q: '¿Varios vendedores pueden atender el mismo número?', a: `Sí. Todas las conversaciones llegan a una bandeja compartida y se asignan a cada vendedor. El plan Crece incluye ${crece.users} usuarios y ${crece.whatsappNumbers} números de WhatsApp.` },
      { q: '¿Maya CRM cobra por cada mensaje de WhatsApp?', a: 'No. Los mensajes por la API oficial los cobra Meta directamente según su tarifa de lista; Maya CRM no les suma recargo. Con el número propio por QR no hay costo por mensaje.' },
      { q: '¿Funciona también con Instagram y Messenger?', a: 'Sí. Todos los planes incluyen la bandeja unificada de WhatsApp, Instagram y Messenger, además de buzones de correo.' },
    ],
    related: ['agentes-ia-whatsapp', 'campanas-whatsapp', 'bandeja-unificada', 'guias/costo-mensajes-whatsapp-peru'],
    sources: [META_PRICING],
  },
  {
    slug: 'agentes-ia-whatsapp',
    kind: 'funcion',
    title: 'Agente de IA para WhatsApp entrenado con tus documentos | Maya CRM',
    description: 'Agentes de inteligencia artificial que responden por WhatsApp e Instagram con tu información real. Eliges el modelo: Claude, OpenAI, Gemini o DeepSeek.',
    h1: 'Agentes de IA para WhatsApp que responden con tu información',
    answer: 'Un agente de IA para WhatsApp es un asistente que lee los mensajes que llegan y responde solo, las 24 horas, usando la información de tu negocio. En Maya CRM le das instrucciones, le subes tus documentos (PDF) y eliges el modelo —Claude, OpenAI, Gemini o DeepSeek—; responde por WhatsApp e Instagram y un vendedor puede intervenir en cualquier momento.',
    updated: UPDATED,
    sections: [
      {
        h2: 'Qué lo diferencia de un chatbot de botones',
        paragraphs: [
          'Un chatbot de botones solo sigue un menú fijo. El agente de Maya CRM entiende preguntas escritas con tus propias palabras y responde con recuperación sobre tus documentos: precios, requisitos, horarios, ubicación o condiciones, tal como están en tu información.',
        ],
        items: [
          'Base de conocimiento propia: subes tus PDF y responde con ellos.',
          'Eliges el modelo de lenguaje: Claude, OpenAI, Gemini o DeepSeek.',
          'Defines saludo, tono e instrucciones, y un mensaje de respaldo cuando no sabe la respuesta.',
          'Lo publicas cuando estás conforme, no antes.',
          'La conversación queda en la ficha del contacto y un vendedor puede tomarla cuando quiera.',
        ],
      },
      {
        h2: 'Cómo se configura',
        steps: [
          'Creas el agente y escribes sus instrucciones: qué vende tu negocio, cómo debe hablar y qué no debe prometer.',
          'Subes los documentos con los que debe responder.',
          'Lo pruebas con preguntas reales antes de publicarlo.',
          'Lo asignas a tu número de WhatsApp o a tu cuenta de Instagram.',
        ],
      },
      {
        h2: 'Agentes y créditos de IA por plan',
        table: {
          head: ['', ...PLAN_FACTS.map((p) => p.name)],
          rows: [
            ['Agentes de IA', ...PLAN_FACTS.map((p) => p.aiAgents)],
            ['Créditos de IA al mes', ...PLAN_FACTS.map((p) => p.aiCredits)],
            ['Precio mensual', ...PLAN_FACTS.map((p) => `US$ ${p.usd} · S/ ${p.pen}`)],
          ],
          note: 'Las respuestas de la IA consumen créditos del plan. Si se agotan, se pueden comprar recargas.',
        },
      },
    ],
    faqs: [
      { q: '¿Qué modelos de IA puedo usar?', a: 'Puedes elegir entre Claude, OpenAI, Gemini y DeepSeek para cada agente.' },
      { q: '¿El agente inventa respuestas?', a: 'El agente responde con las instrucciones y los documentos que le das. Cuando no tiene la información, usa el mensaje de respaldo que tú defines. Como todo modelo de lenguaje puede equivocarse, conviene revisar sus respuestas al inicio; un vendedor puede intervenir en cualquier momento.' },
      { q: '¿Puedo tener varios agentes?', a: `Sí, según el plan: ${PLAN_FACTS.map((p) => `${p.name}, ${p.aiAgents}`).join('; ')}. Por ejemplo, uno para ventas y otro para atención.` },
      { q: '¿Funciona en Instagram además de WhatsApp?', a: 'Sí. El agente responde en WhatsApp e Instagram desde la misma bandeja.' },
    ],
    related: ['crm-whatsapp', 'bandeja-unificada', 'industrias/academias', 'industrias/clinicas'],
  },
  {
    slug: 'campanas-whatsapp',
    kind: 'funcion',
    title: 'Campañas y envío masivo de WhatsApp con API oficial | Maya CRM',
    description: 'Envía campañas de WhatsApp y email a listas o etiquetas, con plantillas aprobadas por Meta, imagen, video o documento, y sin recargo por mensaje.',
    h1: 'Campañas de WhatsApp y email a tus segmentos',
    answer: 'Una campaña de WhatsApp es un envío a muchos contactos a la vez usando una plantilla aprobada por Meta. En Maya CRM eliges la lista o la etiqueta, escribes una vez con variables por contacto y la envías por WhatsApp o por email, con imagen, video o documento, y ves el estado de cada envío. Las campañas masivas de WhatsApp están en los planes Crece y Escala.',
    updated: UPDATED,
    sections: [
      {
        h2: 'Qué puedes enviar',
        items: [
          'WhatsApp con plantillas aprobadas por Meta (API oficial) o desde tu propio número.',
          'Variables por contacto, como el nombre, y cabecera con imagen, video o documento.',
          'Email con asunto y cuerpo personalizados.',
          'Segmentación por etiquetas o por listas que se alimentan solas desde formularios y eventos.',
          'Estado del envío y número real de destinatarios.',
        ],
      },
      {
        h2: 'Cómo lanzar una campaña',
        steps: [
          'Crea o elige una plantilla de WhatsApp aprobada por Meta.',
          'Elige el segmento: una lista o una etiqueta.',
          'Revisa el mensaje con las variables de un contacto real.',
          'Envía ahora; Maya CRM procesa los envíos en segundo plano y respeta la lista de no contactar.',
        ],
      },
      {
        h2: 'Cuánto cuesta enviar',
        paragraphs: [
          'Los mensajes por la API oficial los cobra Meta directamente a tu cuenta según el país del destinatario y la categoría de la plantilla (marketing, utilidad o autenticación). Maya CRM no les suma recargo. Mira la guía de costos para Perú.',
        ],
        table: plansTable(),
      },
    ],
    faqs: [
      { q: '¿Qué plan necesito para enviar campañas de WhatsApp?', a: 'Las campañas masivas de WhatsApp están en Crece y Escala. Todos los planes incluyen campañas de email.' },
      { q: '¿Por qué necesito una plantilla aprobada por Meta?', a: 'WhatsApp solo permite escribir primero a un contacto, fuera de la ventana de 24 horas desde su último mensaje, con una plantilla aprobada por Meta.' },
      { q: '¿Puedo adjuntar imágenes o documentos?', a: 'Sí. Las plantillas admiten cabecera con imagen, video o documento.' },
      { q: '¿Qué pasa con quien pidió no recibir mensajes?', a: 'Los contactos en la lista de no contactar se excluyen de los envíos.' },
    ],
    related: ['crm-whatsapp', 'guias/costo-mensajes-whatsapp-peru', 'guias/whatsapp-business-a-api-oficial', 'formularios'],
    sources: [META_PRICING],
  },
  {
    slug: 'formularios',
    kind: 'funcion',
    title: 'Formularios web que envían contactos a tu CRM y WhatsApp | Maya CRM',
    description: 'Crea formularios, pégalos en tu web y recibe los contactos ya etiquetados en tu CRM, con respuesta automática por WhatsApp y email.',
    h1: 'Formularios que llevan cada contacto a tu CRM y le responden por WhatsApp',
    answer: 'Los formularios de Maya CRM se crean en minutos, se pegan en cualquier web o landing y envían cada registro directo a la base de contactos, con etiquetas y listas asignadas solas. Al registrarse, la persona recibe una respuesta automática por WhatsApp y por email, así nadie se queda esperando.',
    updated: UPDATED,
    sections: [
      {
        h2: 'Lo que hace distinto a un formulario de Maya CRM',
        items: [
          'Campos a medida conectados a la ficha del contacto.',
          'Respuesta automática por WhatsApp y por email al registrarse.',
          'Etiquetas y listas asignadas automáticamente, listas para una campaña.',
          'Control de duplicados: si el contacto ya existe, se actualiza su ficha.',
          'API pública: también puedes enviar los registros desde tu web actual.',
        ],
      },
      {
        h2: 'Cómo se usa',
        steps: [
          'Creas el formulario y eliges sus campos.',
          'Defines las etiquetas, la lista y los mensajes automáticos.',
          'Copias el código o el enlace y lo publicas en tu web, en tu bio de Instagram o en un anuncio.',
          'Cada registro aparece en tus contactos con su origen.',
        ],
      },
    ],
    faqs: [
      { q: '¿Puedo usar el formulario en mi web de WordPress o Wix?', a: 'Sí. El formulario se pega en cualquier web o landing, y también existe una API pública para enviar registros desde tus propios formularios.' },
      { q: '¿Qué pasa si una persona se registra dos veces?', a: 'Maya CRM controla los duplicados y actualiza la ficha del contacto existente.' },
      { q: '¿Puedo responder automáticamente por WhatsApp?', a: 'Sí. Cada formulario puede enviar una respuesta automática por WhatsApp y por email al registrarse.' },
    ],
    related: ['eventos', 'campanas-whatsapp', 'crm-whatsapp', 'industrias/inmobiliarias'],
  },
  {
    slug: 'eventos',
    kind: 'funcion',
    title: 'Página de evento con registro, ticket y check-in | Maya CRM',
    description: 'Publica la página de tu webinar, feria o lanzamiento con registro, ticket único, control de cupos y check-in. Cada asistente queda como contacto.',
    h1: 'Eventos con página propia, registro con ticket y check-in',
    answer: 'Maya CRM crea una página pública para cada evento —webinar, feria, lanzamiento o capacitación— con formulario de registro, ticket con código único y control de cupos. Cada inscrito queda como contacto en tu CRM, así puedes escribirle antes del evento y volver a venderle después.',
    updated: UPDATED,
    sections: [
      {
        h2: 'Qué incluye',
        items: [
          'Página pública por evento, lista para compartir, con su propia vista previa en WhatsApp y redes.',
          'Registro con ticket único y aforo bajo control.',
          'Título y descripción generados con inteligencia artificial.',
          'Check-in de asistentes (planes Crece y Escala).',
          'Promotores con enlace de referido para saber quién trajo a cada inscrito (plan Escala).',
          'Todo asistente queda como contacto al que puedes volver a escribir.',
        ],
      },
      {
        h2: 'Cómo organizar un evento',
        steps: [
          'Creas el evento con fecha, lugar y cupos.',
          'Compartes el enlace de la página por WhatsApp, redes o con tus promotores.',
          'Los inscritos reciben su ticket y quedan en una lista del evento.',
          'El día del evento marcas la asistencia y después envías la campaña de seguimiento.',
        ],
      },
      {
        h2: 'Eventos por plan',
        table: {
          head: ['', ...PLAN_FACTS.map((p) => p.name)],
          rows: [
            ['Eventos con página y registro', ...PLAN_FACTS.map((p) => p.events)],
            ['Precio mensual', ...PLAN_FACTS.map((p) => `US$ ${p.usd} · S/ ${p.pen}`)],
          ],
        },
      },
    ],
    faqs: [
      { q: '¿Cuántos eventos puedo publicar?', a: `Depende del plan: ${PLAN_FACTS.map((p) => `${p.name}, ${p.events}`).join('; ')}.` },
      { q: '¿Los inscritos quedan en mi base de datos?', a: 'Sí. Cada inscrito se guarda como contacto con el evento como origen, listo para una campaña.' },
      { q: '¿Se ve bien el enlace al compartirlo por WhatsApp?', a: 'Sí. El enlace del evento muestra su título, fecha, imagen y marca en la vista previa.' },
    ],
    related: ['industrias/eventos', 'formularios', 'campanas-whatsapp', 'industrias/academias'],
  },
  {
    slug: 'bandeja-unificada',
    kind: 'funcion',
    title: 'Bandeja unificada: WhatsApp, Instagram, Messenger y correo | Maya CRM',
    description: 'Atiende WhatsApp, Instagram, Messenger y correo en una sola pantalla, con la ficha del contacto, asignación al equipo y respuesta con IA.',
    h1: 'Bandeja unificada para WhatsApp, Instagram, Messenger y correo',
    answer: 'La bandeja unificada de Maya CRM reúne en una sola pantalla las conversaciones de WhatsApp, Instagram, Messenger y correo (Gmail, Outlook o IMAP). Cada conversación se asigna a un miembro del equipo, muestra la ficha del contacto al lado y puede atenderla primero un agente de IA.',
    updated: UPDATED,
    sections: [
      {
        h2: 'Para qué sirve',
        items: [
          'Dejar de saltar entre apps y teléfonos para responder.',
          'Asignar y reasignar conversaciones entre vendedores.',
          'Ver el historial completo del contacto: formularios, eventos y mensajes anteriores.',
          'Buscar dentro de las conversaciones.',
          'Que la IA responda y que una persona entre cuando haga falta.',
        ],
      },
      {
        h2: 'Canales incluidos en todos los planes',
        paragraphs: [
          `WhatsApp, Instagram y Messenger están en todos los planes. Los buzones de correo dependen del plan: ${PLAN_FACTS.map((p) => `${p.name}, ${p.mailboxes}`).join('; ')}. La app móvil avisa con notificaciones cuando llega un mensaje.`,
        ],
        table: plansTable(),
      },
    ],
    faqs: [
      { q: '¿Qué canales puedo conectar?', a: 'WhatsApp (API oficial o número propio por QR), Instagram, Messenger y buzones de correo de Gmail, Outlook o IMAP.' },
      { q: '¿Hay app para el celular?', a: 'Sí. La app móvil de Maya CRM envía notificaciones cuando llega un mensaje nuevo.' },
      { q: '¿Quién ve las conversaciones?', a: 'Quien tiene acceso a la bandeja ve las conversaciones del equipo, y cada conversación se asigna a quien la atiende. Los permisos se configuran por módulo y acción; los roles a medida están en el plan Escala.' },
    ],
    related: ['crm-whatsapp', 'agentes-ia-whatsapp', 'comparar/kommo', 'comparar/wati'],
  },
];
