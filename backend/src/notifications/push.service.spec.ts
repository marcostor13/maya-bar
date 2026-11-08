import { createPrivateKey, generateKeyPairSync } from 'crypto';
import { Types } from 'mongoose';
import { getMessaging } from 'firebase-admin/messaging';
import {
  NativePushService,
  describeKeyShape,
  normalizePrivateKey,
} from './push.service';

/**
 * La clave se guarda bien y aun así el contenedor no la parseaba: docker-compose
 * altera las barras invertidas al inyectarla. Estos casos reproducen cada forma
 * en que ha llegado rota.
 */
describe('normalizePrivateKey', () => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const pem = privateKey;

  /** Vale si el resultado es una clave que `crypto` acepta. */
  const parsea = (valor: string) => {
    expect(() => createPrivateKey(normalizePrivateKey(valor))).not.toThrow();
  };

  it('acepta el PEM tal cual, con saltos de línea reales', () => {
    parsea(pem);
  });

  it('acepta la forma de .env: una línea con \\n escapados', () => {
    parsea(pem.replace(/\n/g, '\\n'));
  });

  it('acepta las barras duplicadas que introduce docker-compose', () => {
    parsea(pem.replace(/\n/g, '\\\\n'));
  });

  it('acepta el valor entrecomillado', () => {
    parsea(`"${pem.replace(/\n/g, '\\n')}"`);
    parsea(`'${pem.replace(/\n/g, '\\n')}'`);
  });

  it('acepta los guiones escapados de las cabeceras', () => {
    parsea(pem.replace(/\n/g, '\\n').replace(/-----/g, '\\-\\-\\-\\-\\-'));
  });

  it('tolera espacios alrededor y garantiza el salto final', () => {
    const salida = normalizePrivateKey(`  ${pem.trim()}  `);
    expect(salida.endsWith('\n')).toBe(true);
    parsea(`  ${pem.trim()}  `);
  });
});

describe('describeKeyShape', () => {
  it('describe la forma sin revelar el contenido', () => {
    const secreto =
      '-----BEGIN PRIVATE KEY-----\\nSUPERSECRETO\\n-----END PRIVATE KEY-----';
    const forma = describeKeyShape(secreto);

    expect(forma).toContain('2 "\\n" literales');
    expect(forma).toContain(`${secreto.length} chars`);
    expect(forma).not.toContain('SUPERSECRETO');
  });
});

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(),
}));

describe('NativePushService', () => {
  const userA = new Types.ObjectId().toString();
  const tokensChain = (rows: unknown) => ({
    select: () => ({ lean: () => Promise.resolve(rows) }),
  });

  function build() {
    const deviceTokens = {
      find: jest.fn(() =>
        tokensChain([{ token: 'tok-1' }, { token: 'tok-2' }]),
      ),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    const audience = {
      forUsers: jest.fn().mockResolvedValue([userA]),
      forModule: jest.fn().mockResolvedValue([userA]),
    };
    const send = jest.fn().mockResolvedValue({
      successCount: 1,
      responses: [
        { success: true },
        {
          success: false,
          error: { code: 'messaging/registration-token-not-registered' },
        },
      ],
    });
    (getMessaging as jest.Mock).mockReturnValue({ sendEachForMulticast: send });
    const svc = new NativePushService(
      { get: () => undefined } as never,
      audience as never,
      deviceTokens as never,
    );
    // Firebase "inicializado" sin credenciales reales.
    (svc as unknown as { app: unknown }).app = {};
    return { svc, deviceTokens, audience, send };
  }

  it('respeta las preferencias, pone badge, sonido y etiqueta, y borra tokens muertos', async () => {
    const { svc, audience, send, deviceTokens } = build();
    const sent = await svc.sendToTenantModule('t1', 'inbox', {
      title: 'Ana',
      body: 'Hola',
      tag: 'conv_1',
      category: 'chats',
      badge: 7,
      data: { route: '/inbox?c=1' },
    });
    expect(sent).toBe(1);
    expect(audience.forModule).toHaveBeenCalledWith('t1', 'inbox', {
      category: 'chats',
      excludeUserId: undefined,
    });
    const msg = send.mock.calls[0][0];
    expect(msg.tokens).toEqual(['tok-1', 'tok-2']);
    expect(msg.android.notification).toMatchObject({
      tag: 'conv_1',
      notificationCount: 7,
      defaultSound: true,
    });
    expect(deviceTokens.deleteMany).toHaveBeenCalledWith({
      token: { $in: ['tok-2'] },
    });
  });

  it('no envía si la audiencia descarta al usuario', async () => {
    const { svc, audience, send } = build();
    audience.forUsers.mockResolvedValue([]);
    expect(
      await svc.sendToUser(userA, { title: 'x', body: 'y', category: 'leads' }),
    ).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('la baja por token solo afecta a los tokens del usuario', async () => {
    const { svc, deviceTokens } = build();
    await svc.unregisterDevice('tok-1', userA);
    expect(deviceTokens.deleteOne).toHaveBeenCalledWith({
      token: 'tok-1',
      userId: new Types.ObjectId(userA),
    });
  });

  it('nunca lanza si la base falla', async () => {
    const { svc, deviceTokens } = build();
    deviceTokens.find.mockImplementation(() => {
      throw new Error('mongo caído');
    });
    await expect(
      svc.sendToUser(userA, { title: 'x', body: 'y' }),
    ).resolves.toBe(0);
  });
});
