import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { EmailAccountsService } from './email-accounts.service';
import { SecretBox } from '../shared/secret-box';

const TENANT = new Types.ObjectId().toString();
const exec = <T>(v: T) => ({ exec: () => Promise.resolve(v) });
const box = new SecretBox('jwt');

function setup() {
  const docs = new Map<string, Record<string, unknown>>();
  const model = {
    exists: jest.fn(() => Promise.resolve(null)),
    create: jest.fn((doc: Record<string, unknown>) => {
      const _id = new Types.ObjectId();
      docs.set(String(_id), { ...doc, _id });
      return Promise.resolve({ ...doc, _id });
    }),
    findOne: jest.fn((f: { _id?: Types.ObjectId }) =>
      exec(f._id ? (docs.get(String(f._id)) ?? null) : null),
    ),
    findById: jest.fn((id: Types.ObjectId) => ({
      select: () => exec(docs.get(String(id)) ?? null),
    })),
    updateOne: jest.fn(
      (f: { _id: Types.ObjectId }, u: { $set: Record<string, unknown> }) => {
        const d = docs.get(String(f._id));
        if (d) Object.assign(d, u.$set);
        return exec({ matchedCount: d ? 1 : 0, modifiedCount: d ? 1 : 0 });
      },
    ),
  };
  const transport = { test: jest.fn().mockResolvedValue(undefined) };
  const oauth = { refresh: jest.fn() };
  const config = { get: () => undefined, getOrThrow: () => 'jwt' };
  const service = new EmailAccountsService(
    model as never,
    transport as never,
    oauth as never,
    config as never,
  );
  const changes: string[] = [];
  service.changes.subscribe((c) => changes.push(c.accountId));
  return { service, model, transport, oauth, docs, changes };
}

const custom = {
  label: 'Ventas',
  email: 'Ventas@Acme.PE',
  incomingProtocol: 'imap' as const,
  incomingHost: 'imap.acme.pe',
  incomingPort: 993,
  incomingSecure: true,
  smtpHost: 'smtp.acme.pe',
  smtpPort: 465,
  smtpSecure: true,
  password: 'clave-secreta',
};

describe('EmailAccountsService', () => {
  it('prueba la conexión antes de guardar y guarda la contraseña cifrada', async () => {
    const { service, transport, docs, changes } = setup();
    await service.createCustom(TENANT, custom);

    expect(transport.test).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'imap.acme.pe',
        auth: { user: 'ventas@acme.pe', pass: 'clave-secreta' },
      }),
      expect.objectContaining({ host: 'smtp.acme.pe', port: 465 }),
    );
    const saved = [...docs.values()][0];
    expect(saved).toMatchObject({
      email: 'ventas@acme.pe',
      provider: 'custom',
      isDefault: true,
    });
    expect(saved.password).toBeUndefined();
    expect(saved.passwordEnc).not.toContain('clave-secreta');
    expect(box.decrypt(saved.passwordEnc as string)).toBe('clave-secreta');
    expect(changes).toHaveLength(1);
  });

  it('no guarda nada si la conexión falla, y explica por qué', async () => {
    const { service, transport, model } = setup();
    transport.test.mockRejectedValue(
      new Error('Entrada (IMAP): credenciales rechazadas'),
    );
    await expect(service.createCustom(TENANT, custom)).rejects.toThrow(
      new BadRequestException(
        'No se pudo conectar: Entrada (IMAP): credenciales rechazadas',
      ),
    );
    expect(model.create).not.toHaveBeenCalled();
  });

  it('no deja conectar dos veces el mismo buzón', async () => {
    const { service, model } = setup();
    model.exists.mockResolvedValueOnce({ _id: 'x' } as never);
    await expect(service.createCustom(TENANT, custom)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('usa el access token vigente sin llamar al proveedor', async () => {
    const { service, oauth } = setup();
    const auth = await service.auth({
      provider: 'gmail',
      email: 'ana@acme.pe',
      accessTokenEnc: box.encrypt('token-vigente'),
      accessTokenExpiresAt: new Date(Date.now() + 30 * 60_000),
    } as never);
    expect(auth).toEqual({ user: 'ana@acme.pe', accessToken: 'token-vigente' });
    expect(oauth.refresh).not.toHaveBeenCalled();
  });

  it('renueva el token caducado y guarda el refresh token rotado', async () => {
    const { service, oauth, model } = setup();
    oauth.refresh.mockResolvedValue({
      accessToken: 'nuevo',
      refreshToken: 'rt-2',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const account = {
      _id: new Types.ObjectId(),
      provider: 'outlook',
      email: 'ana@acme.pe',
      refreshTokenEnc: box.encrypt('rt-1'),
      accessTokenEnc: box.encrypt('viejo'),
      accessTokenExpiresAt: new Date(Date.now() + 30_000),
    };
    const auth = await service.auth(account as never);
    expect(oauth.refresh).toHaveBeenCalledWith('outlook', 'rt-1');
    expect(auth).toEqual({ user: 'ana@acme.pe', accessToken: 'nuevo' });
    const set = (
      model.updateOne.mock.calls[0] as unknown as [
        unknown,
        { $set: Record<string, string> },
      ]
    )[1].$set;
    expect(box.decrypt(set.accessTokenEnc)).toBe('nuevo');
    expect(box.decrypt(set.refreshTokenEnc)).toBe('rt-2');
  });

  it('pide reconectar cuando el proveedor revocó el acceso', async () => {
    const { service, oauth } = setup();
    oauth.refresh.mockRejectedValue(new Error('OAuth gmail: invalid_grant'));
    await expect(
      service.auth({
        provider: 'gmail',
        email: 'a@b.pe',
        refreshTokenEnc: box.encrypt('rt'),
      } as never),
    ).rejects.toThrow('Vuelve a conectar la cuenta de Gmail');
  });

  it('no permite editar servidores de una cuenta de Gmail/Outlook', async () => {
    const { service, docs } = setup();
    const _id = new Types.ObjectId();
    docs.set(String(_id), {
      _id,
      tenantId: new Types.ObjectId(TENANT),
      provider: 'gmail',
    });
    await expect(
      service.update(String(_id), TENANT, { smtpHost: 'evil.example.com' }),
    ).rejects.toThrow('reconecta la cuenta');
    // Lo cosmético sí se puede cambiar.
    await service.update(String(_id), TENANT, {
      label: 'Soporte',
      signature: 'Equipo',
    });
    expect(docs.get(String(_id))).toMatchObject({
      label: 'Soporte',
      signature: 'Equipo',
    });
  });

  it('fromHeader limpia comillas del nombre', () => {
    const { service } = setup();
    expect(
      service.fromHeader({
        fromName: 'Acme "Ventas"',
        email: 'v@acme.pe',
      } as never),
    ).toBe('"Acme Ventas" <v@acme.pe>');
    expect(service.fromHeader({ label: '', email: 'v@acme.pe' } as never)).toBe(
      'v@acme.pe',
    );
  });
});
