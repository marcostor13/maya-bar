import { BadRequestException } from '@nestjs/common';
import { PushController } from './push.controller';

const req = { user: { userId: 'u1', tenantId: 't1', role: 'TENANT_ADMIN' } };

describe('PushController', () => {
  function build() {
    const web = {
      save: jest.fn().mockResolvedValue({ _id: 'w1', p256dh: 'secreto' }),
      listForUser: jest
        .fn()
        .mockResolvedValue([{ id: 'w1', kind: 'web', label: 'Chrome' }]),
      removeById: jest.fn().mockResolvedValue({ removed: 1 }),
      sendToUser: jest.fn().mockResolvedValue(1),
      isEnabled: jest.fn().mockReturnValue(true),
      countForUser: jest.fn().mockResolvedValue(1),
    };
    const native = {
      listForUser: jest
        .fn()
        .mockResolvedValue([{ id: 'n1', kind: 'android', label: 'App' }]),
      removeById: jest.fn().mockResolvedValue({ removed: 1 }),
      sendToUser: jest.fn().mockResolvedValue(2),
    };
    const audience = {
      getPrefs: jest.fn().mockResolvedValue({ chats: true }),
      setPrefs: jest.fn().mockResolvedValue({ chats: false }),
    };
    const ctrl = new PushController(
      web as never,
      native as never,
      audience as never,
    );
    return { ctrl, web, native, audience };
  }

  it('el alta devuelve solo el id, no las claves', async () => {
    const { ctrl } = build();
    await expect(
      ctrl.subscribe({ endpoint: 'e', p256dh: 'p', auth: 'a' }, req as never),
    ).resolves.toEqual({ id: 'w1' });
  });

  it('lista los dispositivos de los dos canales del usuario de la sesión', async () => {
    const { ctrl, web, native } = build();
    const list = await ctrl.devices(req as never);
    expect(web.listForUser).toHaveBeenCalledWith('u1');
    expect(native.listForUser).toHaveBeenCalledWith('u1');
    expect(list.map((d) => d.id)).toEqual(['n1', 'w1']);
  });

  it('borra el dispositivo en su canal, siempre a nombre del usuario', async () => {
    const { ctrl, web, native } = build();
    await ctrl.removeDevice('web', 'w1', req as never);
    expect(web.removeById).toHaveBeenCalledWith('w1', 'u1');
    await ctrl.removeDevice('android', 'n1', req as never);
    expect(native.removeById).toHaveBeenCalledWith('n1', 'u1');
    expect(() => ctrl.removeDevice('otro', 'x', req as never)).toThrow(
      BadRequestException,
    );
  });

  it('lee y guarda las preferencias del propio usuario', async () => {
    const { ctrl, audience } = build();
    await ctrl.preferences(req as never);
    expect(audience.getPrefs).toHaveBeenCalledWith('u1');
    await ctrl.savePreferences({ chats: false }, req as never);
    expect(audience.setPrefs).toHaveBeenCalledWith('u1', { chats: false });
  });

  it('la prueba sale por los dos canales y sin categoría', async () => {
    const { ctrl, web, native } = build();
    await expect(ctrl.test(req as never)).resolves.toEqual({ sent: 3 });
    expect(web.sendToUser.mock.calls[0][1]).not.toHaveProperty('category');
    expect(native.sendToUser).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ data: { route: '/inbox' } }),
    );
  });
});
