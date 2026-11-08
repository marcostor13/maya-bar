import { Types } from 'mongoose';
import {
  PushAudienceService,
  categoryForModule,
  prefsAllow,
} from './push-audience.service';
import { describeUserAgent } from './device-label';

const tenantId = new Types.ObjectId().toString();
const id = () => new Types.ObjectId();

/** `find().select().lean()` que resuelve a `rows`. */
const chain = (rows: unknown) => {
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.lean = () =>
    rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows);
  return q;
};

describe('PushAudienceService', () => {
  function build(rows: unknown, modulesByRole: Record<string, string[]> = {}) {
    const users = {
      find: jest.fn(() => chain(rows)),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };
    const roles = {
      modulesFor: jest.fn((_t: string, role: string) =>
        Promise.resolve(modulesByRole[role] ?? []),
      ),
    };
    return {
      svc: new PushAudienceService(users as never, roles as never),
      users,
      roles,
    };
  }

  it('solo incluye usuarios activos de la empresa cuyo rol tiene el módulo', async () => {
    const admin = id();
    const kitchen = id();
    const { svc, users, roles } = build(
      [
        { _id: admin, role: 'TENANT_ADMIN' },
        { _id: kitchen, role: 'KITCHEN' },
        { _id: id(), role: 'TENANT_ADMIN', pushPrefs: { chats: false } },
      ],
      { TENANT_ADMIN: ['inbox'], KITCHEN: [] },
    );
    const out = await svc.forModule(tenantId, 'inbox');
    expect(out).toEqual([String(admin)]);
    expect(users.find).toHaveBeenCalledWith({
      tenantId: new Types.ObjectId(tenantId),
      isActive: true,
    });
    // La matriz se consulta una vez por rol, no por usuario.
    expect(roles.modulesFor).toHaveBeenCalledTimes(2);
  });

  it('excluye a quien provocó el evento', async () => {
    const a = id();
    const b = id();
    const { svc } = build(
      [
        { _id: a, role: 'R' },
        { _id: b, role: 'R' },
      ],
      { R: ['leads'] },
    );
    expect(
      await svc.forModule(tenantId, 'leads', { excludeUserId: String(a) }),
    ).toEqual([String(b)]);
  });

  it('respeta "silenciar todo" y la categoría de cada aviso', async () => {
    const muted = id();
    const noLeads = id();
    const ok = id();
    const t = new Types.ObjectId(tenantId);
    const { svc, users } = build(
      [
        { _id: muted, role: 'R', tenantId: t, pushPrefs: { muted: true } },
        { _id: noLeads, role: 'R', tenantId: t, pushPrefs: { leads: false } },
        { _id: ok, role: 'R', tenantId: t },
      ],
      { R: ['leads'] },
    );
    expect(await svc.forUsers([muted, noLeads, ok], 'leads')).toEqual([
      String(ok),
    ]);
    expect(users.find).toHaveBeenCalledWith({
      _id: { $in: [muted, noLeads, ok] },
      isActive: true,
    });
  });

  it('a un usuario concreto solo le avisa si su rol sigue teniendo el módulo', async () => {
    const owner = id();
    const { svc, roles } = build(
      [
        {
          _id: owner,
          role: 'VENDEDOR',
          tenantId: new Types.ObjectId(tenantId),
        },
      ],
      { VENDEDOR: ['leads'] },
    );
    expect(await svc.forUsers([owner], 'chats')).toEqual([]);
    expect(roles.modulesFor).toHaveBeenCalledWith(tenantId, 'VENDEDOR');
    expect(await svc.forUsers([owner], 'leads')).toEqual([String(owner)]);
  });

  it('sin categoría (prueba) ignora las preferencias', async () => {
    const muted = id();
    const { svc } = build([{ _id: muted, pushPrefs: { muted: true } }]);
    expect(await svc.forUsers([muted])).toEqual([String(muted)]);
  });

  it('si la base falla no avisa a nadie y no lanza', async () => {
    const { svc } = build(new Error('mongo caído'));
    await expect(svc.forModule(tenantId, 'inbox')).resolves.toEqual([]);
    await expect(svc.forUsers([id()], 'chats')).resolves.toEqual([]);
  });

  it('guarda solo claves booleanas conocidas y devuelve valores por defecto', async () => {
    const { svc, users } = build([]);
    const lean = jest.fn().mockResolvedValue({ pushPrefs: { leads: false } });
    users.findByIdAndUpdate.mockReturnValue({
      select: () => ({ lean }),
    });
    const userId = String(id());
    const res = await svc.setPrefs(userId, {
      leads: false,
      // @ts-expect-error clave desconocida que debe ignorarse
      hack: true,
    });
    expect(users.findByIdAndUpdate).toHaveBeenCalledWith(
      userId,
      { $set: { 'pushPrefs.leads': false } },
      { new: true },
    );
    expect(res).toEqual({
      chats: true,
      forms: true,
      leads: false,
      recovery: true,
      muted: false,
    });
  });
});

describe('helpers de push', () => {
  it('mapea cada módulo a su tipo de aviso', () => {
    expect(categoryForModule('inbox')).toBe('chats');
    expect(categoryForModule('campaigns')).toBe('recovery');
    expect(categoryForModule('menu')).toBeUndefined();
  });

  it('prefsAllow: todo activo por defecto', () => {
    expect(prefsAllow(undefined, 'chats')).toBe(true);
    expect(prefsAllow({ chats: false }, 'chats')).toBe(false);
    expect(prefsAllow({ chats: false }, 'forms')).toBe(true);
  });

  it('describe el navegador y el sistema del User-Agent', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
      ),
    ).toBe('Chrome en Android');
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0',
      ),
    ).toBe('Edge en Windows');
    expect(describeUserAgent(undefined)).toBe('Navegador');
  });
});
