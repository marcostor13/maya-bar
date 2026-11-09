import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { UserAdminService } from './user-admin.service';
import { hashResetCode } from './users.service';

const tenantId = new Types.ObjectId().toString();
const exec = <T>(v: T) => ({ exec: jest.fn().mockResolvedValue(v) });

function makeUser(over: Record<string, unknown> = {}) {
  const data = {
    _id: new Types.ObjectId(),
    tenantId: new Types.ObjectId(tenantId),
    email: 'bea@e.pe',
    name: 'Bea',
    role: 'SERVER',
    isActive: true,
    localIds: [],
    ...over,
  };
  return { ...data, toObject: () => ({ ...data }) };
}

function build() {
  const userModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(() => exec({})),
    countDocuments: jest.fn().mockResolvedValue(1),
    find: jest.fn(),
    db: { collection: jest.fn() },
  };
  const users = {
    createTenantUser: jest.fn(),
    assertRoleAllowed: jest.fn().mockResolvedValue(undefined),
    findOneByEmailAnyStatus: jest.fn().mockResolvedValue(null),
    deleteUser: jest.fn().mockResolvedValue({ deleted: true, reassigned: 3 }),
  };
  const sessions = { revoke: jest.fn().mockResolvedValue(undefined) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const mail = {
    isConfigured: true,
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };
  const svc = new UserAdminService(
    userModel as never,
    users as never,
    sessions as never,
    audit as never,
    mail as never,
  );
  return { svc, userModel, users, sessions, audit, mail };
}

const admin = {
  userId: new Types.ObjectId().toString(),
  role: 'TENANT_ADMIN',
  name: 'Ana',
};

