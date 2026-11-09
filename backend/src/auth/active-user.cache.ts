import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';

/**
 * Caché de "¿este usuario sigue activo?" para que `JwtStrategy` pueda revocar
 * tokens sin consultar Mongo en cada petición.
 *
 * El TTL corto es el compromiso: un usuario desactivado deja de poder trabajar
 * como mucho un minuto después, y el coste es una lectura por usuario y minuto
 * en lugar de una por petición.
 */
const TTL_MS = 60_000;

interface Entry {
  active: boolean;
  /** Milisegundos epoch: los tokens emitidos antes ya no valen. */
  validFromMs: number;
  expiresAt: number;
}

export type SessionState = 'ok' | 'inactive' | 'revoked';

@Injectable()
export class ActiveUserCache {
  private readonly entries = new Map<string, Entry>();

  async isActive(userId: string): Promise<boolean> {
    return (await this.entry(userId)).active;
  }

  /**
   * Estado de un token concreto: además de que el usuario siga activo, que no
   * se haya emitido antes de la última revocación (restablecer el acceso,
   * cambiar el rol o el correo). `issuedAtMs` es el `iatMs` del token; los
   * tokens anteriores a ese campo usan `iat` (segundos) redondeado hacia arriba.
   */
  async check(userId: string, issuedAtMs?: number): Promise<SessionState> {
    const e = await this.entry(userId);
    if (!e.active) return 'inactive';
    if (issuedAtMs !== undefined && issuedAtMs < e.validFromMs)
      return 'revoked';
    return 'ok';
  }

  private async entry(userId: string): Promise<Entry> {
    const cached = this.entries.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached;

    const user = await this.users.findById(userId);
    const entry: Entry = {
      // Un usuario borrado tampoco debe poder seguir usando su token.
      active: !!user && user.isActive !== false,
      validFromMs: user?.sessionsValidFrom
        ? new Date(user.sessionsValidFrom).getTime()
        : 0,
      expiresAt: Date.now() + TTL_MS,
    };
    this.entries.set(userId, entry);
    return entry;
  }

  /** Se llama al desactivar, reactivar, eliminar o revocar, para no esperar al TTL. */
  invalidate(userId: string): void {
    this.entries.delete(userId);
  }

  constructor(private users: UsersService) {}
}
