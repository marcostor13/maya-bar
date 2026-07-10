import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { TenantsService } from '../tenants/tenants.service';
import { MailService } from '../mail/mail.service';

// ─── helpers ─────────────────────────────────────────────────────────────────

const PASSWORD = 'Secreta123!';
// Cost 4: hash real pero rápido para tests.
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

const tenantOid = new Types.ObjectId();
const localOid = new Types.ObjectId();

function makeUserDoc(overrides: Partial<Record<string, unknown>> = {}) {
  const plain = {
    _id: new Types.ObjectId().toString(),
    email: 'user@test.com',
    name: 'Test User',
    role: 'TENANT_ADMIN',
    tenantId: tenantOid,
    localIds: [localOid],
    isActive: true,
    mustChangePassword: false,
    password: PASSWORD_HASH,
    ...overrides,
  };
  return {
    ...plain,
    toObject: jest.fn().mockReturnValue({ ...plain }),
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  const usersService = {
    findOneByEmail: jest.fn(),
    create: jest.fn(),
    changePassword: jest.fn(),
    saveResetCode: jest.fn(),
    resetPassword: jest.fn(),
  };
  const tenantsService = { create: jest.fn() };
  const mailService = { sendPasswordResetEmail: jest.fn() };
  const jwtService = { sign: jest.fn().mockReturnValue('signed.jwt.token') };

  beforeEach(async () => {
    jest.clearAllMocks();
    jwtService.sign.mockReturnValue('signed.jwt.token');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: jwtService },
        { provide: UsersService, useValue: usersService },
        { provide: TenantsService, useValue: tenantsService },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ─── validateUser ──────────────────────────────────────────────────────────

  describe('validateUser', () => {
    it('returns the user without password when credentials are correct', async () => {
      const user = makeUserDoc();
      usersService.findOneByEmail.mockResolvedValue(user);

      const result = await service.validateUser('user@test.com', PASSWORD);

      expect(usersService.findOneByEmail).toHaveBeenCalledWith('user@test.com');
      expect(result).toBeTruthy();
      expect(result.email).toBe('user@test.com');
      expect(result.password).toBeUndefined();
    });

    it('returns null when the password is wrong', async () => {
      usersService.findOneByEmail.mockResolvedValue(makeUserDoc());

      const result = await service.validateUser('user@test.com', 'otra-clave');
      expect(result).toBeNull();
    });

    it('returns null when the user does not exist', async () => {
      usersService.findOneByEmail.mockResolvedValue(null);

      const result = await service.validateUser('nadie@test.com', PASSWORD);
      expect(result).toBeNull();
    });

    it('returns null for inactive users (findOneByEmail filters isActive)', async () => {
      // UsersService.findOneByEmail consulta { isActive: true }, por lo que un
      // usuario desactivado llega aquí como null.
      usersService.findOneByEmail.mockResolvedValue(null);

      const result = await service.validateUser('inactivo@test.com', PASSWORD);
      expect(result).toBeNull();
    });
  });

  // ─── login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('signs a JWT payload with sub, role, tenantId (string) and localIds (strings)', () => {
      const user = makeUserDoc().toObject();

      const result = service.login(user);

      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: user._id,
        email: 'user@test.com',
        role: 'TENANT_ADMIN',
        tenantId: tenantOid.toString(),
        localIds: [localOid.toString()],
        mustChangePassword: false,
      });
      expect(result.access_token).toBe('signed.jwt.token');
    });

    it('returns the public user object without password', () => {
      const user = makeUserDoc().toObject();

      const result = service.login(user);

      expect(result.user).toEqual({
        id: user._id,
        email: 'user@test.com',
        name: 'Test User',
        role: 'TENANT_ADMIN',
        tenantId: tenantOid,
        mustChangePassword: false,
        referralCode: null,
      });
      expect((result.user as Record<string, unknown>).password).toBeUndefined();
    });

    it('uses tenantId null and empty localIds when the user has none (SUPERADMIN)', () => {
      const user = makeUserDoc({
        role: 'SUPERADMIN',
        tenantId: null,
        localIds: undefined,
      }).toObject();

      service.login(user);

      const payload = jwtService.sign.mock.calls[0][0];
      expect(payload.tenantId).toBeNull();
      expect(payload.localIds).toEqual([]);
    });
  });

  // ─── registerTenant ────────────────────────────────────────────────────────

  describe('registerTenant', () => {
    it('creates the tenant and a TENANT_ADMIN user bound to it', async () => {
      const tenant = { _id: tenantOid, name: 'Bar Maya' };
      tenantsService.create.mockResolvedValue(tenant);
      const owner = makeUserDoc({ email: 'owner@bar.com', name: 'Owner' });
      usersService.create.mockResolvedValue(owner);

      const result = await service.registerTenant({
        name: 'Bar Maya',
        ruc: '123',
        email: 'owner@bar.com',
        phone: '999',
        ownerName: 'Owner',
        ownerPassword: PASSWORD,
      });

      expect(tenantsService.create).toHaveBeenCalledWith({
        name: 'Bar Maya',
        email: 'owner@bar.com',
        ruc: '123',
        phone: '999',
      });
      expect(usersService.create).toHaveBeenCalledWith({
        email: 'owner@bar.com',
        password: PASSWORD,
        name: 'Owner',
        role: 'TENANT_ADMIN',
        tenantId: tenantOid,
      });
      expect(result.access_token).toBe('signed.jwt.token');
      expect(result.user.email).toBe('owner@bar.com');
    });
  });

  // ─── changePassword ────────────────────────────────────────────────────────

  describe('changePassword', () => {
    it('propagates UnauthorizedException when the current password is wrong', async () => {
      usersService.changePassword.mockRejectedValue(
        new UnauthorizedException('Contraseña actual incorrecta'),
      );

      await expect(
        service.changePassword('uid', 'mala', 'Nueva123!'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns a fresh login (mustChangePassword false) on success', async () => {
      const updated = makeUserDoc({ mustChangePassword: false });
      usersService.changePassword.mockResolvedValue(updated);

      const result = await service.changePassword('uid', PASSWORD, 'Nueva123!');

      expect(usersService.changePassword).toHaveBeenCalledWith(
        'uid',
        PASSWORD,
        'Nueva123!',
      );
      expect(result.access_token).toBe('signed.jwt.token');
      expect(jwtService.sign.mock.calls[0][0].mustChangePassword).toBe(false);
    });
  });

  // ─── forgotPassword ────────────────────────────────────────────────────────

  describe('forgotPassword', () => {
    it('returns the generic message without sending mail when the email does not exist', async () => {
      usersService.findOneByEmail.mockResolvedValue(null);

      const result = await service.forgotPassword('nadie@test.com');

      expect(result).toEqual({
        message: 'Si el correo existe, se ha enviado un código.',
      });
      expect(usersService.saveResetCode).not.toHaveBeenCalled();
      expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('saves a 6-digit code with ~15 min expiry and emails it when the user exists', async () => {
      const user = makeUserDoc();
      usersService.findOneByEmail.mockResolvedValue(user);

      const before = Date.now();
      const result = await service.forgotPassword('user@test.com');

      expect(usersService.saveResetCode).toHaveBeenCalledTimes(1);
      const [userId, code, expires] = usersService.saveResetCode.mock
        .calls[0] as [string, string, Date];
      expect(userId).toBe(String(user._id));
      expect(code).toMatch(/^\d{6}$/);
      const delta = expires.getTime() - before;
      expect(delta).toBeGreaterThan(14 * 60 * 1000);
      expect(delta).toBeLessThanOrEqual(15 * 60 * 1000 + 5000);

      expect(mailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        user.email,
        code,
      );
      // Mismo mensaje genérico que el caso inexistente (anti-enumeración).
      expect(result).toEqual({
        message: 'Si el correo existe, se ha enviado un código.',
      });
    });
  });

  // ─── resetPassword ─────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    const futureDate = () => new Date(Date.now() + 10 * 60 * 1000);

    it('resets the password when the code is valid and not expired', async () => {
      const user = makeUserDoc({
        resetPasswordCode: '123456',
        resetPasswordExpires: futureDate(),
      });
      usersService.findOneByEmail.mockResolvedValue(user);

      const result = await service.resetPassword(
        'user@test.com',
        '123456',
        'Nueva123!',
      );

      expect(usersService.resetPassword).toHaveBeenCalledWith(
        String(user._id),
        'Nueva123!',
      );
      expect(result).toEqual({
        message: 'Contraseña actualizada exitosamente',
      });
    });

    it('rejects a wrong code', async () => {
      const user = makeUserDoc({
        resetPasswordCode: '123456',
        resetPasswordExpires: futureDate(),
      });
      usersService.findOneByEmail.mockResolvedValue(user);

      await expect(
        service.resetPassword('user@test.com', '000000', 'Nueva123!'),
      ).rejects.toThrow('El código es inválido o ha expirado');
      expect(usersService.resetPassword).not.toHaveBeenCalled();
    });

    it('rejects when no code was ever requested', async () => {
      const user = makeUserDoc({
        resetPasswordCode: undefined,
        resetPasswordExpires: undefined,
      });
      usersService.findOneByEmail.mockResolvedValue(user);

      await expect(
        service.resetPassword('user@test.com', '123456', 'Nueva123!'),
      ).rejects.toThrow('El código es inválido o ha expirado');
    });

    it('rejects an expired code', async () => {
      const user = makeUserDoc({
        resetPasswordCode: '123456',
        resetPasswordExpires: new Date(Date.now() - 1000),
      });
      usersService.findOneByEmail.mockResolvedValue(user);

      await expect(
        service.resetPassword('user@test.com', '123456', 'Nueva123!'),
      ).rejects.toThrow('El código es inválido o ha expirado');
      expect(usersService.resetPassword).not.toHaveBeenCalled();
    });

    it('rejects when the user does not exist', async () => {
      usersService.findOneByEmail.mockResolvedValue(null);

      // NOTA: la implementación lanza Error genérico (no HttpException), por lo
      // que Nest respondería 500. Se testea el comportamiento actual.
      await expect(
        service.resetPassword('nadie@test.com', '123456', 'Nueva123!'),
      ).rejects.toThrow('Usuario no encontrado');
    });
  });
});
