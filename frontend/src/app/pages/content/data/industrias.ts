import { ContentPage } from '../content.model';
import { FROM_PRICE } from '../facts';

const UPDATED = '2026-11-25';

/** HU81: páginas por industria. Flujo formulario → WhatsApp → IA → campaña. */
export const INDUSTRY_PAGES: ContentPage[] = [
  {
    slug: 'industrias/inmobiliarias',
    kind: 'industria',
    title: 'CRM para inmobiliarias con WhatsApp e IA | Maya CRM',
    description: 'Interesados de portales, ferias y redes en una sola cartera, con asesor asignado, respuesta inmediata por WhatsApp y seguimiento a la vista.',
    h1: 'CRM para inmobiliarias: cada interesado atendido y con su asesor',
    answer: `Un CRM para inmobiliarias reúne a los interesados que llegan por portales, ferias, anuncios y redes en una sola cartera, asigna cada uno a un asesor y registra el seguimiento. Con Maya CRM además se responde por WhatsApp en segundos con un agente de IA que conoce tus proyectos, y se envían campañas por proyecto o por zona. Desde ${FROM_PRICE} al mes por equipo.`,
    updated: UPDATED,
    sections: [
      {
        h2: 'El flujo de una inmobiliaria en Maya CRM',
        steps: [
          'Captación: el formulario de cada proyecto en tu web y en tus anuncios, y la página de la feria o del lanzamiento con registro.',
          'Respuesta: el interesado recibe un WhatsApp automático y el agente de IA responde precios, metrajes y ubicación con tus fichas de proyecto.',
          'Asignación: la oportunidad pasa al asesor que corresponde y queda con recordatorios de seguimiento.',
          'Reactivación: campañas por proyecto, zona o presupuesto a quienes no compraron todavía.',
        ],
      },
      {
        h2: 'Lo que más usan las inmobiliarias',
        items: [
          'Etiquetas por proyecto, zona, presupuesto y etapa del interesado.',
          'Reparto, derivación y reasignación de oportunidades entre asesores (Crece y Escala).',
          'Eventos para lanzamientos y visitas guiadas, con registro y check-in.',
          'Varias sedes en una cuenta y roles a medida por módulo y acción (Escala).',
        ],
      },
    ],
    faqs: [
      { q: '¿Puedo asignar cada interesado a un asesor?', a: 'Sí. Cada oportunidad tiene un asesor responsable, que recibe el aviso de asignación y sus recordatorios. El reparto automático entre asesores está en Crece y Escala.' },
      { q: '¿El agente de IA puede responder sobre mis proyectos?', a: 'Sí. Le subes las fichas de tus proyectos en PDF y responde con esa información; el asesor puede intervenir en cualquier momento.' },
      { q: '¿Sirve para ferias inmobiliarias?', a: 'Sí. Creas un evento con página y registro, y cada visitante queda como contacto con la feria como origen.' },
    ],
    related: ['formularios', 'agentes-ia-whatsapp', 'eventos', 'crm-whatsapp'],
  },
  {
    slug: 'industrias/academias',
    kind: 'industria',
    title: 'CRM para academias y centros educativos con WhatsApp | Maya CRM',
    description: 'Formularios de admisión, respuestas automáticas sobre requisitos y fechas, y campañas por convocatoria para academias, institutos y escuelas.',
    h1: 'CRM para academias y educación: admisiones que no se enfrían',
    answer: 'Para una academia, un CRM ordena las consultas de admisión, responde rápido requisitos, fechas y costos, y avisa a cada interesado cuando abre la siguiente convocatoria. Maya CRM lo hace con formularios de admisión, un agente de IA en WhatsApp que conoce tu oferta académica, eventos para charlas informativas y campañas por programa.',
    updated: UPDATED,
    sections: [
      {
        h2: 'El flujo de admisión en Maya CRM',
        steps: [
          'El postulante llena el formulario de admisión o se registra a la charla informativa.',
          'Recibe un WhatsApp con la información del programa y el agente de IA responde sus dudas a cualquier hora.',
          'El asesor de admisión hace el seguimiento con recordatorios.',
          'Quien no se matriculó recibe la campaña de la siguiente convocatoria.',
        ],
      },
      {
        h2: 'Funciones clave para educación',
        items: [
          'Etiquetas por programa, sede, modalidad y convocatoria.',
          'Eventos con página y registro para charlas, clases de prueba y ferias.',
          'Campañas de WhatsApp y email por programa (WhatsApp desde el plan Crece).',
          'Varias sedes en una cuenta con datos separados (Escala).',
        ],
      },
    ],
    faqs: [
      { q: '¿El agente de IA puede responder requisitos y fechas?', a: 'Sí, con los documentos que le subas: brochure, malla curricular, requisitos y calendario.' },
      { q: '¿Puedo avisar a los interesados de la próxima convocatoria?', a: 'Sí. Segmentas por etiqueta o lista y envías una campaña de WhatsApp o email.' },
      { q: '¿Sirve para charlas informativas?', a: 'Sí. Cada charla tiene su página con registro, ticket y control de cupos.' },
    ],
    related: ['agentes-ia-whatsapp', 'eventos', 'campanas-whatsapp', 'formularios'],
  },
  {
    slug: 'industrias/clinicas',
    kind: 'industria',
    title: 'CRM para clínicas y consultorios con WhatsApp e IA | Maya CRM',
    description: 'Consultas por WhatsApp atendidas al instante, base de pacientes segmentada y recordatorios y campañas masivas para clínicas y consultorios.',
    h1: 'CRM para clínicas y consultorios: cada consulta por WhatsApp atendida',
    answer: 'En una clínica, la mayoría de consultas llegan por WhatsApp y muchas se pierden fuera de horario. Maya CRM las recibe en una bandeja compartida, responde al instante con un agente de IA que conoce tus servicios y horarios, guarda a cada paciente como contacto y permite enviar recordatorios y campañas por especialidad.',
    updated: UPDATED,
    sections: [
      {
        h2: 'Cómo trabaja una clínica con Maya CRM',
        steps: [
          'El paciente escribe por WhatsApp, Instagram o Messenger, o llena el formulario de la web.',
          'El agente de IA responde servicios, horarios, ubicación y requisitos; la recepción toma la conversación cuando hace falta.',
          'El contacto queda etiquetado por especialidad e interés.',
          'Se envían recordatorios y campañas por especialidad o temporada.',
        ],
      },
      {
        h2: 'Cuidado de los datos',
        paragraphs: [
          'Los permisos se definen por módulo y acción, de modo que cada persona entra solo a los módulos que necesita (los roles a medida están en el plan Escala). Los datos se pueden exportar y la política de privacidad se rige por la Ley N.° 29733 de Protección de Datos Personales del Perú.',
        ],
      },
    ],
    faqs: [
      { q: '¿El agente de IA puede dar diagnósticos?', a: 'No debe hacerlo: se configura con instrucciones para informar servicios, horarios y requisitos, y derivar a una persona lo demás.' },
      { q: '¿Puedo enviar recordatorios masivos?', a: 'Sí, con campañas de WhatsApp (desde el plan Crece) o de email a una lista o etiqueta.' },
      { q: '¿Varias recepcionistas pueden atender el mismo WhatsApp?', a: 'Sí. La bandeja es compartida y cada conversación se asigna a quien la atiende.' },
    ],
    related: ['bandeja-unificada', 'agentes-ia-whatsapp', 'campanas-whatsapp', 'crm-whatsapp'],
  },
  {
    slug: 'industrias/eventos',
    kind: 'industria',
    title: 'CRM para productoras de eventos con registro y WhatsApp',
    description: 'Landing por evento, registro con ticket, promotores con enlace de referido, check-in y campañas al público que ya asistió.',
    h1: 'Para productoras de eventos: registro, promotores y público que vuelve',
    answer: 'Una productora necesita publicar cada evento rápido, saber qué promotor trajo a cada asistente y volver a venderle al público del evento anterior. Maya CRM da una página por evento con registro y ticket único, enlaces de referido por promotor (plan Escala), check-in y una base de asistentes lista para la próxima campaña por WhatsApp o email.',
    updated: UPDATED,
    sections: [
      {
        h2: 'Del anuncio al siguiente evento',
        steps: [
          'Publicas la página del evento con su imagen, fecha y cupos; el enlace muestra su propia vista previa en WhatsApp.',
          'Cada promotor comparte su enlace de referido y ve sus registros en su panel.',
          'Los inscritos reciben su ticket con código único; el día del evento se hace el check-in.',
          'Después del evento, una campaña a los asistentes anuncia el siguiente.',
        ],
      },
      {
        h2: 'Funciones clave',
        items: [
          'Eventos ilimitados con página pública, registro y check-in (Crece y Escala).',
          'Promotores con enlace de referido, panel propio y datos aislados (Escala).',
          'Dominio propio para la página del evento.',
          'Campañas de WhatsApp y email a quienes ya asistieron.',
        ],
      },
    ],
    faqs: [
      { q: '¿Puedo saber cuántos registros trajo cada promotor?', a: 'Sí. Cada promotor tiene su enlace de referido y sus métricas por día, semana y mes.' },
      { q: '¿Cada asistente queda como contacto?', a: 'Sí, con el evento como origen, para volver a escribirle.' },
      { q: '¿Puedo usar mi propio dominio para la página del evento?', a: 'Sí. La página del evento se puede publicar en un dominio propio.' },
    ],
    related: ['eventos', 'campanas-whatsapp', 'formularios', 'crm-whatsapp'],
  },
];
