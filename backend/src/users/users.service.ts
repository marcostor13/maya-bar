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

const STAFF_ROLES = [
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
  }

  async create(userData: {
    email: string;
    password: string;
    name?: string;
    role?: string;
    tenantId?: any;
    localIds?: Types.ObjectId[];
    mustChangePassword?: boolean;
  }): Promise<User> {
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const user = new this.userModel({ ...userData, password: hashedPassword });
    return user.save();
  }

  async createTenantUser(
    tenantId: string,
    dto: { name: string; email: string; role: string },
  ): Promise<{ user: User; tempPassword: string }> {
    if (!STAFF_ROLES.includes(dto.role))
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
    if (updates.role && !STAFF_ROLES.includes(updates.role))
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
    return user.save();
  }

  async findOneByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email, isActive: true }).exec();
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
