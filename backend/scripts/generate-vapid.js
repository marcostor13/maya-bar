/**
 * Genera el par de claves VAPID que firman las notificaciones push.
 *
 *   node scripts/generate-vapid.js
 *
 * Copia la salida al entorno del backend (Coolify) y publica SOLO la pública en
 * el frontend — el backend ya la sirve en `GET /push/public-key`, así que no
 * hace falta duplicarla en el bundle. Regenerarlas invalida todas las
 * suscripciones existentes: los dispositivos tendrán que volver a activarlas.
 */
const webpush = require('web-push');

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log('# Añade estas variables al backend:');
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:soporte@mayacrm.site');
