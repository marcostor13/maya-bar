import {
  BadRequestException,
  ConflictException,
  Injectable,
  OnModuleInit,
  Logger,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from './user.schema';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { RolesService } from '../roles/roles.service';
import { DeletionImpact, USER_REFERENCES } from './user-references';

/**
 * Roles del sistema. Ya no es la lista definitiva: una empresa puede crear los
 * suyos, así que la validación consulta también los roles configurados. Se
 * conserva como respaldo por si la colección de roles aún no está sembrada.
 */
const CREATABLE_ROLES = [
  'TENANT_ADMIN',
  'MANAGER',
  'HOST',
  'SERVER',
  'KITCHEN',
  'BAR',
  'MARKETING',
  'IMPULSADOR',
];

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private roles: RolesService,
  ) {}

  async onModuleInit() {
    // Reparar emails con mayúsculas/espacios ANTES de buscar el superadmin,
    // si no la comparación exacta podría no encontrarlo.
    await this.normalizeEmails();
    const superadmin = await this.userModel.findOne({ role: 'SUPERADMIN' });
    if (!superadmin) {
      const email = process.env.SEED_ADMIN_EMAIL;
      const password = process.env.SEED_ADMIN_PASSWORD;
      if (!email || !password) {
        this.logger.warn(
          'No existe un SUPERADMIN y faltan SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD — seed omitido',
        );
      } else {
        await this.create({
          email,
          password,
          name: 'Super Admin',
          role: 'SUPERADMIN',
        });
        this.logger.log(`Superadmin creado — email: ${email}`);
      }
    }
    await this.normalizeTenantIds();
  }

  /**
   * Normaliza el email: minúsculas + sin espacios. El login, la recuperación
   * de contraseña y la creación de usuarios deben usar SIEMPRE este formato,
   * de lo contrario un email guardado con mayúsculas nunca coincide en las
   * búsquedas (la contraseña temporal "no funciona" y el correo de recuperación
   * "no llega" porque el usuario no se encuentra).
   */
  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Migración idempotente: pasa a minúsculas/recorta cualquier email guardado
   * con mayúsculas o espacios, reparando cuentas existentes que no podían
   * iniciar sesión ni recibir el correo de recuperación.
   */
  private async normalizeEmails(): Promise<void> {
    try {
      const res = await this.userModel.collection.updateMany(
        {
          $expr: {
            $ne: ['$email', { $toLower: { $trim: { input: '$email' } } }],
          },
        },
        [{ $set: { email: { $toLower: { $trim: { input: '$email' } } } } }],
      );
      if (res.modifiedCount) {
        this.logger.log(`Normalizados ${res.modifiedCount} emails de usuarios`);
      }
    } catch (err) {
      this.logger.error('Error normalizando emails de usuarios', err as Error);
    }
  }

  /**
   * Migración idempotente: convierte cualquier tenantId guardado como string
   * a ObjectId. Datos antiguos quedaron como string y no coincidían con las
   * consultas tipadas (no se listaban los usuarios, fallaba el ref de impulsador).
   */
  private async normalizeTenantIds(): Promise<void> {
    try {
      const res = await this.userModel.collection.updateMany(
        { tenantId: { $type: 'string' } },
        [{ $set: { tenantId: { $toObjectId: '$tenantId' } } }],
      );
      if (res.modifiedCount) {
        this.logger.log(
          `Normalizados ${res.modifiedCount} tenantId de string a ObjectId`,
        );
      }
    } catch (err) {
      this.logger.error(
        'Error normalizando tenantId de usuarios',
        err as Error,
      );
    }
  }

  async create(userData: {
    email: string;
    password: string;
    name?: string;
    role?: string;
    tenantId?: string | Types.ObjectId;
    localIds?: Types.ObjectId[];
    mustChangePassword?: boolean;
  }): Promise<User> {
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    // Forzar ObjectId: un tenantId string se guardaba como string y rompía
    // las consultas tenant-scoped (listar usuarios, ref de impulsador, etc.).
    const tenantId =
      typeof userData.tenantId === 'string'
        ? new Types.ObjectId(userData.tenantId)
        : userData.tenantId;
    const user = new this.userModel({
      ...userData,
      email: this.normalizeEmail(userData.email),
      tenantId,
      password: hashedPassword,
    });
    return user.save();
  }

  async createTenantUser(
    tenantId: string,
    dto: { name: string; email: string; role: string; localIds?: string[] },
  ): Promise<{ user: User; tempPassword: string }> {
    await this.assertRoleAllowed(tenantId, dto.role);
    const tempPassword = 'Tmp@' + crypto.randomBytes(4).toString('hex');
    const referralCode =
      dto.role === 'IMPULSADOR'
        ? crypto.randomBytes(4).toString('hex').toUpperCase()
        : undefined;
    const user = await this.create({
      ...dto,
      localIds: (dto.localIds ?? [])
        .filter((l) => Types.ObjectId.isValid(l))
        .map((l) => new Types.ObjectId(l)),
      password: tempPassword,
      tenantId,
      mustChangePassword: true,
      ...(referralCode ? { referralCode } : {}),
    });
    return { user, tempPassword };
  }

  async updateUser(
    id: string,
    tenantId: string,
    updates: {
      name?: string;
      role?: string;
      isActive?: boolean;
      localIds?: string[];
    },
  ): Promise<User | null> {
    if (updates.role) await this.assertRoleAllowed(tenantId, updates.role);
    const { localIds, ...rest } = updates;
    const payload: Record<string, unknown> = { ...rest };
    // Lista vacía es una elección válida: significa "todos los locales".
    if (localIds !== undefined)
      payload.localIds = localIds
        .filter((l) => Types.ObjectId.isValid(l))
        .map((l) => new Types.ObjectId(l));

    return this.userModel
      .findOneAndUpdate(
        { _id: id, tenantId: new Types.ObjectId(tenantId) },
        payload,
        { new: true, projection: { password: 0 } },
      )
      .exec();
  }

  /**
   * Acepta los roles del sistema y los que la empresa haya creado. El respaldo
   * cubre el caso de que la colección de roles todavía no exista.
   */
  private async assertRoleAllowed(
    tenantId: string,
    role: string,
  ): Promise<void> {
    let permitidos: string[] = CREATABLE_ROLES;
    try {
      const configurados = await this.roles.assignableKeys(tenantId);
      if (configurados.length) permitidos = configurados;
    } catch {
      // Sin roles configurados se usa la lista del sistema.
    }
    if (!permitidos.includes(role))
      throw new ForbiddenException('Rol no permitido');
  }

  async deactivateUser(id: string, tenantId: string): Promise<void> {
    await this.userModel
      .findOneAndUpdate(
        {
          _id: id,
          tenantId: new Types.ObjectId(tenantId),
          role: { $ne: 'TENANT_ADMIN' },
        },
        { isActive: false },
      )
      .exec();
  }

  // ── Borrado definitivo ────────────────────────────────────────────────────

  /** Cuenta lo que este usuario tiene asociado, para enseñarlo antes de borrar. */
  async deletionImpact(id: string, tenantId: string): Promise<DeletionImpact> {
    const user = await this.requireTenantUser(id, tenantId);
    const uid = user._id;
    const db = this.userModel.db;

    const counts = await Promise.all(
      USER_REFERENCES.map(async (ref) => ({
        collection: ref.collection,
        label: ref.label,
        count: await db
          .collection(ref.collection)
          .countDocuments({ [ref.field]: uid }),
      })),
    );

    const items = counts.filter((c) => c.count > 0);
    return {
      userId: String(uid),
      name: user.name ?? '',
      email: user.email,
      role: user.role,
      items,
      total: items.reduce((sum, i) => sum + i.count, 0),
    };
  }

  /**
   * Elimina el usuario después de reasignar todo lo que creó.
   *
   * `reassignTo` vacío significa "dejarlo a nivel de empresa": el campo se borra
   * en vez de apuntar a otra persona, que es como se comportan los registros que
   * no tienen dueño (los ve cualquier administrador). Nunca se borra primero y
   * se reasigna después: en ese orden quedarían huérfanos si algo fallara.
   */
  async deleteUser(
    id: string,
    tenantId: string,
    actingUserId: string,
    reassignTo?: string,
  ): Promise<{ deleted: true; reassigned: number }> {
    const user = await this.requireTenantUser(id, tenantId);
    await this.assertRemovable(user, tenantId, actingUserId);

    let destination: Types.ObjectId | undefined;
    if (reassignTo) {
      const target = await this.requireTenantUser(reassignTo, tenantId);
      if (String(target._id) === String(user._id))
        throw new BadRequestException(
          'No se puede reasignar el contenido al mismo usuario que se elimina',
        );
      destination = target._id;
    }

    const uid = user._id;
    const db = this.userModel.db;
    let reassigned = 0;

    for (const ref of USER_REFERENCES) {
      const filter = { [ref.field]: uid };
      const update = destination
        ? { $set: { [ref.field]: destination } }
        : { $unset: { [ref.field]: '' } };
      try {
        const res = await db
          .collection(ref.collection)
          .updateMany(filter, update);
        reassigned += res.modifiedCount;
      } catch (err) {
        // Reasignar contactos puede chocar con los índices únicos si el destino
        // ya tiene el mismo email o teléfono. Se avisa en vez de dejar el
        // borrado a medias.
        throw new ConflictException(
          `No se pudo reasignar "${ref.label}": el usuario destino ya tiene registros equivalentes. ` +
            `Elige otro destino o déjalos a nivel de empresa. (${String(err)})`,
        );
      }
    }

    await this.userModel.deleteOne({ _id: uid }).exec();
    this.logger.log(
      `Usuario ${user.email} eliminado; ${reassigned} registro(s) ${destination ? 'reasignados' : 'liberados'}`,
    );
    return { deleted: true, reassigned };
  }

  /** Usuarios a los que se puede transferir el contenido de otro. */
  async reassignCandidates(id: string, tenantId: string): Promise<User[]> {
    return this.userModel
      .find(
        {
          tenantId: new Types.ObjectId(tenantId),
          _id: { $ne: new Types.ObjectId(id) },
          isActive: true,
        },
        { password: 0 },
      )
      .sort({ name: 1 })
      .exec();
  }

  private async requireTenantUser(id: string, tenantId: string): Promise<User> {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Usuario no encontrado');
    const user = await this.userModel
      .findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
      })
      .exec();
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  /** Las barandillas que impiden dejar la empresa sin acceso. */
  private async assertRemovable(
    user: User,
    tenantId: string,
    actingUserId: string,
  ): Promise<void> {
    if (String(user._id) === actingUserId)
      throw new ForbiddenException('No puedes eliminar tu propio usuario');

    if (user.role === 'SUPERADMIN')
      throw new ForbiddenException(
        'El superadministrador no pertenece a la empresa y no se puede eliminar desde aquí',
      );

    if (user.role === 'TENANT_ADMIN') {
      const admins = await this.userModel.countDocuments({
        tenantId: new Types.ObjectId(tenantId),
        role: 'TENANT_ADMIN',
        isActive: true,
      });
      if (admins <= 1)
        throw new ForbiddenException(
          'Es el último administrador activo: asigna otro antes de eliminarlo',
        );
    }
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<User> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new UnauthorizedException('Contraseña actual incorrecta');
    user.password = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    return user.save();
  }

  async saveResetCode(
    userId: string,
    code: string,
    expires: Date,
  ): Promise<void> {
    await this.userModel
      .findByIdAndUpdate(userId, {
        resetPasswordCode: code,
        resetPasswordExpires: expires,
      })
      .exec();
  }

  async resetPassword(userId: string, newPassword: string): Promise<User> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('Usuario no encontrado');
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordCode = undefined;
    user.resetPasswordExpires = undefined;
    // Si la cuenta tenía contraseña temporal, al recuperarla ya estableció una
    // definitiva: no debe forzarse otro cambio en el siguiente login.
    user.mustChangePassword = false;
    return user.save();
  }

  async findOneByEmail(email: string): Promise<User | null> {
    return this.userModel
      .findOne({ email: this.normalizeEmail(email), isActive: true })
      .exec();
  }

  /**
   * Incluye a los desactivados, para que el login pueda distinguir "contraseña
   * incorrecta" de "cuenta desactivada". La distinción solo se revela cuando la
   * contraseña es correcta, así que no sirve para averiguar qué emails existen.
   */
  async findOneByEmailAnyStatus(email: string): Promise<User | null> {
    return this.userModel.findOne({ email: this.normalizeEmail(email) }).exec();
  }

  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id).exec();
  }

  async findAllByTenant(tenantId: string): Promise<User[]> {
    return this.userModel
      .find({ tenantId: new Types.ObjectId(tenantId) }, { password: 0 })
      .sort({ createdAt: -1 })
      .exec();
  }
}
