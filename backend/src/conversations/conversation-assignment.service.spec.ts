import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ConversationAssignmentService } from './conversation-assignment.service';

const tenantId = String(new Types.ObjectId());
const ana = String(new Types.ObjectId());
const luis = String(new Types.ObjectId());
const jefa = String(new Types.ObjectId());

const names: Record<string, string> = {
  [ana]: 'Ana',
  [luis]: 'Luis',
  [jefa]: 'Jefa',
};

type Conv = {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  autoReply: boolean;
  takenOverBy?: Types.ObjectId;
  takenOverByName?: string;
};

const exec = <T>(v: T) => ({ exec: () => Promise.resolve(v) });

/**
 * Modelo en memoria con la semántica que importa: `findOneAndUpdate` solo
 * actualiza si el filtro `$or` (libre o mío) se cumple.
 */
function setup(initial: Partial<Conv> = {}) {
  const conv: Conv = {
    _id: new Types.ObjectId(),
    tenantId: new Types.ObjectId(tenantId),
    autoReply: false,
    ...initial,
  };
  const matches = (filter: Record<string, unknown>) => {
    const or = filter.$or as
      | { takenOverBy: Types.ObjectId | null }[]
      | undefined;
    if (!or) return true;
    return or.some((c) =>
      c.takenOverBy === null
        ? !conv.takenOverBy
        : String(conv.takenOverBy) === String(c.takenOverBy),
    );
  };
  const convModel = {
    findOne: jest.fn(() => exec(conv)),
    findById: jest.fn(() => exec(conv)),
    findOneAndUpdate: jest.fn(
      (
        filter: Record<string, unknown>,
        update: { $set?: Partial<Conv>; $unset?: Record<string, 1> },
      ) => {
        if (!matches(filter)) return exec(null);
        Object.assign(conv, update.$set ?? {});
        for (const k of Object.keys(update.$unset ?? {}))
          delete (conv as Record<string, unknown>)[k];
        return exec(conv);
      },
    ),
  };
  const notes: string[] = [];
  const msgModel = {
    create: jest.fn((m: { text: string }) => {
      notes.push(m.text);
      return Promise.resolve(m);
    }),
  };
  const users = [
    {
      _id: new Types.ObjectId(ana),
      name: 'Ana',
      email: 'a@x.pe',
      role: 'MARKETING',
    },
    {
      _id: new Types.ObjectId(luis),
      name: 'Luis',
      email: 'l@x.pe',
      role: 'MARKETING',
    },
    {
      _id: new Types.ObjectId(jefa),
      name: 'Jefa',
      email: 'j@x.pe',
      role: 'MANAGER',
    },
    {
      _id: new Types.ObjectId(),
      name: 'Cocina',
      email: 'k@x.pe',
      role: 'KITCHEN',
    },
  ];
  const userModel = {
    find: jest.fn(() => ({
      select: () => ({ lean: () => exec(users) }),
    })),
    findById: jest.fn((id: string) => ({
      select: () => ({ lean: () => exec({ name: names[String(id)] }) }),
    })),
  };
  const roles = {
    accessFor: jest.fn((_t: string, role: string) =>
      Promise.resolve({ modules: role === 'KITCHEN' ? ['kds'] : ['inbox'] }),
    ),
  };
  const gateway = { emitConversation: jest.fn(), emitMessage: jest.fn() };
  const service = new ConversationAssignmentService(
    convModel as never,
    msgModel as never,
    userModel as never,
    roles as never,
    gateway as never,
  );
  return { service, conv, notes, gateway };
}

const as = (userId: string, role = 'MARKETING') => ({ userId, role });

