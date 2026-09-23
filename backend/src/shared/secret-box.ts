import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

/**
 * Cifrado simétrico (AES-256-GCM) para credenciales que la plataforma tiene
 * que poder volver a usar, como la contraseña de un buzón o el refresh token
 * de Gmail: un hash no serviría, y en claro quedarían expuestas en cualquier
 * copia de la base de datos.
 *
 * La clave sale de `EMAIL_ENCRYPTION_KEY` o, si no existe, de `JWT_SECRET`.
 * Cambiarla invalida lo cifrado: habrá que reconectar las cuentas.
 */
const PREFIX = 'v1';

export class SecretBox {
  private readonly key: Buffer;

  constructor(secret: string) {
    if (!secret) throw new Error('Falta la clave para cifrar credenciales');
    this.key = createHash('sha256').update(secret).digest();
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [PREFIX, iv, tag, data]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64')))
      .join(':');
  }

  decrypt(sealed: string): string {
    const [prefix, iv, tag, data] = sealed.split(':');
    if (prefix !== PREFIX || !iv || !tag || data === undefined)
      throw new Error('Credencial cifrada con un formato desconocido');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
