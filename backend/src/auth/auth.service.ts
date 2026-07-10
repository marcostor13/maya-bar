import { BadRequestException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { TenantsService } from '../tenants/tenants.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
    private tenantsService: TenantsService,
    private mailService: MailService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findOneByEmail(email);
    if (user && (await bcrypt.compare(pass, user.password))) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unused-vars
      const { password: _pw, ...result } = (user as any).toObject();
      return result;
    }
    return null;
  }

  login(user: Record<string, any>) {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    const payload = {
      sub: user['_id'],
      email: user['email'],
      role: user['role'],
      tenantId:
        (user['tenantId'] as { toString: () => string } | null)?.toString() ??
        null,
      localIds: ((user['localIds'] as unknown[]) ?? []).map((id) => String(id)),
      mustChangePassword: !!user['mustChangePassword'],
    };
    const result = {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user['_id'],
        email: user['email'],
        name: user['name'],
        role: user['role'],
        tenantId: user['tenantId'],
        mustChangePassword: !!user['mustChangePassword'],
        referralCode: user['referralCode'] ?? null,
      },
    };
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    return result;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const updatedUser = await this.usersService.changePassword(
      userId,
      currentPassword,
      newPassword,
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    return this.login((updatedUser as any).toObject());
  }

  async registerTenant(data: {
    name: string;
    ruc?: string;
    email: string;
    phone?: string;
    ownerName: string;
    ownerPassword: string;
  }) {
    const tenant = await this.tenantsService.create({
      name: data.name,
      email: data.email,
      ruc: data.ruc,
      phone: data.phone,
    });

    const user = await this.usersService.create({
      email: data.email,
      password: data.ownerPassword,
      name: data.ownerName,
      role: 'TENANT_ADMIN',
      tenantId: tenant._id,
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    return this.login((user as any).toObject());
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findOneByEmail(email);
    if (!user) {
      // Return success even if user doesn't exist to prevent email enumeration
      return { message: 'Si el correo existe, se ha enviado un código.' };
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await this.usersService.saveResetCode(String(user._id), code, expires);
    await this.mailService.sendPasswordResetEmail(user.email, code);

    return { message: 'Si el correo existe, se ha enviado un código.' };
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    const user = await this.usersService.findOneByEmail(email);
    // Mensaje único para TODAS las ramas de fallo: igual que forgotPassword,
    // no se debe revelar si el email existe (anti-enumeración).
    if (
      !user ||
      !user.resetPasswordCode ||
      user.resetPasswordCode !== code ||
      !user.resetPasswordExpires ||
      new Date() > user.resetPasswordExpires
    ) {
      throw new BadRequestException('El código es inválido o ha expirado');
    }

    await this.usersService.resetPassword(String(user._id), newPassword);
    return { message: 'Contraseña actualizada exitosamente' };
  }
}
