import { Types } from 'mongoose';
import { BlockedContactsService, blockKey } from './blocked-contacts.service';

const tenantId = new Types.ObjectId().toString();
const tenant = new Types.ObjectId(tenantId);
const userId = new Types.ObjectId().toString();

const exec = <T>(v: T) => ({ exec: jest.fn().mockResolvedValue(v) });

function build() {
  const blocks = {
    exists: jest.fn().mockResolvedValue(null),
    findOneAndUpdate: jest.fn((_f: unknown, u: { $set: object }) =>
      exec({ _id: new Types.ObjectId(), ...u.$set }),
    ),
    findOneAndDelete: jest.fn(() => exec(null)),
    findOne: jest.fn(() => exec(null)),
    find: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({ upsertedCount: 1 }),
  };
  const convModel = {
    updateMany: jest.fn(() => exec({ modifiedCount: 1 })),
    find: jest.fn(),
  };
  const svc = new BlockedContactsService(blocks as never, convModel as never);
  return { svc, blocks, convModel };
}

describe('blockKey', () => {
  it('normaliza cada canal', () => {
    expect(blockKey('whatsapp', '+51 999 888 777')).toBe('51999888777');
    expect(blockKey('whatsapp', '999888777')).toBe('51999888777');
    expect(blockKey('whatsapp', 'PE.1502576394655843')).toBe(
      'PE.1502576394655843',
    );
    expect(blockKey('email', '  Ana@Correo.COM ')).toBe('ana@correo.com');
    expect(blockKey('instagram', ' 178414 ')).toBe('178414');
    expect(blockKey('whatsapp', '12')).toBeUndefined();
    expect(blockKey('email', '')).toBeUndefined();
  });
});

describe('BlockedContactsService', () => {
  it('isBlocked busca por empresa, canal e identificador normalizado', async () => {
    const { svc, blocks } = build();
    blocks.exists.mockResolvedValue({ _id: 'x' });
    expect(await svc.isBlocked(tenantId, 'whatsapp', '+51 999 888 777')).toBe(
      true,
    );
    expect(blocks.exists).toHaveBeenCalledWith({
      tenantId: tenant,
      channel: 'whatsapp',
      identifier: '51999888777',
    });
  });

  it('isBlocked es false sin identificador o con empresa inválida, sin consultar', async () => {
    const { svc, blocks } = build();
    expect(await svc.isBlocked(tenantId, 'email', '')).toBe(false);
    expect(await svc.isBlocked('nope', 'email', 'a@b.c')).toBe(false);
    expect(blocks.exists).not.toHaveBeenCalled();
  });

  it('block guarda una entrada por identificador (sin duplicar) y marca sus chats', async () => {
    const { svc, blocks, convModel } = build();
    const out = await svc.block(
      tenantId,
      [
        { channel: 'whatsapp', contact: '51999888777' },
        { channel: 'whatsapp', contact: '+51 999 888 777' },
        { channel: 'email', contact: 'Ana@Correo.com' },
      ],
      { reason: ' Spam ', source: 'inbox', userId, userName: 'Ana' },
      { accountId: String(new Types.ObjectId()), onChannel: true },
    );

    expect(out).toHaveLength(2);
    expect(blocks.findOneAndUpdate).toHaveBeenCalledTimes(2);
    const [filter, update, opts] = blocks.findOneAndUpdate.mock
      .calls[0] as unknown as [
      object,
      { $set: Record<string, unknown> },
      object,
    ];
    expect(filter).toEqual({
      tenantId: tenant,
      channel: 'whatsapp',
      identifier: '51999888777',
    });
    expect(update.$set).toMatchObject({
      reason: 'Spam',
      source: 'inbox',
      blockedByName: 'Ana',
      onChannel: true,
    });
    expect(opts).toEqual({ upsert: true, returnDocument: 'after' });
    // El bloqueo en el proveedor es solo del chat de origen.
    const second = blocks.findOneAndUpdate.mock.calls[1] as unknown as [
      object,
      { $set: Record<string, unknown> },
    ];
    expect(second[1].$set.onChannel).toBeUndefined();

    expect(convModel.updateMany).toHaveBeenCalledWith(
      {
        tenantId: tenant,
        channel: 'email',
        contact: { $in: ['Ana@Correo.com', 'ana@correo.com'] },
      },
      {
        $set: expect.objectContaining({
          blocked: true,
          autoReply: false,
          unreadCount: 0,
        }),
      },
    );
  });

  it('unblock borra la entrada y desmarca sus chats', async () => {
    const { svc, blocks, convModel } = build();
    await svc.unblock(tenantId, 'whatsapp', '51999888777');
    expect(blocks.findOneAndDelete).toHaveBeenCalledWith({
      tenantId: tenant,
      channel: 'whatsapp',
      identifier: '51999888777',
    });
    expect(convModel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'whatsapp' }),
      expect.objectContaining({ $set: { blocked: false } }),
    );
  });

  it('removeById solo borra bloqueos de la empresa', async () => {
    const { svc, blocks, convModel } = build();
    const id = new Types.ObjectId();
    expect(await svc.removeById(tenantId, String(id))).toBeNull();
    expect(blocks.findOneAndDelete).toHaveBeenCalledWith({
      _id: id,
      tenantId: tenant,
    });
    expect(convModel.updateMany).not.toHaveBeenCalled();
    expect(await svc.removeById(tenantId, 'no-es-id')).toBeNull();
  });

  it('list busca sin interpretar la búsqueda como expresión regular', async () => {
    const { svc, blocks } = build();
    const chain = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };
    blocks.find.mockReturnValue(chain);
    await svc.list(tenantId, 'a.b(');
    const filter = blocks.find.mock.calls[0][0] as {
      $or: Array<{ identifier?: RegExp }>;
    };
    expect(filter.$or[0].identifier?.source).toBe('a\\.b\\(');
  });

  it('migra los bloqueos antiguos de las conversaciones sin duplicar', async () => {
    const { svc, blocks, convModel } = build();
    const rows = [
      {
        _id: new Types.ObjectId(),
        tenantId: tenant,
        channel: 'whatsapp',
        contact: '51999888777',
        blockedReason: 'Spam',
      },
      {
        _id: new Types.ObjectId(),
        tenantId: tenant,
        channel: 'email',
        contact: 'x@y.z',
      },
    ];
    convModel.find.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve(rows) }),
    });
    blocks.updateOne
      .mockResolvedValueOnce({ upsertedCount: 1 })
      .mockResolvedValueOnce({ upsertedCount: 0 });

    expect(await svc.migrateLegacy()).toBe(1);
    expect(convModel.find).toHaveBeenCalledWith({
      blocked: true,
      inTrash: { $in: [true, false, null] },
    });
    expect(blocks.updateOne).toHaveBeenCalledWith(
      { tenantId: tenant, channel: 'whatsapp', identifier: '51999888777' },
      {
        $setOnInsert: expect.objectContaining({
          source: 'migration',
          reason: 'Spam',
        }),
      },
      { upsert: true },
    );
  });
});
