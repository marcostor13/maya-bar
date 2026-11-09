import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { RefreshToken } from './refresh-token.schema';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService, hashResetCode } from '../users/users.service';
import { TenantsService } from '../tenants/tenants.service';
import { UserSessionsService } from '../users/user-sessions.service';
import { MailService } from '../mail/mail.service';
import { createHash } from 'crypto';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

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
    save: jest.fn().mockResolvedValue(undefined),
    toObject: jest.fn().mockReturnValue({ ...plain }),
  } as Record<string, any>;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  const usersService = {
    findOneByEmail: jest.fn(),
    findOneByEmailAnyStatus: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    changePassword: jest.fn(),
    saveResetCode: jest.fn(),
    registerResetFailure: jest.fn(),
    resetPassword: jest.fn(),
  };
  const tenantsService = { create: jest.fn(), remove: jest.fn() };
  const sessions = {
    revoke: jest.fn().mockResolvedValue(undefined),
    touchAccess: jest.fn().mockResolvedValue(undefined),
  };
  const mailService = {
    isConfigured: false,
    sendPasswordResetEmail: jest.fn(),
    sendEmailVerificationEmail: jest.fn(),
  };
  const jwtService = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
  // El modelo de refresh tokens: login emite uno en cada sesión.
  const refreshTokenModel = {
    create: jest.fn().mockResolvedValue({}),
    findOne: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jwtService.sign.mockReturnValue('signed.jwt.token');
    mailService.isConfigured = false;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: jwtService },
        { provide: UsersService, useValue: usersService },
        { provide: TenantsService, useValue: tenantsService },
        { provide: MailService, useValue: mailService },
        { provide: UserSessionsService, useValue: sessions },
        {
          provide: getModelToken(RefreshToken.name),
          useValue: refreshTokenModel,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ─── validateUser ──────────────────────────────────────────────────────────

  describe('validateUser', () => {
    it('returns the user without password when credentials are correct', async () => {
      const user = makeUserDoc();
      usersService.findOneByEmailAnyStatus.mockResolvedValue(user);

      const result = await service.validateUser('user@test.com', PASSWORD);

      expect(usersService.findOneByEmailAnyStatus).toHaveBeenCalledWith(
        'user@test.com',
      );
      expect(result).toBeTruthy();
      expect(result?.email).toBe('user@test.com');
      expect(result?.password).toBeUndefined();
    });

    it('returns null when the password is wrong', async () => {
      usersService.findOneByEmailAnyStatus.mockResolvedValue(makeUserDoc());

      const result = await service.validateUser('user@test.com', 'otra-clave');
      expect(result).toBeNull();
    });

    it('returns null when the user does not exist', async () => {
      usersService.findOneByEmailAnyStatus.mockResolvedValue(null);

      const result = await service.validateUser('nadie@test.com', PASSWORD);
      expect(result).toBeNull();
    });

    it('explica que la cuenta está desactivada si la contraseña es correcta', async () => {
      const user = makeUserDoc();
      (user as unknown as { isActive: boolean }).isActive = false;
      usersService.findOneByEmailAnyStatus.mockResolvedValue(user);

      await expect(
        service.validateUser('inactivo@test.com', PASSWORD),
      ).rejects.toThrow(/desactivada/i);
    });

    it('no revela la desactivación si la contraseña es incorrecta', async () => {
      const user = makeUserDoc();
      (user as unknown as { isActive: boolean }).isActive = false;
      usersService.findOneByEmailAnyStatus.mockResolvedValue(user);

      // Mismo resultado que un email inexistente: así no se puede averiguar
      // qué cuentas existen probando contraseñas al azar.
      const result = await service.validateUser('inactivo@test.com', 'mala');
      expect(result).toBeNull();
    });
  });

  // ─── login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('signs a JWT payload with sub, role, tenantId (string) and localIds (strings)', async () => {
      const user = makeUserDoc().toObject();

      const result = await service.login(user);

      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: user._id,
        email: 'user@test.com',
        role: 'TENANT_ADMIN',
        tenantId: tenantOid.toString(),
        localIds: [localOid.toString()],
        mustChangePassword: false,
        iatMs: expect.any(Number) as number,
      });
      expect(result.access_token).toBe('signed.jwt.token');
      // Toda sesión nueva anota el último acceso.
      expect(sessions.touchAccess).toHaveBeenCalledWith(String(user._id));
    });

    it('returns the public user object without password', async () => {
      const user = makeUserDoc().toObject();

      const result = await service.login(user);

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

    it('uses tenantId null and empty localIds when the user has none (SUPERADMIN)', async () => {
      const user = makeUserDoc({
        role: 'SUPERADMIN',
        tenantId: null,
        localIds: undefined,
      }).toObject();

      await service.login(user);

      const payload = jwtService.sign.mock.calls[0][0];
      expect(payload.tenantId).toBeNull();
      expect(payload.localIds).toEqual([]);
    });
  });

  // ─── registerTenant ────────────────────────────────────────────────────────

  describe('registerTenant', () => {
    beforeEach(() => {
      usersService.findOneByEmailAnyStatus.mockResolvedValue(null);
    });

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
      if (!('access_token' in result)) throw new Error('sin sesión');
      expect(result.access_token).toBe('signed.jwt.token');
      expect(result.user.email).toBe('owner@bar.com');
    });

    const signup = {
      name: 'Bar Maya',
      email: 'owner@bar.com',
      ownerName: 'Owner',
      ownerPassword: PASSWORD,
    };

    it('con correo configurado no abre sesión: crea la cuenta sin confirmar y manda el código', async () => {
      mailService.isConfigured = true;
      tenantsService.create.mockResolvedValue({ _id: tenantOid });
      const owner = makeUserDoc({
        email: 'owner@bar.com',
        emailVerified: false,
      });
      usersService.create.mockResolvedValue(owner);

      const result = await service.registerTenant(signup);

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ emailVerified: false }),
      );
      expect(result).toEqual({
        verificationRequired: true,
        email: 'owner@bar.com',
      });
      expect(refreshTokenModel.create).not.toHaveBeenCalled();
      const [to, code] = mailService.sendEmailVerificationEmail.mock
        .calls[0] as [string, string];
      expect(to).toBe('owner@bar.com');
      expect(code).toMatch(/^\d{6}$/);
      // En la base solo queda el hash del código.
      expect(owner.emailVerificationCodeHash).toBe(sha256(code));
      expect(owner.emailVerificationAttempts).toBe(0);
      expect(owner.save).toHaveBeenCalled();
    });

    it('descarta un registro anterior sin confirmar con el mismo email', async () => {
      usersService.findOneByEmailAnyStatus.mockResolvedValue(
        makeUserDoc({ emailVerified: false, tenantId: tenantOid }),
      );
      tenantsService.create.mockResolvedValue({ _id: tenantOid });
      usersService.create.mockResolvedValue(makeUserDoc());

      await service.registerTenant(signup);

      expect(tenantsService.remove).toHaveBeenCalledWith(String(tenantOid));
    });

    it('nunca descarta una cuenta confirmada o creada por un administrador', async () => {
      usersService.findOneByEmailAnyStatus.mockResolvedValue(makeUserDoc());
      tenantsService.create.mockRejectedValue(new Error('conflict'));

      await expect(service.registerTenant(signup)).rejects.toThrow('conflict');
      expect(tenantsService.remove).not.toHaveBeenCalled();
    });
  });

  // ─── verificación de correo ────────────────────────────────────────────────

  describe('validateUser con correo sin confirmar', () => {
    it('rechaza el login con el código EMAIL_NOT_VERIFIED', async () => {
      usersService.findOneByEmailAnyStatus.mockResolvedValue(
        makeUserDoc({ emailVerified: false }),
      );
      const err = (await service
        .validateUser('user@test.com', PASSWORD)
        .catch((e: unknown) => e)) as UnauthorizedException;
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(err.getResponse()).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    });

    it('no revela que falta confirmar si la contraseña es incorrecta', async () => {
      usersService.findOneByEmailAnyStatus.mockResolvedValue(
        makeUserDoc({ emailVerified: false }),
      );
      await expect(
        service.validateUser('user@test.com', 'mala'),
      ).resolves.toBeNull();
    });
  });

  describe('verifyEmail', () => {
    const pending = (overrides: Record<string, unknown> = {}) =>
      makeUserDoc({
        emailVerified: false,
        emailVerificationCodeHash: sha256('123456'),
        emailVerificationExpires: new Date(Date.now() + 60_000),
        emailVerificationAttempts: 0,
        ...overrides,
      });

    it('con el código correcto confirma la cuenta y abre sesión', async () => {
      const user = pending();
      usersService.findOneByEmailAnyStatus.mockResolvedValue(user);

      const result = await service.verifyEmail('user@test.com', ' 123456 ');

      expect(user.emailVerified).toBe(true);
      expect(user.emailVerificationCodeHash).toBeUndefined();
      expect(user.save).toHaveBeenCalled();
      expect(result.access_token).toBe('signed.jwt.token');
    });

    it('un código incorrecto suma un intento y al quinto invalida el código', async () => {
      const user = pending({ emailVerificationAttempts: 3 });
      usersService.findOneByEmailAnyStatus.mockResolvedValue(user);

      await expect(
        service.verifyEmail('user@test.com', '000000'),
      ).rejects.toThrow(BadRequestException);
      expect(user.emailVerificationAttempts).toBe(4);
      expect(user.emailVerificationCodeHash).toBe(sha256('123456'));

      await expect(
        service.verifyEmail('user@test.com', '000000'),
      ).rejects.toThrow(BadRequestException);
      expect(user.emailVerificationCodeHash).toBeUndefined();
      // Ni el código correcto vale ya.
      await expect(
        service.verifyEmail('user@test.com', '123456'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza un código caducado', async () => {
      usersService.findOneByEmailAnyStatus.mockResolvedValue(
        pending({ emailVerificationExpires: new Date(Date.now() - 1000) }),
      );
      await expect(
        service.verifyEmail('user@test.com', '123456'),
      ).rejects.toThrow(BadRequestException);
    });

    it('no sirve para cuentas ya confirmadas ni inexistentes', async () => {
      usersService.findOneByEmailAnyStatus.mockResolvedValue(
        pending({ emailVerified: undefined }),
      );
      await expect(
        service.verifyEmail('user@test.com', '123456'),
      ).rejects.toThrow(BadRequestException);
      usersService.findOneByEmailAnyStatus.mockResolvedValue(null);
      await expect(service.verifyEmail('x@test.com', '123456')).rejects.toThrow(
        BadRequestException,
      );
      expect(refreshTokenModel.create).not.toHaveBeenCalled();
    });
  });

  describe('resendVerification', () => {
    it('manda un código nuevo solo a cuentas sin confirmar, con la misma respuesta siempre', async () => {
      usersService.findOneByEmailAnyStatus.mockResolvedValue(makeUserDoc());
      const verified = await service.resendVerification('user@test.com');
      expect(mailService.sendEmailVerificationEmail).not.toHaveBeenCalled();

      usersService.findOneByEmailAnyStatus.mockResolvedValue(
        makeUserDoc({ emailVerified: false }),
      );
      const pendingRes = await service.resendVerification('user@test.com');
      expect(mailService.sendEmailVerificationEmail).toHaveBeenCalledTimes(1);
      expect(pendingRes).toEqual(verified);
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
        resetPasswordCode: hashResetCode('123456'),
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
      // Las sesiones anteriores dejan de valer.
      expect(sessions.revoke).toHaveBeenCalledWith(String(user._id), {
        refresh: true,
      });
      expect(result).toEqual({
        message: 'Contraseña actualizada exitosamente',
      });
    });

    it('rejects a wrong code', async () => {
      const user = makeUserDoc({
        resetPasswordCode: hashResetCode('123456'),
        resetPasswordExpires: futureDate(),
      });
      usersService.findOneByEmail.mockResolvedValue(user);

      await expect(
        service.resetPassword('user@test.com', '000000', 'Nueva123!'),
      ).rejects.toThrow('El código es inválido o ha expirado');
      expect(usersService.resetPassword).not.toHaveBeenCalled();
      // Cuenta el intento fallido para cortar la fuerza bruta.
      expect(usersService.registerResetFailure).toHaveBeenCalledWith(
        String(user._id),
      );
    });

    it('rejects the stored hash typed as if it were the code', async () => {
      const user = makeUserDoc({
        resetPasswordCode: hashResetCode('123456'),
        resetPasswordExpires: futureDate(),
      });
      usersService.findOneByEmail.mockResolvedValue(user);

      await expect(
        service.resetPassword(
          'user@test.com',
          hashResetCode('123456'),
          'Nueva123!',
        ),
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
        resetPasswordCode: hashResetCode('123456'),
        resetPasswordExpires: new Date(Date.now() - 1000),
      });
      usersService.findOneByEmail.mockResolvedValue(user);

      await expect(
        service.resetPassword('user@test.com', '123456', 'Nueva123!'),
      ).rejects.toThrow('El código es inválido o ha expirado');
      expect(usersService.resetPassword).not.toHaveBeenCalled();
    });

    it('rejects when the user does not exist with the SAME message (anti-enumeración)', async () => {
      usersService.findOneByEmail.mockResolvedValue(null);

      await expect(
        service.resetPassword('nadie@test.com', '123456', 'Nueva123!'),
      ).rejects.toThrow(
        new BadRequestException('El código es inválido o ha expirado'),
      );
    });
  });

  describe('refresh', () => {
    /** Registro tal como lo devuelve mongoose, con save() espiable. */
    const registro = (over = {}) => {
      const doc = {
        userId: new Types.ObjectId(),
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: null,
        save: jest.fn(),
        ...over,
      };
      doc.save.mockResolvedValue(doc);
      return doc;
    };

    it('rechaza un token que no existe', async () => {
      refreshTokenModel.findOne.mockResolvedValue(null);
      await expect(service.refresh('inventado')).rejects.toThrow(
        'La sesión ha caducado',
      );
    });

    it('rechaza un token ya usado: la rotación lo dejó revocado', async () => {
      refreshTokenModel.findOne.mockResolvedValue(
        registro({ revokedAt: new Date() }),
      );
      await expect(service.refresh('usado')).rejects.toThrow(
        'La sesión ha caducado',
      );
    });

    it('rechaza un token caducado', async () => {
      refreshTokenModel.findOne.mockResolvedValue(
        registro({ expiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(service.refresh('viejo')).rejects.toThrow(
        'La sesión ha caducado',
      );
    });

    it('revoca el anterior y emite uno nuevo al renovar', async () => {
      const doc = registro();
      refreshTokenModel.findOne.mockResolvedValue(doc);
      usersService.findById.mockResolvedValue(makeUserDoc());

      const res = await service.refresh('bueno');

      // Rotación: el usado queda marcado y se crea otro distinto.
      expect(doc.revokedAt).toBeInstanceOf(Date);
      expect(doc.save).toHaveBeenCalled();
      expect(refreshTokenModel.create).toHaveBeenCalled();
      expect(res.access_token).toBe('signed.jwt.token');
      expect(res.refresh_token).toEqual(expect.any(String));
    });

    it('cierra TODAS las sesiones si la cuenta ya no está activa', async () => {
      refreshTokenModel.findOne.mockResolvedValue(registro());
      usersService.findById.mockResolvedValue(makeUserDoc({ isActive: false }));

      await expect(service.refresh('bueno')).rejects.toThrow(
        'Tu cuenta ya no está activa',
      );
      expect(refreshTokenModel.updateMany).toHaveBeenCalled();
    });
  });
});
