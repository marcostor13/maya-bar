import {
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

  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async onModuleInit() {
    // Reparar emails con mayúsculas/espacios ANTES de buscar el superadmin,
    // si no la comparación exacta podría no encontrarlo.
    await this.normalizeEmails();
    const superadmin = await this.userModel.findOne({ role: 'SUPERADMIN' });
    if (!superadmin) {
      this.logger.log('Creating initial superadmin user...');
      await this.create({
        email: 'admin@bar.com',
        password: 'B4r$uper#2026!',
        name: 'Super Admin',
        role: 'SUPERADMIN',
      });
      this.logger.log(
        'Superadmin created — email: admin@bar.com | password: B4r$uper#2026!',
      );
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
      this.logger.error('Error normalizando tenantId de usuarios', err as Error);
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
    dto: { name: string; email: string; role: string },
  ): Promise<{ user: User; tempPassword: string }> {
    if (!CREATABLE_ROLES.includes(dto.role))
      throw new ForbiddenException('Rol no permitido');
    const tempPassword = 'Tmp@' + crypto.randomBytes(4).toString('hex');
    const referralCode =
      dto.role === 'IMPULSADOR'
        ? crypto.randomBytes(4).toString('hex').toUpperCase()
        : undefined;
    const user = await this.create({
      ...dto,
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
    updates: { name?: string; role?: string; isActive?: boolean },
  ): Promise<User | null> {
    if (updates.role && !CREATABLE_ROLES.includes(updates.role))
      throw new ForbiddenException('Rol no permitido');
    return this.userModel
      .findOneAndUpdate(
        { _id: id, tenantId: new Types.ObjectId(tenantId) },
        updates,
        { new: true, projection: { password: 0 } },
      )
      .exec();
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

  async saveResetCode(userId: string, code: string, expires: Date): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      resetPasswordCode: code,
      resetPasswordExpires: expires,
    }).exec();
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
