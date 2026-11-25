/**
 * Rutas de las páginas de contenido (HU79). Van aparte de los datos para que
 * `app.routes.ts` no cargue todo el texto en el bundle principal; la prueba
 * `content.spec.ts` comprueba que coincidan con `CONTENT_PAGES`.
 */
export const CONTENT_SLUGS = [
  'crm-whatsapp',
  'agentes-ia-whatsapp',
  'campanas-whatsapp',
  'formularios',
  'eventos',
  'bandeja-unificada',
  'industrias/inmobiliarias',
  'industrias/academias',
  'industrias/clinicas',
  'industrias/eventos',
  'comparar/hubspot',
  'comparar/kommo',
  'comparar/leadsales',
  'comparar/wati',
  'guias/costo-mensajes-whatsapp-peru',
  'guias/whatsapp-business-a-api-oficial',
] as const;
