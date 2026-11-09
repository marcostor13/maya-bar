import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from './user.schema';
import { RefreshToken } from '../auth/refresh-token.schema';
import { ActiveUserCache } from '../auth/active-user.cache';

/**
 * Sesiones de un usuario: revocarlas y anotar el último acceso.
 *
 * Revocar fija `sessionsValidFrom`, así `JwtStrategy` rechaza los access tokens
 * emitidos antes. `refresh: true` revoca además los refresh tokens (la persona
 * tiene que volver a entrar); sin él, el frontend renueva en silencio y recibe
 * los datos nuevos (rol, correo).
 */
@Injectable()
export class UserSessionsService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(RefreshToken.name) private refreshTokens: Model<RefreshToken>,
    private activeUsers: ActiveUserCache,
  ) {}

  async revoke(userId: string, opts: { refresh: boolean }): Promise<void> {
    const id = new Types.ObjectId(userId);
    await this.userModel
      .updateOne({ _id: id }, { $set: { sessionsValidFrom: new Date() } })
      .exec();
    if (opts.refresh)
      await this.refreshTokens
        .updateMany(
          { userId: id, revokedAt: null },
          { $set: { revokedAt: new Date() } },
        )
        .exec();
    this.activeUsers.invalidate(userId);
  }

  async touchAccess(userId: string): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: new Types.ObjectId(userId) },
        { $set: { lastAccessAt: new Date() } },
      )
      .exec();
  }
}
