import { Types } from 'mongoose';
import { UserAuditService, diff } from './user-audit.service';

describe('UserAuditService', () => {
  const tenantId = new Types.ObjectId().toString();
  const actor = {
    userId: new Types.ObjectId().toString(),
    role: 'TENANT_ADMIN',
    name: 'Ana',
  };
  const target = {
    _id: new Types.ObjectId(),
    email: 'b@e.pe',
    name: 'Bea',
    tenantId,
  };
  let model: { create: jest.Mock; find: jest.Mock };
  let svc: UserAuditService;
  const chain = {
    sort: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn(),
  };

  beforeEach(() => {
    chain.sort.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    chain.lean.mockReturnValue(chain);
    chain.exec.mockResolvedValue([]);
    model = {
      create: jest.fn().mockResolvedValue({}),
      find: jest.fn(() => chain),
    };
    svc = new UserAuditService(model as never);
  });

  it('guarda autor, afectado, empresa, acción y cambios', async () => {
    await svc.record(actor, target, 'update', {
      role: { from: 'SERVER', to: 'MANAGER' },
    });
    const doc = model.create.mock.calls[0][0] as Record<string, unknown>;
    expect(doc).toMatchObject({
      actorName: 'Ana',
      actorRole: 'TENANT_ADMIN',
      targetEmail: 'b@e.pe',
      action: 'update',
      changes: { role: { from: 'SERVER', to: 'MANAGER' } },
    });
    expect(String(doc.tenantId)).toBe(tenantId);
    expect(String(doc.targetId)).toBe(String(target._id));
  });

  it('nunca guarda contraseñas ni códigos aunque lleguen en los cambios', async () => {
    await svc.record(actor, target, 'reset_access', {
      password: { to: 'x' },
      resetPasswordCode: { to: '123456' },
      tempPassword: { to: 'Tmp@1' },
      mode: { to: 'temp' },
    });
    const doc = model.create.mock.calls[0][0] as { changes: object };
    expect(doc.changes).toEqual({ mode: { to: 'temp' } });
    expect(JSON.stringify(doc)).not.toMatch(/123456|Tmp@1/);
  });

  it('si falla el guardado no lanza: la acción ya se hizo', async () => {
    model.create.mockRejectedValue(new Error('db'));
    await expect(svc.record(actor, target, 'delete')).resolves.toBeUndefined();
  });

  it('lista por empresa y por afectado, lo más reciente primero', async () => {
    const tid = new Types.ObjectId().toString();
    await svc.list({ tenantId, targetId: tid });
    expect(model.find).toHaveBeenCalledWith({
      tenantId: new Types.ObjectId(tenantId),
      targetId: new Types.ObjectId(tid),
    });
    expect(chain.sort).toHaveBeenCalledWith({ at: -1 });
    expect(chain.limit).toHaveBeenCalledWith(200);
  });

  it('diff solo devuelve los campos que cambian y vienen en el nuevo valor', () => {
    const before = { name: 'A', role: 'SERVER', email: 'a@e' };
    const after = { name: 'A', role: 'MANAGER' };
    expect(diff(before, after, ['name', 'role', 'email'])).toEqual({
      role: { from: 'SERVER', to: 'MANAGER' },
    });
  });
});