describe('ConversationAssignmentService', () => {
  it('tomar un chat libre lo asigna, apaga la IA y deja nota', async () => {
    const h = setup({ autoReply: true });
    await h.service.take(String(h.conv._id), tenantId, as(ana));
    expect(String(h.conv.takenOverBy)).toBe(ana);
    expect(h.conv.takenOverByName).toBe('Ana');
    expect(h.conv.autoReply).toBe(false);
    expect(h.notes).toEqual(['Ana tomó la conversación.']);
    expect(h.gateway.emitConversation).toHaveBeenCalled();
  });

  it('no se puede tomar un chat que atiende otro vendedor', async () => {
    const h = setup({
      takenOverBy: new Types.ObjectId(ana),
      takenOverByName: 'Ana',
    });
    await expect(
      h.service.take(String(h.conv._id), tenantId, as(luis)),
    ).rejects.toThrow(
      new ConflictException('Ana está atendiendo esta conversación.'),
    );
    await expect(
      h.service.take(String(h.conv._id), tenantId, as(luis), true),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(String(h.conv.takenOverBy)).toBe(ana);
  });

  it('un supervisor puede quitarle el chat a otro vendedor', async () => {
    const h = setup({
      takenOverBy: new Types.ObjectId(ana),
      takenOverByName: 'Ana',
    });
    await h.service.take(
      String(h.conv._id),
      tenantId,
      as(jefa, 'MANAGER'),
      true,
    );
    expect(String(h.conv.takenOverBy)).toBe(jefa);
    expect(h.notes).toEqual(['Jefa tomó la conversación (la atendía Ana).']);
  });

  it('si otro lo toma entre la lectura y la escritura, el segundo recibe 409', async () => {
    const h = setup();
    // Simula la carrera: al leer está libre, pero Luis lo toma antes de escribir.
    const stale = { ...h.conv };
    h.conv.takenOverBy = new Types.ObjectId(luis);
    h.conv.takenOverByName = 'Luis';
    await expect(
      h.service.ensureWriter(stale as never, as(ana)),
    ).rejects.toThrow('Luis está atendiendo esta conversación.');
    expect(String(h.conv.takenOverBy)).toBe(luis);
  });

  it('escribir en un chat libre lo toma; en uno propio no cambia nada', async () => {
    const h = setup();
    await h.service.ensureWriter(h.conv as never, as(ana));
    expect(String(h.conv.takenOverBy)).toBe(ana);
    await h.service.ensureWriter(h.conv as never, as(ana));
    expect(h.notes).toHaveLength(1);
  });

  it('el dueño transfiere el chat a un compañero', async () => {
    const h = setup({
      takenOverBy: new Types.ObjectId(ana),
      takenOverByName: 'Ana',
    });
    await h.service.assign(String(h.conv._id), tenantId, as(ana), luis);
    expect(String(h.conv.takenOverBy)).toBe(luis);
    expect(h.notes).toEqual(['Ana asignó la conversación a Luis.']);
  });

  it('un tercero no puede transferir un chat ajeno', async () => {
    const h = setup({
      takenOverBy: new Types.ObjectId(ana),
      takenOverByName: 'Ana',
    });
    await expect(
      h.service.assign(String(h.conv._id), tenantId, as(luis), luis),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('no se asigna a quien no tiene acceso a la bandeja', async () => {
    const h = setup();
    await expect(
      h.service.assign(
        String(h.conv._id),
        tenantId,
        as(jefa, 'MANAGER'),
        String(new Types.ObjectId()),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('liberar deja el chat en cola sin IA', async () => {
    const h = setup({
      takenOverBy: new Types.ObjectId(ana),
      takenOverByName: 'Ana',
    });
    await h.service.release(String(h.conv._id), tenantId, as(ana));
    expect(h.conv.takenOverBy).toBeUndefined();
    expect(h.conv.takenOverByName).toBeUndefined();
    expect(h.conv.autoReply).toBe(false);
  });

  it('el equipo solo incluye a quien tiene la bandeja', async () => {
    const h = setup();
    const team = await h.service.team(tenantId);
    expect(team.map((m) => m.name)).toEqual(['Ana', 'Jefa', 'Luis']);
  });
});
