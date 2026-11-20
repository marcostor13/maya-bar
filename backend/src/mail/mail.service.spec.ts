import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService: rechazos de Resend (HU21)', () => {
  let service: MailService;
  let send: jest.Mock;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const config = { get: () => 're_test' } as unknown as ConfigService;
    service = new MailService(config);
    send = jest.fn();
    (service as unknown as { resend: unknown }).resend = { emails: { send } };
  });

  afterEach(() => jest.restoreAllMocks());

  it('C5: un `{ error }` del SDK se registra como error, no como enviado', async () => {
    send.mockResolvedValue({
      data: null,
      error: { message: 'The mayacrm.site domain is not verified' },
    });

    await service.sendPasswordResetEmail('a@b.com', '123456');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('a@b.com'),
      expect.objectContaining({
        message: expect.stringContaining('not verified'),
      }),
    );
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('→ a@b.com'),
    );
  });

  it('C5: un correo de campaña rechazado lanza el error para quien llama', async () => {
    send.mockResolvedValue({ data: null, error: { message: 'invalid to' } });
    await expect(
      service.sendCampaign({
        to: 'a@b.com',
        name: 'A',
        subject: 's',
        body: 'b',
      }),
    ).rejects.toThrow('invalid to');
  });

  it('un envío aceptado se registra como enviado', async () => {
    send.mockResolvedValue({ data: { id: 'em_1' }, error: null });

    await service.sendPasswordResetEmail('a@b.com', '123456');

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('→ a@b.com'));
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
