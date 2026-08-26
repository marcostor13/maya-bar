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
  expiresAt: number;
}

@Injectable()
export class ActiveUserCache {
  private readonly entries = new Map<string, Entry>();

  async isActive(userId: string): Promise<boolean> {
    const cached = this.entries.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.active;

    const user = await this.users.findById(userId);
    // Un usuario borrado tampoco debe poder seguir usando su token.
    const active = !!user && user.isActive !== false;
    this.entries.set(userId, { active, expiresAt: Date.now() + TTL_MS });
    return active;
  }

  /** Se llama al desactivar, reactivar o eliminar, para no esperar al TTL. */
  invalidate(userId: string): void {
    this.entries.delete(userId);
  }

  constructor(private users: UsersService) {}
}
