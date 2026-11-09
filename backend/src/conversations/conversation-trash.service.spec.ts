import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  ConversationTrashService,
  TRASH_DAYS,
} from './conversation-trash.service';

const tenantId = new Types.ObjectId().toString();
const tenant = new Types.ObjectId(tenantId);
const actor = { userId: new Types.ObjectId().toString(), name: 'Ana' };

const exec = <T>(v: T) => ({ exec: jest.fn().mockResolvedValue(v) });
/** `find().select().lean()` / `.sort().limit()` encadenables. */
const chain = (rows: unknown) => {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'sort', 'limit']) q[m] = jest.fn(() => q);
  q.lean = jest.fn().mockResolvedValue(rows);
  q.exec = jest.fn().mockResolvedValue(rows);
  return q;
};

function makeTrashed(over: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    tenantId: tenant,
    channel: 'whatsapp',
    accountId: new Types.ObjectId(),
    contact: '51999888777',
    inTrash: true,
    ...over,
  };
}

function build() {
  const convModel = {
    find: jest.fn(() => chain([])),
    findOne: jest.fn(() => exec(null)),
    updateMany: jest.fn(() => exec({ modifiedCount: 1 })),
    updateOne: jest.fn(() => exec({ modifiedCount: 1 })),
    deleteOne: jest.fn(() => exec({ deletedCount: 1 })),
    createIndexes: jest.fn().mockResolvedValue(undefined),
    collection: {
      indexes: jest.fn().mockResolvedValue([]),
      dropIndex: jest.fn().mockResolvedValue(undefined),
    },
  };
  const msgModel = {
    find: jest.fn(() => chain([])),
    updateMany: jest.fn(() => exec({})),
    deleteMany: jest.fn(() => exec({})),
  };
  const scheduledModel = {
    updateMany: jest.fn(() => exec({})),
    deleteMany: jest.fn(() => exec({})),
  };
  const ref = () => ({ updateMany: jest.fn(() => exec({})) });
  const leadModel = ref();
  const activityModel = ref();
  const bookingModel = ref();
  const uploads = { delete: jest.fn().mockResolvedValue(undefined) };
  const roles = {
    accessFor: jest.fn().mockResolvedValue({ modules: ['inbox'], actions: {} }),
  };
  const gateway = { emitRemoved: jest.fn(), emitConversation: jest.fn() };
  const blocks = { findFor: jest.fn().mockResolvedValue(null) };
  const svc = new ConversationTrashService(
    convModel as never,
    msgModel as never,
    scheduledModel as never,
    leadModel as never,
    activityModel as never,
    bookingModel as never,
    uploads as never,
    roles as never,
    gateway as never,
    blocks as never,
  );
  return {
    svc,
    convModel,
    msgModel,
    scheduledModel,
    leadModel,
    activityModel,
    bookingModel,
    uploads,
    roles,
    gateway,
    blocks,
  };
}

