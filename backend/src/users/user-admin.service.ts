import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from './user.schema';
import { SECRET_FIELDS, UsersService, hashResetCode } from './users.service';
import { UserSessionsService } from './user-sessions.service';
import { AuditActor, UserAuditService, diff } from './user-audit.service';
import { MailService } from '../mail/mail.service';

export type ResetMode = 'email' | 'temp';

export interface UserUpdate {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  isActive?: boolean;
  localIds?: string[];
}

const HIDDEN = SECRET_FIELDS;

const RESET_CODE_TTL_MS = 15 * 60 * 1000;
const SEARCH_LIMIT = 50;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Administración de usuarios: lo usan el administrador de la empresa
 * (`/users`) y el superadministrador (`/admin/users`). Las reglas son las
 * mismas para los dos: nadie se gestiona a sí mismo por aquí y la empresa
 * nunca se queda sin un administrador activo.
 */
@Injectable()
export class UserAdminService {
  private readonly logger = new Logger(UserAdminService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private users: UsersService,
    private sessions: UserSessionsService,
    private audit: UserAuditService,
    private mail: MailService,
  ) {}

  // ── Lectura ──────────────────────────────────────────────────────────────

  /** Usuario de la empresa (404 si es de otra o es superadmin). */
  async target(id: string, tenantId: string): Promise<User> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(tenantId))
      throw new NotFoundException('Usuario no encontrado');
    const user = await this.userModel
      .findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        role: { $ne: 'SUPERADMIN' },
      })
      .exec();
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  /** Empresa de un usuario, para las rutas del superadministrador. */
  async tenantOf(id: string): Promise<string> {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Usuario no encontrado');
    const user = await this.userModel
      .findOne({ _id: new Types.ObjectId(id), role: { $ne: 'SUPERADMIN' } })
      .select({ tenantId: 1 })
      .lean()
      .exec();
    if (!user?.tenantId) throw new NotFoundException('Usuario no encontrado');
    return String(user.tenantId);
  }

  /** Búsqueda en toda la plataforma (superadministrador). */
  async search(q: string) {
    const term = q.trim();
    if (term.length < 2)
      throw new BadRequestException('Escribe al menos 2 caracteres');
    const rx = new RegExp(escapeRegex(term), 'i');
    const found = await this.userModel
      .find(
        { role: { $ne: 'SUPERADMIN' }, $or: [{ email: rx }, { name: rx }] },
        HIDDEN,
      )
      .sort({ email: 1 })
      .limit(SEARCH_LIMIT)
      .lean()
      .exec();
    const tenantIds = [
      ...new Set(found.map((u) => String(u.tenantId)).filter(Boolean)),
    ].map((id) => new Types.ObjectId(id));
    const tenants = await this.userModel.db
      .collection<{ _id: Types.ObjectId; name: string }>('tenants')
      .find({ _id: { $in: tenantIds } }, { projection: { name: 1 } })
      .toArray();
    const names = new Map(tenants.map((t) => [String(t._id), t.name]));
    return found.map((u) => ({
      ...u,
      tenantName: names.get(String(u.tenantId)) ?? '',
    }));
  }

  // ── Alta, edición, estado ────────────────────────────────────────────────

  async create(
    tenantId: string,
    dto: { name: string; email: string; role: string; localIds?: string[] },
    actor: AuditActor,
  ) {
    const res = await this.users.createTenantUser(tenantId, dto);
    await this.audit.record(actor, res.user, 'create', {
      role: { to: res.user.role },
    });
    // El documento recién guardado trae el hash: nunca sale en la respuesta.
    const plain = (
      res.user as unknown as { toObject?: () => Record<string, unknown> }
    ).toObject?.() ?? { ...(res.user as unknown as Record<string, unknown>) };
    for (const field of Object.keys(SECRET_FIELDS)) delete plain[field];
    return { user: plain as unknown as User, tempPassword: res.tempPassword };
  }

  async update(
    id: string,
    tenantId: string,
    dto: UserUpdate,
    actor: AuditActor,
  ): Promise<User> {
    const target = await this.target(id, tenantId);
    const self = String(target._id) === actor.userId;
    const roleChanges = dto.role !== undefined && dto.role !== target.role;
    const deactivating = dto.isActive === false && target.isActive !== false;
    const activating = dto.isActive === true && target.isActive === false;

    if (self && (roleChanges || deactivating))
      throw new ForbiddenException(
        roleChanges
          ? 'No puedes cambiar tu propio rol. Para dejar de ser administrador, traspasa la administración.'
          : 'No puedes desactivar tu propio usuario',
      );
    if (
      target.role === 'TENANT_ADMIN' &&
      ((roleChanges && dto.role !== 'TENANT_ADMIN') || deactivating)
    )
      await this.assertNotLastAdmin(target, tenantId);
    if (roleChanges) await this.users.assertRoleAllowed(tenantId, dto.role!);

    const set: Record<string, unknown> = {};
    if (dto.name !== undefined) set.name = dto.name.trim();
    if (dto.phone !== undefined) set.phone = dto.phone.trim();
    if (dto.role !== undefined) set.role = dto.role;
    if (dto.isActive !== undefined) set.isActive = dto.isActive;
    if (dto.localIds !== undefined)
      set.localIds = dto.localIds
        .filter((l) => Types.ObjectId.isValid(l))
        .map((l) => new Types.ObjectId(l));
    let emailChanges = false;
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      if (email !== target.email) {
        await this.assertEmailFree(email, String(target._id));
        set.email = email;
        emailChanges = true;
      }
    }

    let updated: User | null;
    try {
      updated = await this.userModel
        .findOneAndUpdate(
          { _id: target._id },
          { $set: set },
          { returnDocument: 'after', projection: HIDDEN },
        )
        .exec();
    } catch (err) {
      if ((err as { code?: number }).code === 11000)
        throw new ConflictException('Ese correo ya lo usa otra cuenta');
      throw err;
    }
    if (!updated) throw new NotFoundException('Usuario no encontrado');

    // Desactivar echa del todo; rol y correo solo obligan a renovar el token.
    if (deactivating)
      await this.sessions.revoke(String(target._id), { refresh: true });
    else if (roleChanges || emailChanges || activating)
      await this.sessions.revoke(String(target._id), { refresh: false });

    const before = target.toObject() as unknown as Record<string, unknown>;
    const after = { ...set } as Record<string, unknown>;
    if (after.localIds)
      after.localIds = (after.localIds as Types.ObjectId[]).map(String);
    before.localIds = ((before.localIds as Types.ObjectId[]) ?? []).map(String);
    const changes = diff(before, after, [
      'name',
      'email',
      'phone',
      'role',
      'localIds',
    ]);
    if (Object.keys(changes).length)
      await this.audit.record(actor, target, 'update', changes);
    if (deactivating || activating)
      await this.audit.record(
        actor,
        target,
        deactivating ? 'deactivate' : 'activate',
      );
    return updated;
  }

  deactivate(id: string, tenantId: string, actor: AuditActor) {
    return this.update(id, tenantId, { isActive: false }, actor);
  }

  // ── Recuperar el acceso ──────────────────────────────────────────────────

  /**
   * Invalida la contraseña actual y las sesiones del usuario.
   * - `email`: le envía el código de recuperación (el de "¿Olvidaste tu
   *   contraseña?"). El correo sale antes de tocar nada: si no hay proveedor
   *   configurado se rechaza y la contraseña sigue igual.
   * - `temp`: genera una contraseña temporal que se devuelve una sola vez.
   */
  async resetAccess(
    id: string,
    tenantId: string,
    mode: ResetMode,
    actor: AuditActor,
  ): Promise<{ mode: ResetMode; tempPassword?: string }> {
    const target = await this.target(id, tenantId);
    if (String(target._id) === actor.userId)
      throw new ForbiddenException(
        'Para cambiar tu contraseña usa "Cambiar contraseña" en tu perfil',
      );

    let tempPassword: string | undefined;
    let set: Record<string, unknown>;
    if (mode === 'email') {
      if (!this.mail.isConfigured)
        throw new BadRequestException(
          'No hay un proveedor de correo configurado. Usa una contraseña temporal.',
        );
      const code = crypto.randomInt(100000, 1000000).toString();
      await this.mail.sendPasswordResetEmail(target.email, code);
      set = {
        password: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10),
        resetPasswordCode: hashResetCode(code),
        resetPasswordExpires: new Date(Date.now() + RESET_CODE_TTL_MS),
        resetPasswordAttempts: 0,
        mustChangePassword: false,
      };
    } else {
      tempPassword = 'Tmp@' + crypto.randomBytes(4).toString('hex');
      set = {
        password: await bcrypt.hash(tempPassword, 10),
        mustChangePassword: true,
      };
    }
    await this.userModel
      .updateOne(
        { _id: target._id },
        mode === 'temp'
          ? {
              $set: set,
              $unset: {
                resetPasswordCode: 1,
                resetPasswordExpires: 1,
                resetPasswordAttempts: 1,
              },
            }
          : { $set: set },
      )
      .exec();
    await this.sessions.revoke(String(target._id), { refresh: true });
    await this.audit.record(actor, target, 'reset_access', {
      mode: { to: mode },
    });
    this.logger.log(
      `Acceso restablecido (${mode}) para el usuario ${String(target._id)}`,
    );
    return tempPassword ? { mode, tempPassword } : { mode };
  }

  // ── Traspaso de la administración ────────────────────────────────────────

  async transferAdmin(
    tenantId: string,
    actor: AuditActor,
    toUserId: string,
    newRole: string,
  ): Promise<{ ok: true }> {
    if (newRole === 'TENANT_ADMIN')
      throw new BadRequestException(
        'Elige el rol que tendrás tú después del traspaso',
      );
    const target = await this.target(toUserId, tenantId);
    const me = await this.target(actor.userId, tenantId);
    if (String(target._id) === actor.userId)
      throw new BadRequestException('Elige a otra persona');
    if (me.role !== 'TENANT_ADMIN')
      throw new ForbiddenException('Solo un administrador puede traspasar');
    if (target.isActive === false)
      throw new BadRequestException('El usuario destino está desactivado');
    await this.users.assertRoleAllowed(tenantId, newRole);

    // Primero se nombra al nuevo: si lo segundo falla, la empresa queda con dos
    // administradores, nunca con ninguno.
    await this.userModel
      .updateOne({ _id: target._id }, { $set: { role: 'TENANT_ADMIN' } })
      .exec();
    await this.userModel
      .updateOne({ _id: me._id }, { $set: { role: newRole } })
      .exec();
    await this.sessions.revoke(String(target._id), { refresh: false });
    await this.sessions.revoke(String(me._id), { refresh: false });
    await this.audit.record(actor, target, 'transfer_admin', {
      role: { from: target.role, to: 'TENANT_ADMIN' },
    });
    await this.audit.record(actor, me, 'transfer_admin', {
      role: { from: 'TENANT_ADMIN', to: newRole },
    });
    return { ok: true };
  }

  // ── Eliminar ─────────────────────────────────────────────────────────────

  async delete(
    id: string,
    tenantId: string,
    actor: AuditActor,
    reassignTo?: string,
  ) {
    const target = await this.target(id, tenantId);
    const res = await this.users.deleteUser(
      id,
      tenantId,
      actor.userId,
      reassignTo,
    );
    await this.sessions.revoke(id, { refresh: true });
    await this.audit.record(actor, target, 'delete', {
      reassigned: { to: res.reassigned },
      ...(reassignTo ? { reassignTo: { to: reassignTo } } : {}),
    });
    return res;
  }

  // ── Reglas ───────────────────────────────────────────────────────────────

  private async assertNotLastAdmin(target: User, tenantId: string) {
    const others = await this.userModel.countDocuments({
      tenantId: new Types.ObjectId(tenantId),
      role: 'TENANT_ADMIN',
      isActive: { $ne: false },
      _id: { $ne: target._id },
    });
    if (others === 0)
      throw new ForbiddenException(
        'Es el último administrador activo: nombra otro antes',
      );
  }

  private async assertEmailFree(email: string, exceptId: string) {
    const other = await this.users.findOneByEmailAnyStatus(email);
    if (other && String(other._id) !== exceptId)
      throw new ConflictException('Ese correo ya lo usa otra cuenta');
  }
}
