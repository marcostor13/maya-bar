/**
 * Entorno de las pruebas de navegador: el backend aislado que levanta
 * `backend/test/support/e2e-server.js`, en puertos distintos a los de desarrollo
 * para poder correrlas con `ng serve` y la API local abiertos.
 */
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3100',
  siteUrl: 'http://localhost:4300',
  /** Número de WhatsApp al que apunta cada CTA de la landing (formato E.164 sin +). */
  whatsappNumber: '51975760418',
};
