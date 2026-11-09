import { JwtService } from '@nestjs/jwt';
import {
  ConversationsGateway,
  callsRoom,
  tenantRoom,
  userRoom,
} from './conversations.gateway';

const SECRET = 'gw-secret';

describe('ConversationsGateway — autenticación y salas', () => {
  const signer = new JwtService({ secret: SECRET });
  let activeUsers: { check: jest.Mock };
  let roles: { modulesFor: jest.Mock };
  let gateway: ConversationsGateway;

  const client = (auth: Record<string, unknown> = {}, query = {}) => ({
    handshake: { auth, query },
    data: {} as Record<string, unknown>,
    join: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  });
  const token = (payload: Record<string, unknown>) =>
    signer.sign({
      sub: 'u1',
      role: 'SERVER',
      tenantId: 't1',
      iatMs: Date.now(),
      ...payload,
    });

  beforeEach(() => {
    activeUsers = { check: jest.fn().mockResolvedValue('ok') };
    roles = { modulesFor: jest.fn().mockResolvedValue(['inbox']) };
    const config = { getOrThrow: () => SECRET };
    gateway = new ConversationsGateway(
      config as never,
      activeUsers as never,
      roles as never,
    );
  });

  it('sin token desconecta, aunque mande un tenantId en la query', async () => {
    const c = client({}, { tenantId: 't1' });
    await gateway.handleConnection(c as never);
    expect(c.disconnect).toHaveBeenCalledWith(true);
    expect(c.join).not.toHaveBeenCalled();
  });

  it('un token firmado con otro secreto desconecta', async () => {
    const forged = new JwtService({ secret: 'otro' }).sign({
      sub: 'u1',
      role: 'SERVER',
      tenantId: 't1',
    });
    const c = client({ token: forged });
    await gateway.handleConnection(c as never);
    expect(c.disconnect).toHaveBeenCalled();
  });

  it('una sesión revocada desconecta', async () => {
    activeUsers.check.mockResolvedValue('revoked');
    const c = client({ token: token({}) });
    await gateway.handleConnection(c as never);
    expect(c.disconnect).toHaveBeenCalled();
  });

  it('con sesión válida entra en la sala de su empresa (del token) y en la suya', async () => {
    const c = client({ token: token({}) }, { tenantId: 'otra' });
    await gateway.handleConnection(c as never);
    expect(c.disconnect).not.toHaveBeenCalled();
    expect(c.join).toHaveBeenCalledWith([tenantRoom('t1'), userRoom('u1')]);
  });

  it('solo un rol con el módulo Llamadas entra en la sala de llamadas', async () => {
    roles.modulesFor.mockResolvedValue(['inbox', 'calls']);
    const c = client({ token: token({}) });
    await gateway.handleConnection(c as never);
    expect(c.join).toHaveBeenCalledWith([
      tenantRoom('t1'),
      userRoom('u1'),
      callsRoom('t1'),
    ]);
  });

  it('emite a la sala de la empresa, de llamadas o del usuario', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    gateway.server = { to } as never;
    gateway.emitMessage('t1', { a: 1 });
    expect(to).toHaveBeenLastCalledWith(tenantRoom('t1'));
    gateway.emitToCalls('t1', 'call:incoming', {});
    expect(to).toHaveBeenLastCalledWith(callsRoom('t1'));
    gateway.emitToUser('u1', 'call:answer', {});
    expect(to).toHaveBeenLastCalledWith(userRoom('u1'));
    expect(emit).toHaveBeenLastCalledWith('call:answer', {});
  });
});
