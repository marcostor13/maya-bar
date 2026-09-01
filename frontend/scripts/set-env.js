const fs = require('fs');
const path = require('path');

/**
 * `environment.prod.ts` no se versiona con los valores reales: este script lo
 * reescribe entero en cada build (imagen Docker en Coolify) a partir de
 * variables de entorno. Todo lo que la app lee en producción tiene que salir de
 * aquí; lo que no se escriba se pierde, porque el archivo se sobrescribe.
 */
const apiUrl = process.env.BACKEND_URL || 'https://api.mayacrm.site';
const siteUrl = process.env.SITE_URL || 'https://mayacrm.site';
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
