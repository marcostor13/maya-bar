import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Direcciones que no son internet público: loopback, redes privadas,
 * link-local (metadatos de la nube), CGNAT, multicast y reservadas.
 */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  return (
    v6 === '::' ||
    v6 === '::1' ||
    /^f[cd]/.test(v6) ||
    /^fe[89ab]/.test(v6) ||
    /^ff/.test(v6)
  );
}

/**
 * Rechaza hosts que resuelven a la red interna. Protege las conexiones que
 * abre el servidor hacia direcciones que escribe un usuario (webs a
 * analizar, servidores de correo): sin esto servirían para llegar a la red
 * privada, a localhost o a los metadatos de la nube (SSRF).
 */
export async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true })).map((a) => a.address);
  if (!addresses.length || addresses.some(isPrivateAddress))
    throw new Error('La dirección no es pública');
}
