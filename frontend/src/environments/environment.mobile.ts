/**
 * Configuración del build empaquetado en la app nativa (Capacitor).
 *
 * A diferencia del build web, aquí el HTML se sirve desde el WebView
 * (`https://localhost`), así que `apiUrl` DEBE ser absoluta y el backend debe
 * aceptar ese origen en CORS.
 */
export const environment = {
  production: true,
  apiUrl: 'https://api.mayacrm.site',
  siteUrl: 'https://mayacrm.site',
  /** Número de WhatsApp al que apunta cada CTA de la landing (E.164 sin +). */
  whatsappNumber: '51975760418',
};
