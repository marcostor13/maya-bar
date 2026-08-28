const fs = require('fs');
const path = require('path');

/**
 * Netlify no versiona secretos, así que este script reescribe
 * `environment.prod.ts` en cada build a partir de variables de entorno.
 * Todo lo que la app lee en producción tiene que salir de aquí: lo que no se
 * escriba se pierde, porque el archivo se sobrescribe entero.
 */
const apiUrl = process.env.BACKEND_URL || 'http://localhost:3000';
const siteUrl = process.env.SITE_URL || 'https://mayabar.marcostorresalarcon.com';
const whatsappNumber = process.env.WHATSAPP_NUMBER || '51975760418';

const content = `export const environment = {
  production: true,
  apiUrl: '${apiUrl}',
  siteUrl: '${siteUrl}',
  /** Número de WhatsApp al que apunta cada CTA de la landing (E.164 sin +). */
  whatsappNumber: '${whatsappNumber}',
};
`;

const envDir = path.join(__dirname, '..', 'src', 'environments');
fs.mkdirSync(envDir, { recursive: true });
fs.writeFileSync(path.join(envDir, 'environment.prod.ts'), content);
console.log('[set-env] environment.prod.ts -> apiUrl:', apiUrl, '| siteUrl:', siteUrl);