describe('ConversationTrashService — permiso', () => {
  it('el administrador siempre puede eliminar', async () => {
    const { svc, roles } = build();
    expect(await svc.canDelete(tenantId, 'TENANT_ADMIN')).toBe(true);
    expect(await svc.canDelete(tenantId, 'SUPERADMIN')).toBe(true);
    expect(roles.accessFor).not.toHaveBeenCalled();
  });

  it('otro rol sin "Eliminar" explícito en Bandeja no puede (la ausencia no concede)', async () => {
    const { svc } = build();
    expect(await svc.canDelete(tenantId, 'MARKETING')).toBe(false);
    await expect(svc.assertCanDelete(tenantId, 'MARKETING')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('otro rol con "Eliminar" marcado en Bandeja sí puede', async () => {
    const { svc, roles } = build();
    roles.accessFor.mockResolvedValue({
      modules: ['inbox'],
      actions: { inbox: ['edit', 'delete'] },
    });
    expect(await svc.canDelete(tenantId, 'MARKETING')).toBe(true);
  });

  it('sin el módulo Bandeja no puede aunque tenga la acción', async () => {
    const { svc, roles } = build();
    roles.accessFor.mockResolvedValue({
      modules: [],
      actions: { inbox: ['delete'] },
    });
    expect(await svc.canDelete(tenantId, 'MARKETING')).toBe(false);
  });
});

describe('ConversationTrashService — papelera', () => {
  it('mueve a la papelera solo chats de la empresa, cancela lo programado y avisa', async () => {
    const { svc, convModel, scheduledModel, gateway, msgModel } = build();
    const a = new Types.ObjectId();
    convModel.find.mockReturnValue(chain([{ _id: a }]));

    const res = await svc.trash(
      tenantId,
      [String(a), String(a), 'basura'],
      actor,
    );

    expect(res).toEqual({ trashed: 1, ids: [String(a)] });
    expect(convModel.find).toHaveBeenCalledWith({
      _id: { $in: [a] },
      tenantId: tenant,
    });
    const [filter, update] = convModel.updateMany.mock.calls[0] as unknown as [
      object,
      { $set: Record<string, unknown> },
    ];
    expect(filter).toEqual({ _id: { $in: [a] }, tenantId: tenant });
    expect(update.$set).toMatchObject({ inTrash: true, trashedByName: 'Ana' });
    expect(update.$set.trashedAt).toBeInstanceOf(Date);
    expect(String(update.$set.trashedBy)).toBe(actor.userId);
    expect(scheduledModel.updateMany).toHaveBeenCalledWith(
      { conversationId: { $in: [a] }, status: 'pending' },
      { $set: { status: 'cancelled' } },
    );
    expect(msgModel.updateMany).toHaveBeenCalledWith(
      { conversationId: { $in: [a] } },
      { $set: { inTrash: true } },
    );
    expect(gateway.emitRemoved).toHaveBeenCalledWith(tenantId, [String(a)]);
  });

  it('si ningún id es de la empresa no cambia nada', async () => {
    const { svc, convModel, gateway } = build();
    const res = await svc.trash(
      tenantId,
      [String(new Types.ObjectId())],
      actor,
    );
    expect(res.trashed).toBe(0);
    expect(convModel.updateMany).not.toHaveBeenCalled();
    expect(gateway.emitRemoved).not.toHaveBeenCalled();
  });

  it('la lista indica cuándo se borrará cada chat', async () => {
    const { svc, convModel } = build();
    const trashedAt = new Date('2026-11-01T00:00:00Z');
    convModel.find.mockReturnValue(chain([{ _id: 'x', trashedAt }]));
    const [row] = await svc.list(tenantId);
    expect(convModel.find).toHaveBeenCalledWith({
      tenantId: tenant,
      inTrash: true,
    });
    expect(row.purgeAt).toEqual(new Date('2026-12-01T00:00:00Z'));
  });

  it('restaurar devuelve el chat a la bandeja con su estado de bloqueo actual', async () => {
    const { svc, convModel, gateway, blocks, msgModel } = build();
    const trashed = makeTrashed({ blocked: true });
    const restored = { ...trashed, inTrash: false };
    convModel.findOne
      .mockReturnValueOnce(exec(trashed)) // en la papelera
      .mockReturnValueOnce(exec(null)) // no hay chat activo
      .mockReturnValueOnce(exec(restored));

    const res = await svc.restore(tenantId, String(trashed._id), actor);

    expect(res.merged).toBe(false);
    expect(msgModel.updateMany).toHaveBeenCalledWith(
      { conversationId: trashed._id },
      { $unset: { inTrash: 1 } },
    );
    expect(blocks.findFor).toHaveBeenCalledWith(
      tenant,
      'whatsapp',
      '51999888777',
    );
    const [filter, update] = convModel.updateOne.mock.calls[0] as unknown as [
      object,
      { $set: Record<string, unknown>; $unset: Record<string, unknown> },
    ];
    expect(filter).toEqual({ _id: trashed._id, inTrash: true });
    // Se desbloqueó mientras estaba en la papelera: vuelve desbloqueado.
    expect(update.$set).toMatchObject({ inTrash: false, blocked: false });
    expect(update.$unset).toMatchObject({ trashedAt: 1, blockedReason: 1 });
    expect(gateway.emitConversation).toHaveBeenCalledWith(tenantId, restored);
  });

  it('restaurar con un chat nuevo del mismo contacto une el historial en ese chat', async () => {
    const { svc, convModel, msgModel, scheduledModel, leadModel, gateway } =
      build();
    const customerId = new Types.ObjectId();
    const trashed = makeTrashed({ customerId });
    const active = {
      _id: new Types.ObjectId(),
      save: jest.fn().mockResolvedValue(undefined),
    } as Record<string, unknown>;
    convModel.findOne
      .mockReturnValueOnce(exec(trashed))
      .mockReturnValueOnce(exec(active));

    const res = await svc.restore(tenantId, String(trashed._id), actor);

    expect(res.merged).toBe(true);
    expect((convModel.findOne.mock.calls[1] as unknown[])[0]).toEqual({
      tenantId: tenant,
      channel: 'whatsapp',
      accountId: trashed.accountId,
      contact: '51999888777',
    });
    const moved = [
      { conversationId: trashed._id },
      { $set: { conversationId: active._id } },
    ];
    expect(msgModel.updateMany).toHaveBeenCalledWith(moved[0], {
      ...moved[1],
      $unset: { inTrash: 1 },
    });
    expect(scheduledModel.updateMany).toHaveBeenCalledWith(...moved);
    expect(leadModel.updateMany).toHaveBeenCalledWith(
      { tenantId: tenant, conversationId: trashed._id },
      { $set: { conversationId: active._id } },
    );
    expect(active.customerId).toBe(customerId);
    expect(convModel.deleteOne).toHaveBeenCalledWith({ _id: trashed._id });
    expect(gateway.emitConversation).toHaveBeenCalledWith(tenantId, active);
  });

  it('restaurar algo que no está en la papelera da 404', async () => {
    const { svc } = build();
    await expect(
      svc.restore(tenantId, String(new Types.ObjectId()), actor),
    ).rejects.toThrow(NotFoundException);
    await expect(svc.restore(tenantId, 'basura', actor)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('ConversationTrashService — borrado definitivo', () => {
  it('borra mensajes, programados y adjuntos del cliente, y conserva leads sin la referencia', async () => {
    const {
      svc,
      convModel,
      msgModel,
      scheduledModel,
      leadModel,
      activityModel,
      bookingModel,
      uploads,
    } = build();
    const conv = makeTrashed();
    convModel.findOne.mockReturnValue(exec(conv));
    msgModel.find.mockReturnValue(
      chain([{ mediaKey: 'inbound/a.jpg' }, { mediaKey: 'inbound/b.pdf' }]),
    );
    uploads.delete.mockRejectedValueOnce(new Error('S3 caído'));

    await svc.purge(tenantId, String(conv._id), actor);

    expect(msgModel.find).toHaveBeenCalledWith({
      conversationId: conv._id,
      direction: 'in',
      mediaKey: { $exists: true, $nin: [null, ''] },
    });
    // Un adjunto que falla no impide borrar el resto.
    expect(uploads.delete).toHaveBeenCalledTimes(2);
    expect(msgModel.deleteMany).toHaveBeenCalledWith({
      conversationId: conv._id,
    });
    expect(scheduledModel.deleteMany).toHaveBeenCalledWith({
      conversationId: conv._id,
    });
    const unlink = [
      { tenantId: tenant, conversationId: conv._id },
      { $unset: { conversationId: 1 } },
    ];
    expect(leadModel.updateMany).toHaveBeenCalledWith(...unlink);
    expect(activityModel.updateMany).toHaveBeenCalledWith(...unlink);
    expect(bookingModel.updateMany).toHaveBeenCalledWith(...unlink);
    expect(convModel.deleteOne).toHaveBeenCalledWith({ _id: conv._id });
  });

  it('vaciar la papelera borra todo lo de la empresa', async () => {
    const { svc, convModel } = build();
    convModel.find.mockReturnValue(chain([makeTrashed(), makeTrashed()]));
    expect(await svc.empty(tenantId, actor)).toEqual({ deleted: 2 });
    expect(convModel.find).toHaveBeenCalledWith({
      tenantId: tenant,
      inTrash: true,
    });
    expect(convModel.deleteOne).toHaveBeenCalledTimes(2);
  });

  it('la purga automática borra lo que lleva más de 30 días y sigue si uno falla', async () => {
    const { svc, convModel, msgModel } = build();
    convModel.find.mockReturnValue(chain([makeTrashed(), makeTrashed()]));
    msgModel.deleteMany
      .mockReturnValueOnce({
        exec: jest.fn().mockRejectedValue(new Error('mongo')),
      })
      .mockReturnValue(exec({}));
    const now = new Date('2026-12-31T00:00:00Z');

    expect(await svc.purgeExpired(now)).toBe(1);
    const filter = (convModel.find.mock.calls[0] as unknown[])[0] as {
      trashedAt: { $lt: Date };
    };
    expect(filter).toMatchObject({ inTrash: true });
    expect(filter.trashedAt.$lt).toEqual(
      new Date(now.getTime() - TRASH_DAYS * 24 * 60 * 60 * 1000),
    );
  });
});

describe('ConversationTrashService — migración del índice', () => {
  it('rellena inTrash y cambia el índice único por uno parcial', async () => {
    const { svc, convModel } = build();
    convModel.collection.indexes.mockResolvedValue([
      { name: '_id_', key: { _id: 1 } },
      {
        name: 'channel_1_accountId_1_contact_1',
        key: { channel: 1, accountId: 1, contact: 1 },
        unique: true,
      },
    ]);

    await svc.onModuleInit();

    expect(convModel.updateMany).toHaveBeenCalledWith(
      { inTrash: { $exists: false } },
      { $set: { inTrash: false } },
    );
    expect(convModel.collection.dropIndex).toHaveBeenCalledWith(
      'channel_1_accountId_1_contact_1',
    );
    expect(convModel.createIndexes).toHaveBeenCalled();
  });

  it('no toca el índice si ya es parcial', async () => {
    const { svc, convModel } = build();
    convModel.collection.indexes.mockResolvedValue([
      {
        name: 'channel_1_accountId_1_contact_1',
        key: { channel: 1, accountId: 1, contact: 1 },
        partialFilterExpression: { inTrash: false },
      },
    ]);
    await svc.onModuleInit();
    expect(convModel.collection.dropIndex).not.toHaveBeenCalled();
  });
});