describe('UserAdminService — editar', () => {
  it('cambiar el rol revoca el token (ligero) y registra el cambio', async () => {
    const { svc, userModel, sessions, audit } = build();
    const target = makeUser();
    userModel.findOne.mockReturnValue(exec(target));
    userModel.findOneAndUpdate.mockReturnValue(
      exec({ ...target, role: 'MANAGER' }),
    );

    await svc.update(String(target._id), tenantId, { role: 'MANAGER' }, admin);

    expect(sessions.revoke).toHaveBeenCalledWith(String(target._id), {
      refresh: false,
    });
    expect(audit.record).toHaveBeenCalledWith(admin, target, 'update', {
      role: { from: 'SERVER', to: 'MANAGER' },
    });
  });

  it('desactivar revoca todas las sesiones y registra la desactivación', async () => {
    const { svc, userModel, sessions, audit } = build();
    const target = makeUser();
    userModel.findOne.mockReturnValue(exec(target));
    userModel.findOneAndUpdate.mockReturnValue(
      exec({ ...target, isActive: false }),
    );

    await svc.deactivate(String(target._id), tenantId, admin);

    expect(sessions.revoke).toHaveBeenCalledWith(String(target._id), {
      refresh: true,
    });
    expect(audit.record).toHaveBeenCalledWith(admin, target, 'deactivate');
  });

  it('un correo que ya usa otra cuenta da 409 y no guarda nada', async () => {
    const { svc, userModel, users } = build();
    const target = makeUser();
    userModel.findOne.mockReturnValue(exec(target));
    users.findOneByEmailAnyStatus.mockResolvedValue({
      _id: new Types.ObjectId(),
    });

    await expect(
      svc.update(String(target._id), tenantId, { email: 'Otro@E.pe ' }, admin),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(users.findOneByEmailAnyStatus).toHaveBeenCalledWith('otro@e.pe');
    expect(userModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('nadie puede cambiarse el rol ni desactivarse a sí mismo', async () => {
    const { svc, userModel } = build();
    const me = makeUser({
      _id: new Types.ObjectId(admin.userId),
      role: 'TENANT_ADMIN',
    });
    userModel.findOne.mockReturnValue(exec(me));

    await expect(
      svc.update(admin.userId, tenantId, { role: 'MANAGER' }, admin),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.deactivate(admin.userId, tenantId, admin),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(userModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('el último administrador activo no se desactiva ni pierde el rol', async () => {
    const { svc, userModel } = build();
    const other = makeUser({ role: 'TENANT_ADMIN' });
    userModel.findOne.mockReturnValue(exec(other));
    userModel.countDocuments.mockResolvedValue(0);

    await expect(
      svc.deactivate(String(other._id), tenantId, admin),
    ).rejects.toThrow('último administrador');
    await expect(
      svc.update(String(other._id), tenantId, { role: 'MANAGER' }, admin),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const filter = userModel.countDocuments.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(filter).toMatchObject({
      role: 'TENANT_ADMIN',
      isActive: { $ne: false },
    });
  });

  it('un usuario de otra empresa o un superadmin no existe (404)', async () => {
    const { svc, userModel } = build();
    userModel.findOne.mockReturnValue(exec(null));
    await expect(
      svc.update(
        new Types.ObjectId().toString(),
        tenantId,
        { name: 'x' },
        admin,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    const filter = userModel.findOne.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(filter).toMatchObject({ role: { $ne: 'SUPERADMIN' } });
    expect(String(filter.tenantId)).toBe(tenantId);
  });
});

describe('UserAdminService — restablecer el acceso', () => {
  it('con contraseña temporal: nueva contraseña, cambio obligado, sesiones fuera', async () => {
    const { svc, userModel, sessions, audit } = build();
    const target = makeUser();
    userModel.findOne.mockReturnValue(exec(target));

    const res = await svc.resetAccess(
      String(target._id),
      tenantId,
      'temp',
      admin,
    );

    expect(res.tempPassword).toMatch(/^Tmp@[0-9a-f]{8}$/);
    const update = (userModel.updateOne.mock.calls[0] as unknown[])[1] as {
      $set: { password: string; mustChangePassword: boolean };
    };
    expect(update.$set.mustChangePassword).toBe(true);
    await expect(
      bcrypt.compare(res.tempPassword!, update.$set.password),
    ).resolves.toBe(true);
    expect(sessions.revoke).toHaveBeenCalledWith(String(target._id), {
      refresh: true,
    });
    expect(audit.record).toHaveBeenCalledWith(admin, target, 'reset_access', {
      mode: { to: 'temp' },
    });
    // La temporal no viaja al registro.
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain(
      res.tempPassword!,
    );
  });

  it('por correo: envía el código, invalida la contraseña y no devuelve ninguna', async () => {
    const { svc, userModel, mail, sessions } = build();
    const target = makeUser();
    userModel.findOne.mockReturnValue(exec(target));

    const res = await svc.resetAccess(
      String(target._id),
      tenantId,
      'email',
      admin,
    );

    expect(res).toEqual({ mode: 'email' });
    const [email, code] = mail.sendPasswordResetEmail.mock.calls[0] as [
      string,
      string,
    ];
    expect(email).toBe('bea@e.pe');
    expect(code).toMatch(/^\d{6}$/);
    const update = (userModel.updateOne.mock.calls[0] as unknown[])[1] as {
      $set: {
        password: string;
        resetPasswordCode: string;
        resetPasswordExpires: Date;
      };
    };
    // Se guarda el hash, nunca el código que viaja por correo.
    expect(update.$set.resetPasswordCode).toBe(hashResetCode(code));
    expect(update.$set.resetPasswordExpires.getTime()).toBeGreaterThan(
      Date.now(),
    );
    expect(update.$set.password).toMatch(/^\$2[aby]\$/);
    expect(sessions.revoke).toHaveBeenCalledWith(String(target._id), {
      refresh: true,
    });
  });

  it('por correo sin proveedor configurado se rechaza sin tocar la contraseña', async () => {
    const { svc, userModel, mail } = build();
    mail.isConfigured = false;
    userModel.findOne.mockReturnValue(exec(makeUser()));
    await expect(
      svc.resetAccess(
        new Types.ObjectId().toString(),
        tenantId,
        'email',
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });

  it('nadie restablece su propio acceso por aquí', async () => {
    const { svc, userModel } = build();
    userModel.findOne.mockReturnValue(
      exec(makeUser({ _id: new Types.ObjectId(admin.userId) })),
    );
    await expect(
      svc.resetAccess(admin.userId, tenantId, 'temp', admin),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('UserAdminService — traspaso y eliminación', () => {
  it('traspasa: el destino pasa a administrador y yo al rol elegido', async () => {
    const { svc, userModel, sessions, audit } = build();
    const target = makeUser({ role: 'MANAGER' });
    const me = makeUser({
      _id: new Types.ObjectId(admin.userId),
      role: 'TENANT_ADMIN',
    });
    userModel.findOne
      .mockReturnValueOnce(exec(target))
      .mockReturnValueOnce(exec(me));

    await svc.transferAdmin(tenantId, admin, String(target._id), 'MANAGER');

    expect(userModel.updateOne.mock.calls[0]).toEqual([
      { _id: target._id },
      { $set: { role: 'TENANT_ADMIN' } },
    ]);
    expect(userModel.updateOne.mock.calls[1]).toEqual([
      { _id: me._id },
      { $set: { role: 'MANAGER' } },
    ]);
    expect(sessions.revoke).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledWith(admin, me, 'transfer_admin', {
      role: { from: 'TENANT_ADMIN', to: 'MANAGER' },
    });
  });

  it('no traspasa a un desactivado ni deja "administrador" como rol propio', async () => {
    const { svc, userModel } = build();
    await expect(
      svc.transferAdmin(
        tenantId,
        admin,
        new Types.ObjectId().toString(),
        'TENANT_ADMIN',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const target = makeUser({ isActive: false });
    const me = makeUser({
      _id: new Types.ObjectId(admin.userId),
      role: 'TENANT_ADMIN',
    });
    userModel.findOne
      .mockReturnValueOnce(exec(target))
      .mockReturnValueOnce(exec(me));
    await expect(
      svc.transferAdmin(tenantId, admin, String(target._id), 'MANAGER'),
    ).rejects.toThrow('desactivado');
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });

  it('eliminar reasigna, revoca sesiones y lo registra', async () => {
    const { svc, userModel, users, sessions, audit } = build();
    const target = makeUser();
    userModel.findOne.mockReturnValue(exec(target));
    const dest = new Types.ObjectId().toString();

    const res = await svc.delete(String(target._id), tenantId, admin, dest);

    expect(res.reassigned).toBe(3);
    expect(users.deleteUser).toHaveBeenCalledWith(
      String(target._id),
      tenantId,
      admin.userId,
      dest,
    );
    expect(sessions.revoke).toHaveBeenCalledWith(String(target._id), {
      refresh: true,
    });
    expect(audit.record).toHaveBeenCalledWith(admin, target, 'delete', {
      reassigned: { to: 3 },
      reassignTo: { to: dest },
    });
  });

  it('la búsqueda de plataforma exige 2 caracteres, escapa el texto y excluye superadmins', async () => {
    const { svc, userModel } = build();
    await expect(svc.search(' a ')).rejects.toBeInstanceOf(BadRequestException);

    const chain = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          email: 'a.b@e.pe',
          tenantId: new Types.ObjectId(tenantId),
        },
      ]),
    };
    userModel.find.mockReturnValue(chain);
    userModel.db.collection.mockReturnValue({
      find: () => ({
        toArray: () =>
          Promise.resolve([
            { _id: new Types.ObjectId(tenantId), name: 'Acme' },
          ]),
      }),
    });

    const res = await svc.search('a.b');

    const [filter, projection] = userModel.find.mock.calls[0] as [
      { role: unknown; $or: { email: RegExp }[] },
      Record<string, number>,
    ];
    expect(filter.role).toEqual({ $ne: 'SUPERADMIN' });
    expect(filter.$or[0].email.source).toBe('a\\.b');
    expect(projection.password).toBe(0);
    expect(chain.limit).toHaveBeenCalledWith(50);
    expect(res[0].tenantName).toBe('Acme');
  });
});
