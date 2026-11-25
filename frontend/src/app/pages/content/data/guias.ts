import { ContentPage } from '../content.model';
import { WA_PERU, fmtUsd as usd } from '../facts';
const META_PRICING = { label: 'Meta: precios de WhatsApp Business Platform', url: WA_PERU.source };

/** HU83: guías. Tarifas de `docs/costos-mensajes.md` (fuente oficial de Meta). */
export const GUIDE_PAGES: ContentPage[] = [
  {
    slug: 'guias/costo-mensajes-whatsapp-peru',
    kind: 'guia',
    title: 'Cuánto cuesta enviar mensajes de WhatsApp en Perú (2026)',
    description: `Tarifas de Meta para WhatsApp Business API en Perú desde el ${WA_PERU.effective}: marketing, utilidad, autenticación y servicio, con ejemplos de cálculo.`,
    h1: 'Cuánto cuesta enviar mensajes de WhatsApp en Perú en 2026',
    answer: `Desde el ${WA_PERU.effective}, Meta cobra en Perú ${usd(WA_PERU.marketing)} por cada mensaje de marketing entregado y ${usd(WA_PERU.utility)} por cada mensaje de utilidad o de autenticación, según su tarifa de lista para WhatsApp Business Platform. Lo que escribe el cliente no se cobra, y los primeros 1.000 mensajes de servicio al mes por número son gratis. Con WhatsApp Business en el celular no se paga por mensaje, pero no hay plantillas ni envíos masivos oficiales.`,
    updated: '2026-11-25',
    sections: [
      {
        h2: 'Tarifas de Meta para Perú',
        table: {
          head: ['Categoría', 'Para qué se usa', 'Precio por mensaje entregado'],
          rows: [
            ['Marketing', 'Promociones, lanzamientos, invitaciones, reactivación', usd(WA_PERU.marketing)],
            ['Utilidad', 'Confirmaciones, recordatorios, estado de un pedido', usd(WA_PERU.utility)],
            ['Autenticación', 'Códigos de verificación', usd(WA_PERU.authentication)],
            ['Servicio', 'Respuestas libres dentro de las 24 h desde el último mensaje del cliente', `${usd(WA_PERU.utility)} (los primeros 1.000 al mes por número, gratis)`],
          ],
          note: `Tarifa de lista de Meta en USD vigente desde el ${WA_PERU.effective}. Meta solo cambia sus tarifas el día 1 de cada trimestre. Los descuentos por volumen no están incluidos.`,
        },
      },
      {
        h2: 'Qué es gratis',
        items: [
          'Los mensajes que te envía el cliente.',
          'Los primeros 1.000 mensajes de servicio al mes por cada número.',
          'Las conversaciones que empiezan desde un anuncio de clic a WhatsApp: ventana gratuita de hasta 7 días.',
        ],
      },
      {
        h2: 'Ejemplos de cálculo',
        items: [
          `Campaña de marketing a 1.000 contactos con número peruano: 1.000 × ${usd(WA_PERU.marketing)} = ${usd(1000 * WA_PERU.marketing)}.`,
          `500 recordatorios de cita (utilidad): 500 × ${usd(WA_PERU.utility)} = ${usd(500 * WA_PERU.utility)}.`,
          'Responder 800 consultas de clientes en el mes dentro de las 24 h: gratis, porque están dentro de los primeros 1.000 mensajes de servicio.',
        ],
        paragraphs: [
          'El precio depende del país del destinatario (por su prefijo), no del tuyo: un mensaje a un número de México se cobra con la tarifa de México.',
        ],
      },
      {
        h2: 'Cómo pagarlo y controlarlo',
        paragraphs: [
          'Con la API oficial, Meta cobra a la cuenta de WhatsApp Business de tu empresa. En Maya CRM los mensajes se pagan a Meta directamente y Maya no les suma recargo; el panel estima lo que cuesta cada envío según estas tarifas.',
        ],
      },
    ],
    faqs: [
      { q: '¿Cuánto cuesta un mensaje de marketing de WhatsApp en Perú?', a: `${usd(WA_PERU.marketing)} por mensaje entregado, según la tarifa de lista de Meta vigente desde el ${WA_PERU.effective}.` },
      { q: '¿Responder a un cliente tiene costo?', a: 'Las respuestas libres dentro de las 24 horas son mensajes de servicio: los primeros 1.000 al mes por número son gratis y después se cobran como utilidad.' },
      { q: '¿Se cobra si el mensaje no llega?', a: 'No. Meta cobra por mensaje entregado.' },
      { q: '¿Maya CRM cobra algo por mensaje?', a: 'No. Los mensajes de la API oficial los cobra Meta directamente; Maya CRM no les suma recargo.' },
    ],
    related: ['campanas-whatsapp', 'guias/whatsapp-business-a-api-oficial', 'crm-whatsapp', 'comparar/wati'],
    sources: [META_PRICING],
  },
  {
    slug: 'guias/whatsapp-business-a-api-oficial',
    kind: 'guia',
    title: 'De WhatsApp Business a la API oficial: guía paso a paso',
    description: 'Qué cambia al pasar de la app de WhatsApp Business a la API oficial (Cloud API), qué necesitas y cómo hacerlo sin perder clientes.',
    h1: 'Cómo pasar de WhatsApp Business a la API oficial de WhatsApp',
    answer: 'La API oficial de WhatsApp Business (Cloud API de Meta) permite que varias personas atiendan un mismo número desde un CRM, conectar un agente de IA, usar plantillas aprobadas para escribir primero y enviar campañas. Para usarla necesitas un portafolio de negocio en Meta, un número de teléfono para la API y un nombre visible aprobado; después pagas a Meta por los mensajes que envías según su tarifa.',
    updated: '2026-11-25',
    sections: [
      {
        h2: 'App de WhatsApp Business vs API oficial',
        table: {
          head: ['', 'App de WhatsApp Business', 'API oficial (Cloud API)'],
          rows: [
            ['Quién atiende', 'Un teléfono y dispositivos vinculados', 'Todo el equipo desde un CRM'],
            ['Plantillas para escribir primero', 'No', 'Sí, aprobadas por Meta'],
            ['Campañas masivas', 'Listas de difusión limitadas', 'Sí, con plantillas'],
            ['Agente de IA e integraciones', 'Respuestas rápidas básicas', 'Sí'],
            ['Costo por mensaje', 'Sin costo', 'Tarifa de Meta por mensaje entregado'],
          ],
        },
      },
      {
        h2: 'Qué necesitas',
        items: [
          'Un portafolio de negocio en Meta (Business Manager), idealmente verificado.',
          'Un número de teléfono que vaya a usar la API.',
          'Un nombre visible que cumpla las políticas de Meta.',
          'Un método de pago en la cuenta de WhatsApp Business para los mensajes.',
        ],
      },
      {
        h2: 'Pasos',
        steps: [
          'Crea o elige tu portafolio de negocio en Meta y, si puedes, verifica la empresa.',
          'Conecta el número a la Cloud API desde tu CRM (en Maya CRM, desde la configuración de WhatsApp).',
          'Define el nombre visible y espera su aprobación.',
          'Crea tus primeras plantillas (bienvenida, seguimiento, recordatorio) y envíalas a aprobación.',
          'Agrega el método de pago en Meta y prueba enviando mensajes a tu equipo.',
          'Avisa a tus clientes: siguen escribiendo al mismo número y ahora los atiende todo el equipo.',
        ],
      },
      {
        h2: 'Si no quieres hacerlo solo',
        paragraphs: [
          'La Implementación Pro de Maya CRM, de pago único, incluye conectar la API oficial, verificar tu negocio en Meta y entrenar al agente de IA. Mientras tanto, también puedes conectar tu número propio por QR para empezar a usar la bandeja.',
        ],
      },
    ],
    faqs: [
      { q: '¿Pierdo mi número al pasar a la API?', a: 'No necesariamente: puedes conectar el mismo número a la API. Revisa en Meta las condiciones de tu número antes de migrar.' },
      { q: '¿Cuánto cuesta la API oficial?', a: 'Meta cobra por mensaje entregado según el país y la categoría; en Perú, desde US$ 0,03 por mensaje de utilidad. Los mensajes que escribe el cliente son gratis.' },
      { q: '¿Necesito verificar mi empresa en Meta?', a: 'La verificación del negocio es recomendable y Meta la pide para ampliar límites de envío y ciertos permisos.' },
    ],
    related: ['guias/costo-mensajes-whatsapp-peru', 'crm-whatsapp', 'campanas-whatsapp', 'agentes-ia-whatsapp'],
    sources: [
      META_PRICING,
      { label: 'Meta: WhatsApp Cloud API', url: 'https://developers.facebook.com/docs/whatsapp/cloud-api' },
    ],
  },
];
