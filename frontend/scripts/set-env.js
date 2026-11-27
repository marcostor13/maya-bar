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
const whatsappNumber = process.env.WHATSAPP_NUMBER || '51991172822';
// Clave pública (va en el HTML): el secreto vive solo en el backend.
const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY ?? '0x4AAAAAAFyRq2FkWFMu0uNq';
// Píxel de Meta para la publicidad propia (HU84); público, va en el HTML. Vacío = sin píxel.
const metaPixelId = process.env.META_PIXEL_ID ?? '1379074650817335';

const content = `export const environment = {
  production: true,
  apiUrl: '${apiUrl}',
  siteUrl: '${siteUrl}',
  /** Número de WhatsApp al que apunta cada CTA de la landing (E.164 sin +). */
  whatsappNumber: '${whatsappNumber}',
  /** Clave pública de Cloudflare Turnstile (captcha del registro). Vacía = sin captcha. */
  turnstileSiteKey: '${turnstileSiteKey}',
  /** Píxel de Meta (HU84): solo carga con consentimiento y en páginas públicas. */
  metaPixelId: '${metaPixelId}',
};
`;

const envDir = path.join(__dirname, '..', 'src', 'environments');
fs.mkdirSync(envDir, { recursive: true });
fs.writeFileSync(path.join(envDir, 'environment.prod.ts'), content);
console.log('[set-env] environment.prod.ts -> apiUrl:', apiUrl, '| siteUrl:', siteUrl);
