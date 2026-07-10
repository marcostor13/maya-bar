import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  Logger,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { User } from './user.schema';

// ─── helpers ─────────────────────────────────────────────────────────────────

const tenantOid = new Types.ObjectId();
const userOid = new Types.ObjectId();

/**
 * Query mock "thenable": soporta tanto `await model.findOne(...)` (usado en
 * onModuleInit) como `model.findOne(...).exec()` (resto del servicio).
 */
function buildQuery(result: unknown) {
  const q: any = {
    sort: jest.fn(),
    exec: jest.fn().mockResolvedValue(result),
    then: (onFulfilled: any, onRejected: any) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
  q.sort.mockReturnValue(q);
  return q;
}

function createUserModel() {
  const model: any = jest.fn().mockImplementation((data: any) => {
    const doc: any = { ...data, save: jest.fn() };
    doc.save.mockResolvedValue(doc);
    return doc;
  });
  model.collection = {
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
  };
  model.findOne = jest.fn().mockReturnValue(buildQuery(null));
  model.findById = jest.fn().mockReturnValue(buildQuery(null));
  model.findOneAndUpdate = jest.fn().mockReturnValue(buildQuery(null));
  model.findByIdAndUpdate = jest.fn().mockReturnValue(buildQuery(null));
  model.find = jest.fn().mockReturnValue(buildQuery([]));
  return model;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('UsersService', () => {
  let service: UsersService;
  let userModel: any;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  const ORIGINAL_ENV = process.env;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Stub del entorno: copia limpia sin las vars de seed.
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SEED_ADMIN_EMAIL;
    delete process.env.SEED_ADMIN_PASSWORD;

    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    userModel = createUserModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: userModel },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = ORIGINAL_ENV;
  });

  function allLoggedText(): string {
    return [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((a) => String(a))
      .join(' ');
  }

  // ─── onModuleInit ──────────────────────────────────────────────────────────

  describe('onModuleInit', () => {
    it('skips the seed and creates nothing when SEED_ADMIN_* vars are missing', async () => {
      userModel.findOne.mockReturnValue(buildQuery(null)); // no hay SUPERADMIN

      await service.onModuleInit();

      expect(userModel).not.toHaveBeenCalled(); // no se construyó ningún doc
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('seed omitido'),
      );
    });

    it('runs the email and tenantId normalization migrations', async () => {
      await service.onModuleInit();
      // normalizeEmails + normalizeTenantIds
      expect(userModel.collection.updateMany).toHaveBeenCalledTimes(2);
    });

    it('creates the superadmin with a hashed password when vars are set', async () => {
      process.env.SEED_ADMIN_EMAIL = 'admin@seed.com';
      process.env.SEED_ADMIN_PASSWORD = 'SuperSecreta!42';
      userModel.findOne.mockReturnValue(buildQuery(null));

      await service.onModuleInit();

      expect(userModel).toHaveBeenCalledTimes(1);
      const data = userModel.mock.calls[0][0];
      expect(data.email).toBe('admin@seed.com');
      expect(data.role).toBe('SUPERADMIN');
      expect(data.password).not.toBe('SuperSecreta!42');
      expect(bcrypt.compareSync('SuperSecreta!42', data.password)).toBe(true);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('admin@seed.com'),
      );
    });

    it('never logs the seed password', async () => {
      process.env.SEED_ADMIN_EMAIL = 'admin@seed.com';
      process.env.SEED_ADMIN_PASSWORD = 'SuperSecreta!42';
      userModel.findOne.mockReturnValue(buildQuery(null));

      await service.onModuleInit();

      expect(allLoggedText()).not.toContain('SuperSecreta!42');
    });

    it('does not seed when a SUPERADMIN already exists, even with vars set', async () => {
      process.env.SEED_ADMIN_EMAIL = 'admin@seed.com';
      process.env.SEED_ADMIN_PASSWORD = 'SuperSecreta!42';
      userModel.findOne.mockReturnValue(
        buildQuery({ _id: userOid, role: 'SUPERADMIN' }),
      );

      await service.onModuleInit();

      expect(userModel).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('normalizes the email (trims + lowercases) before saving', async () => {
      await service.create({
        email: '  Foo.Bar@EXAMPLE.Com ',
        password: 'Clave123!',
      });

      const data = userModel.mock.calls[0][0];
      expect(data.email).toBe('foo.bar@example.com');
    });

    it('hashes the password with bcrypt', async () => {
      await service.create({ email: 'a@b.com', password: 'Clave123!' });

      const data = userModel.mock.calls[0][0];
      expect(data.password).not.toBe('Clave123!');
      expect(bcrypt.compareSync('Clave123!', data.password)).toBe(true);
    });

    it('converts a string tenantId to ObjectId', async () => {
      await service.create({
        email: 'a@b.com',
        password: 'Clave123!',
        tenantId: tenantOid.toString(),
      });

      const data = userModel.mock.calls[0][0];
      expect(data.tenantId).toBeInstanceOf(Types.ObjectId);
      expect(data.tenantId.toString()).toBe(tenantOid.toString());
    });
  });

  // ─── findOneByEmail ────────────────────────────────────────────────────────

  describe('findOneByEmail', () => {
    it('searches with the normalized email and isActive true', async () => {
      await service.findOneByEmail('  User@Test.COM ');

      expect(userModel.findOne).toHaveBeenCalledWith({
        email: 'user@test.com',
        isActive: true,
      });
    });
  });

  // ─── createTenantUser ──────────────────────────────────────────────────────

  describe('createTenantUser', () => {
    it('rejects roles outside CREATABLE_ROLES (e.g. SUPERADMIN)', async () => {
      await expect(
        service.createTenantUser(tenantOid.toString(), {
          name: 'Hacker',
          email: 'h@x.com',
          role: 'SUPERADMIN',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(userModel).not.toHaveBeenCalled();
    });

    it('generates a temp password (Tmp@ + 8 hex) and forces mustChangePassword', async () => {
      const { user, tempPassword } = await service.createTenantUser(
        tenantOid.toString(),
        { name: 'Mesero', email: 'mesero@bar.com', role: 'SERVER' },
      );

      expect(tempPassword).toMatch(/^Tmp@[0-9a-f]{8}$/);
      const data = userModel.mock.calls[0][0];
      expect(data.mustChangePassword).toBe(true);
      expect(data.role).toBe('SERVER');
      expect(data.referralCode).toBeUndefined();
      // La contraseña temporal devuelta corresponde al hash guardado.
      expect(bcrypt.compareSync(tempPassword, data.password)).toBe(true);
      expect(user).toBeDefined();
    });

    it('assigns a referralCode only for IMPULSADOR', async () => {
      await service.createTenantUser(tenantOid.toString(), {
        name: 'Impulsa',
        email: 'imp@bar.com',
        role: 'IMPULSADOR',
      });

      const data = userModel.mock.calls[0][0];
      expect(data.referralCode).toMatch(/^[0-9A-F]{8}$/);
    });
  });

  // ─── updateUser ────────────────────────────────────────────────────────────

  describe('updateUser', () => {
    it('scopes the update to the caller tenant (filter includes tenantId)', async () => {
      const updated = { _id: userOid, name: 'Nuevo' };
      userModel.findOneAndUpdate.mockReturnValue(buildQuery(updated));

      const result = await service.updateUser(
        userOid.toString(),
        tenantOid.toString(),
        { name: 'Nuevo' },
      );

      const [filter, updates, options] =
        userModel.findOneAndUpdate.mock.calls[0];
      expect(filter._id).toBe(userOid.toString());
      expect(filter.tenantId).toBeInstanceOf(Types.ObjectId);
      expect(filter.tenantId.toString()).toBe(tenantOid.toString());
      expect(updates).toEqual({ name: 'Nuevo' });
      expect(options.projection).toEqual({ password: 0 });
      expect(result).toBe(updated);
    });

    it('returns null when the user belongs to another tenant (no match)', async () => {
      userModel.findOneAndUpdate.mockReturnValue(buildQuery(null));

      const result = await service.updateUser(
        userOid.toString(),
        new Types.ObjectId().toString(), // otro tenant
        { name: 'Intruso' },
      );

      expect(result).toBeNull();
    });

    it('rejects role changes outside CREATABLE_ROLES', async () => {
      await expect(
        service.updateUser(userOid.toString(), tenantOid.toString(), {
          role: 'SUPERADMIN',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(userModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  // ─── deactivateUser ────────────────────────────────────────────────────────

  describe('deactivateUser', () => {
    it('deactivates scoped by tenant and never a TENANT_ADMIN', async () => {
      await service.deactivateUser(userOid.toString(), tenantOid.toString());

      const [filter, update] = userModel.findOneAndUpdate.mock.calls[0];
      expect(filter._id).toBe(userOid.toString());
      expect(filter.tenantId.toString()).toBe(tenantOid.toString());
      expect(filter.role).toEqual({ $ne: 'TENANT_ADMIN' });
      expect(update).toEqual({ isActive: false });
    });
  });

  // ─── changePassword ────────────────────────────────────────────────────────

  describe('changePassword', () => {
    const hash = bcrypt.hashSync('Actual123!', 4);

    function makeUser() {
      const doc: any = {
        _id: userOid,
        password: hash,
        mustChangePassword: true,
        save: jest.fn(),
      };
      doc.save.mockResolvedValue(doc);
      return doc;
    }

    it('rejects when the current password is wrong', async () => {
      userModel.findById.mockReturnValue(buildQuery(makeUser()));

      await expect(
        service.changePassword(userOid.toString(), 'mala', 'Nueva123!'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws NotFoundException when the user does not exist', async () => {
      userModel.findById.mockReturnValue(buildQuery(null));

      await expect(
        service.changePassword(userOid.toString(), 'Actual123!', 'Nueva123!'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rehashes the new password and clears mustChangePassword', async () => {
      const doc = makeUser();
      userModel.findById.mockReturnValue(buildQuery(doc));

      await service.changePassword(
        userOid.toString(),
        'Actual123!',
        'Nueva123!',
      );

      expect(doc.password).not.toBe(hash);
      expect(bcrypt.compareSync('Nueva123!', doc.password)).toBe(true);
      expect(doc.mustChangePassword).toBe(false);
      expect(doc.save).toHaveBeenCalled();
    });
  });

  // ─── resetPassword ─────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('sets the new password and clears the reset code and flags', async () => {
      const doc: any = {
        _id: userOid,
        password: 'old-hash',
        resetPasswordCode: '123456',
        resetPasswordExpires: new Date(),
        mustChangePassword: true,
        save: jest.fn(),
      };
      doc.save.mockResolvedValue(doc);
      userModel.findById.mockReturnValue(buildQuery(doc));

      await service.resetPassword(userOid.toString(), 'Nueva123!');

      expect(bcrypt.compareSync('Nueva123!', doc.password)).toBe(true);
      expect(doc.resetPasswordCode).toBeUndefined();
      expect(doc.resetPasswordExpires).toBeUndefined();
      expect(doc.mustChangePassword).toBe(false);
      expect(doc.save).toHaveBeenCalled();
    });
  });
});
