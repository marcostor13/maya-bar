import { ContentPage } from '../content.model';
import { EXTRA_USER_USD, PLAN_FACTS } from '../facts';

/**
 * HU82: comparativas. Los datos de la competencia salen de sus páginas
 * oficiales revisadas en `REVIEWED`; lo que no se pudo verificar se dice así.
 * Revisar cada trimestre: los precios cambian.
 */
const REVIEWED = '2026-11-25';
const [inicia, crece, escala] = PLAN_FACTS;
const maya = (p: typeof inicia) => `US$ ${p.usd} al mes con ${p.users} usuarios`;
const NV = 'No verificado';
const NOTE = 'Datos de la competencia tomados de sus páginas oficiales el 25 de noviembre de 2026. Los precios pueden cambiar; confirma en su web antes de decidir.';

export const COMPARISON_PAGES: ContentPage[] = [
  {
    slug: 'comparar/hubspot',
    kind: 'comparativa',
    title: 'Maya CRM vs HubSpot: comparación para vender por WhatsApp',
    description: 'Comparación de Maya CRM y HubSpot en precio, WhatsApp, IA, campañas y eventos. Para quién conviene cada uno, con fuentes oficiales.',
    h1: 'Maya CRM vs HubSpot: cuál conviene si vendes por WhatsApp',
    answer: `HubSpot es un CRM muy completo y cobra por asiento; su canal de WhatsApp no está en los planes Starter, sino desde Marketing Hub o Service Hub Professional. Maya CRM incluye WhatsApp, Instagram, Messenger, agentes de IA y formularios desde su plan de entrada (${maya(inicia)}), y cobra por equipo, no por vendedor. Si tu venta pasa por WhatsApp en Latinoamérica, Maya suele salir más barato; si necesitas un ecosistema amplio de marketing y ventas en inglés, HubSpot es más completo.`,
    updated: REVIEWED,
    sections: [
      {
        h2: 'Comparación rápida',
        table: {
          head: ['', 'Maya CRM', 'HubSpot (Starter)'],
          rows: [
            ['Modelo de precio', `Por equipo: desde ${maya(inicia)}`, 'Por asiento: lista US$ 20 por asiento al mes en Starter Customer Platform (con promociones temporales)'],
            ['WhatsApp', 'Incluido en todos los planes (API oficial o número propio por QR)', 'No incluido en Starter; disponible desde Marketing Hub o Service Hub Professional'],
            ['Campañas de WhatsApp', `Desde Crece (${maya(crece)})`, 'Desde planes Professional'],
            ['Agente de IA que responde', 'Incluido: 1 a ilimitados según plan, con tus documentos', 'Herramientas de IA (Breeze); agente de clientes en Starter: no verificado'],
            ['Email marketing', 'Incluido en todos los planes', 'Incluido en Starter'],
            ['Páginas de eventos con registro', 'Incluido', NV],
            ['Antes de contratar', 'Demo en vivo por WhatsApp', 'Plan gratuito permanente con funciones limitadas'],
          ],
          note: NOTE,
        },
      },
      {
        h2: 'Cuándo elegir cada uno',
        items: [
          'Elige Maya CRM si vendes principalmente por WhatsApp, quieres pagar por equipo y necesitas formularios, eventos e IA sin integraciones.',
          'Elige HubSpot si tu equipo trabaja sobre todo por email y web, necesitas su ecosistema de integraciones o reportes avanzados, y el costo por asiento no es un problema.',
        ],
      },
    ],
    faqs: [
      { q: '¿HubSpot Starter incluye WhatsApp?', a: 'Según la documentación de HubSpot revisada el 25-11-2026, el canal de WhatsApp requiere Marketing Hub o Service Hub Professional o Enterprise.' },
      { q: '¿Maya CRM cobra por usuario?', a: `No. Cobra por equipo: Inicia incluye ${inicia.users} usuarios, Crece ${crece.users} y Escala ${escala.users}.` },
      { q: '¿Puedo pasar mis contactos de HubSpot a Maya CRM?', a: 'Sí. Exportas tus contactos a Excel o CSV y los importas en Maya CRM, que detecta las columnas y controla los duplicados.' },
    ],
    related: ['crm-whatsapp', 'comparar/kommo', 'agentes-ia-whatsapp', 'campanas-whatsapp'],
    sources: [
      { label: 'HubSpot: Starter Customer Platform', url: 'https://www.hubspot.com/products/crm/starter' },
      { label: 'HubSpot: conectar WhatsApp a la bandeja', url: 'https://knowledge.hubspot.com/inbox/connect-whatsapp-to-the-conversations-inbox' },
    ],
  },
  {
    slug: 'comparar/kommo',
    kind: 'comparativa',
    title: 'Maya CRM vs Kommo: precios, WhatsApp e IA comparados',
    description: 'Comparación de Maya CRM y Kommo: precio por usuario o por equipo, pago mensual, WhatsApp oficial, IA, campañas, formularios y eventos.',
    h1: 'Maya CRM vs Kommo: comparación honesta',
    answer: `Kommo y Maya CRM se parecen: los dos usan la API oficial de WhatsApp, tienen bandeja compartida con Instagram y Messenger, e incluyen IA por créditos. La diferencia principal está en cómo se paga: Kommo cobra por usuario (desde US$ 25 al mes en el plan Base) y su periodo mínimo es de 6 meses; Maya CRM cobra por equipo (${maya(inicia)}) y se puede pagar mes a mes. Maya suma páginas de eventos con registro, ticket y check-in.`,
    updated: REVIEWED,
    sections: [
      {
        h2: 'Comparación rápida',
        table: {
          head: ['', 'Maya CRM', 'Kommo'],
          rows: [
            ['Modelo de precio', `Por equipo: ${maya(inicia)}, ${maya(crece)}, ${maya(escala)}`, 'Por usuario: Base US$ 25, Advanced US$ 35, Pro US$ 45 al mes'],
            ['Periodo mínimo', 'Mensual, sin permanencia', 'Desde 6 meses (no hay pago mes a mes)'],
            ['WhatsApp', 'API oficial o número propio por QR', 'API oficial'],
            ['Instagram y Messenger', 'Sí', 'Sí (también TikTok)'],
            ['IA', 'Agentes con tus documentos; créditos según plan', 'Créditos de IA por usuario; agentes desde Advanced'],
            ['Campañas de WhatsApp', 'Desde Crece', 'Desde Advanced'],
            ['Email marketing', 'Sí, en todos los planes', 'Correo sincronizado y automático; newsletters: no verificado'],
            ['Formularios web', 'Sí', 'Sí'],
            ['Páginas de eventos con registro y ticket', 'Sí', NV],
            ['Antes de contratar', 'Demo en vivo por WhatsApp', 'Prueba de 14 días sin tarjeta'],
          ],
          note: NOTE,
        },
      },
      {
        h2: 'Ejemplo de costo para un equipo de 5 personas',
        paragraphs: [
          `Con Kommo Base, 5 usuarios son 5 × US$ 25 = US$ 125 al mes, pagados por adelantado al menos por 6 meses. Con Maya CRM, el plan Crece incluye ${crece.users} usuarios por US$ ${crece.usd} al mes y se puede pagar mes a mes. Los mensajes de WhatsApp por la API oficial se pagan aparte a Meta en ambos casos.`,
        ],
      },
    ],
    faqs: [
      { q: '¿Kommo tiene pago mensual?', a: 'Según su página de precios revisada el 25-11-2026, el periodo mínimo es de 6 meses; también ofrece 9 meses, 1 y 2 años.' },
      { q: '¿Cuál tiene eventos con registro?', a: 'Maya CRM incluye páginas de eventos con registro, ticket único y check-in. En Kommo no lo pudimos verificar.' },
      { q: '¿Puedo migrar de Kommo a Maya CRM?', a: 'Sí. Exportas tus contactos a Excel o CSV y los importas en Maya CRM.' },
    ],
    related: ['crm-whatsapp', 'comparar/leadsales', 'comparar/wati', 'bandeja-unificada'],
    sources: [{ label: 'Kommo: precios', url: 'https://www.kommo.com/pricing/' }],
  },
  {
    slug: 'comparar/leadsales',
    kind: 'comparativa',
    title: 'Maya CRM vs Leadsales: comparación de precios y WhatsApp',
    description: 'Maya CRM y Leadsales comparados: precio por cuenta, API oficial de WhatsApp, IA, campañas masivas y cómo empezar.',
    h1: 'Maya CRM vs Leadsales: qué incluye cada uno',
    answer: `Leadsales cobra por cuenta desde US$ 97 al mes (plan Básico, 3 usuarios), y su plan Básico conecta WhatsApp por la vía web, no por la API oficial; su agente de IA se paga aparte. Maya CRM empieza en ${maya(inicia)} con la API oficial o el número propio por QR, e incluye agentes de IA en todos los planes. Las campañas masivas de WhatsApp están en Leadsales desde el plan Profesional y en Maya desde Crece (US$ ${crece.usd}).`,
    updated: REVIEWED,
    sections: [
      {
        h2: 'Comparación rápida',
        table: {
          head: ['', 'Maya CRM', 'Leadsales'],
          rows: [
            ['Precio de entrada', maya(inicia), 'Básico: US$ 97 al mes (3 usuarios)'],
            ['Plan intermedio', maya(crece), 'Profesional: US$ 133 al mes (4 usuarios)'],
            ['WhatsApp', 'API oficial o número propio por QR en todos los planes', 'Básico: vía web; Profesional y Avanzado: API oficial'],
            ['Mensajes de WhatsApp', 'Los cobra Meta directo, sin recargo de Maya', 'Saldo prepagado; incluye US$ 10–20 al mes según plan'],
            ['Agente de IA', 'Incluido en todos los planes', 'Extra: desde US$ 87 al mes'],
            ['Campañas masivas de WhatsApp', 'Desde Crece', 'Desde Profesional'],
            ['Formularios y eventos', 'Incluidos', NV],
            ['Antes de contratar', 'Demo en vivo por WhatsApp', 'Prueba de 14 días'],
          ],
          note: NOTE,
        },
      },
    ],
    faqs: [
      { q: '¿Leadsales usa la API oficial de WhatsApp?', a: 'Según su página de precios revisada el 25-11-2026, los planes Profesional y Avanzado usan la API oficial; el Básico conecta por la vía web.' },
      { q: '¿El agente de IA tiene costo extra en Maya CRM?', a: 'No. Todos los planes incluyen agentes de IA y créditos mensuales; si se acaban, se compran recargas.' },
      { q: '¿Cuál es más barato para 3 usuarios?', a: `Con los precios de lista revisados, Leadsales Básico cuesta US$ 97 al mes. En Maya CRM, Inicia (${inicia.users} usuarios) más un usuario adicional cuesta US$ ${inicia.usd + EXTRA_USER_USD}, y Crece (${crece.users} usuarios) US$ ${crece.usd}.` },
    ],
    related: ['crm-whatsapp', 'agentes-ia-whatsapp', 'comparar/kommo', 'comparar/wati'],
    sources: [{ label: 'Leadsales: precios', url: 'https://leadsales.io/precios/' }],
  },
  {
    slug: 'comparar/wati',
    kind: 'comparativa',
    title: 'Maya CRM vs Wati: comparación para WhatsApp Business API',
    description: 'Maya CRM y Wati comparados: precio, contactos activos, mensajes, IA, campañas, email, formularios y eventos.',
    h1: 'Maya CRM vs Wati: más allá de la bandeja de WhatsApp',
    answer: `Wati es una plataforma centrada en la API oficial de WhatsApp: cobra por cuenta según contactos activos al mes (Growth desde US$ 59 mensual) y añade cargos por mensaje según su tarifa. Maya CRM también usa la API oficial, pero es un CRM completo: suma email marketing, formularios web, eventos con registro e Instagram y Messenger, desde ${maya(inicia)}, y no añade recargo a los mensajes que cobra Meta.`,
    updated: REVIEWED,
    sections: [
      {
        h2: 'Comparación rápida',
        table: {
          head: ['', 'Maya CRM', 'Wati'],
          rows: [
            ['Precio (pago mensual)', `${maya(inicia)} · ${maya(crece)}`, 'Growth US$ 59 (3 usuarios), Pro US$ 119 (5 usuarios)'],
            ['Límite de contactos', `${inicia.contacts} a ${escala.contacts} contactos según plan`, 'Contactos activos al mes: 500 (Growth), 1.000 (Pro)'],
            ['Mensajes de WhatsApp', 'Los cobra Meta, sin recargo de Maya', 'Cargos adicionales por mensaje según tarifa de Wati'],
            ['IA', 'Agentes con tus documentos en todos los planes', 'Créditos de IA y agentes según plan'],
            ['Email marketing', 'Sí', NV],
            ['Formularios web y eventos', 'Sí', 'Formularios dentro de WhatsApp (Flows); web y eventos: no verificado'],
            ['Instagram y Messenger', 'Sí', 'Instagram sí; Messenger: no verificado'],
            ['Antes de contratar', 'Demo en vivo por WhatsApp', 'Prueba de 7 días'],
          ],
          note: NOTE,
        },
      },
    ],
    faqs: [
      { q: '¿Wati cobra los mensajes aparte?', a: 'Su página de precios indica que se aplican cargos adicionales por mensaje según su tarifa. Maya CRM no suma recargo a lo que cobra Meta.' },
      { q: '¿Maya CRM sirve si solo quiero WhatsApp?', a: 'Sí. Puedes empezar solo con la bandeja de WhatsApp y sumar formularios, eventos o campañas cuando quieras.' },
      { q: '¿Puedo verlo antes de pagar?', a: 'Maya CRM te muestra una demo en vivo por WhatsApp antes de contratar; Wati ofrece una prueba de 7 días.' },
    ],
    related: ['crm-whatsapp', 'campanas-whatsapp', 'comparar/leadsales', 'bandeja-unificada'],
    sources: [{ label: 'Wati: precios', url: 'https://www.wati.io/es/pricing/' }],
  },
];
