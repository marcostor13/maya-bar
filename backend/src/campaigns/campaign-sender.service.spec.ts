import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import {
  CampaignSenderService,
  htmlToText,
  plainEmailHtml,
  withUnsubscribeFooter,
} from './campaign-sender.service';
import { Campaign } from './campaign.schema';
import { CampaignRecipient } from './campaign-recipient.schema';
import { Customer } from '../customers/customer.schema';
import { Tenant } from '../tenants/tenant.schema';
import { MailService } from '../mail/mail.service';
import { EmailAccountsService } from '../email-accounts/email-accounts.service';
import { EmailTransportService } from '../email-accounts/email-transport.service';
import { SmsService } from '../sms/sms.service';
import { SuppressionService } from '../suppression/suppression.service';

const query = <T>(value: T) => {
  const q: Record<string, jest.Mock> = {};
  for (const m of ['sort', 'limit', 'lean']) q[m] = jest.fn(() => q);
  q.exec = jest.fn().mockResolvedValue(value);
  return q;
};

describe('CampaignSenderService', () => {
  const tenantId = new Types.ObjectId();
  let service: CampaignSenderService;
  let campaigns: Record<string, jest.Mock>;
  let recipients: Record<string, jest.Mock>;
  const mail = { sendHtml: jest.fn() };
  const sms = { requireConfig: jest.fn(), dispatch: jest.fn() };
  const suppression = { setFor: jest.fn(), matches: jest.fn(), add: jest.fn() };

  const recipient = (over: Record<string, unknown> = {}) => {
    const doc: any = {
      _id: new Types.ObjectId(),
      tenantId,
      customerId: new Types.ObjectId(),
      name: 'Ana',
      to: 'ana@test.com',
      status: 'pending',
      attempts: 0,
      save: jest.fn(),
      ...over,
    };
    doc.save.mockResolvedValue(doc);
    return doc;
  };

  const campaign = (over: Record<string, unknown> = {}) =>
    ({
      _id: new Types.ObjectId(),
      tenantId,
      name: 'Promo',
      type: 'email',
      subject: 'Hola {primer_nombre}',
      body: 'Texto para {nombre}',
      ...over,
    }) as unknown as Campaign;

  /** Estados finales que devolverá el recuento tras el lote. */
  const statsAfter = (rows: Record<string, number>) =>
    recipients.aggregate.mockReturnValue(
      query(Object.entries(rows).map(([_id, n]) => ({ _id, n }))),
    );

  beforeEach(async () => {
    jest.clearAllMocks();
    campaigns = {
      updateOne: jest.fn(() => query({})),
      updateMany: jest.fn(() => query({})),
      find: jest.fn(() => query([])),
      findById: jest.fn(() => query({ name: 'Promo', type: 'email' })),
      findOneAndUpdate: jest.fn(() => query(null)),
    };
    recipients = {
      find: jest.fn(() => query([])),
      findById: jest.fn(() => query(null)),
      aggregate: jest.fn(() => query([])),
    };
    suppression.setFor.mockResolvedValue({ empty: true });
    suppression.matches.mockReturnValue(false);
    mail.sendHtml.mockResolvedValue('msg-1');
    sms.requireConfig.mockResolvedValue({ ratePerMinute: 30 });
    sms.dispatch.mockResolvedValue({ id: 'sms-1' });

    const mod = await Test.createTestingModule({
      providers: [
        CampaignSenderService,
        { provide: getModelToken(Campaign.name), useValue: campaigns },
        {
          provide: getModelToken(CampaignRecipient.name),
          useValue: recipients,
        },
        {
          provide: getModelToken(Customer.name),
          useValue: { find: jest.fn(() => query([])) },
        },
        {
          provide: getModelToken(Tenant.name),
          useValue: { findById: jest.fn(() => query({ name: 'Maya' })) },
        },
        { provide: MailService, useValue: mail },
        { provide: EmailAccountsService, useValue: {} },
        { provide: EmailTransportService, useValue: {} },
        { provide: SmsService, useValue: sms },
        { provide: SuppressionService, useValue: suppression },
        {
          provide: ConfigService,
          useValue: {
            get: () => 'https://api.test',
            getOrThrow: () => 'secreto-de-pruebas',
          },
        },
      ],
    }).compile();
    service = mod.get(CampaignSenderService);
  });

  it('envía el email con variables resueltas, link de baja y cabecera List-Unsubscribe', async () => {
    const r = recipient();
    recipients.find.mockReturnValue(query([r]));
    statsAfter({ sent: 1 });

    await service.processBatch(campaign());

    const sent = mail.sendHtml.mock.calls[0][0];
    expect(sent.to).toBe('ana@test.com');
    expect(sent.subject).toBe('Hola Ana');
    expect(sent.text).toBe('Texto para Ana');
    const baja = service.unsubscribeUrl(String(tenantId), 'ana@test.com');
    expect(sent.html).toContain(baja);
    expect(sent.headers['List-Unsubscribe']).toBe(`<${baja}>`);
    expect(r.status).toBe('sent');
    expect(r.providerId).toBe('msg-1');
  });

  it('un fallo no detiene el lote: el resto se envía igual', async () => {
    const bad = recipient({ to: 'mal@test.com' });
    const good = recipient({ to: 'bien@test.com' });
    recipients.find.mockReturnValue(query([bad, good]));
    mail.sendHtml.mockImplementation(({ to }: { to: string }) =>
      to === 'mal@test.com'
        ? Promise.reject(new Error('550 mailbox unavailable'))
        : Promise.resolve('ok'),
    );
    statsAfter({ sent: 1, failed: 1 });

    await service.processBatch(campaign());

    expect(bad.status).toBe('failed');
    expect(bad.error).toContain('550');
    expect(good.status).toBe('sent');
  });

  it('un error transitorio deja al destinatario pendiente para reintentar', async () => {
    const r = recipient();
    recipients.find.mockReturnValue(query([r]));
    mail.sendHtml.mockRejectedValue(new Error('connect ETIMEDOUT timeout'));
    statsAfter({ pending: 1 });

    await service.processBatch(campaign());

    expect(r.status).toBe('pending');
    expect(r.attempts).toBe(1);
    // Queda trabajo: la campaña no se cierra.
    expect(
      campaigns.updateOne.mock.calls.at(-1)![1].$set.status,
    ).toBeUndefined();
  });

  it('quien se dio de baja con el envío en marcha se omite, no se le envía', async () => {
    const r = recipient();
    recipients.find.mockReturnValue(query([r]));
    suppression.matches.mockReturnValue(true);
    statsAfter({ skipped: 1 });

    await service.processBatch(campaign());

    expect(mail.sendHtml).not.toHaveBeenCalled();
    expect(r.status).toBe('skipped');
  });

  it('cierra la campaña como enviada cuando ya no quedan pendientes', async () => {
    statsAfter({ sent: 8, failed: 1, skipped: 2 });

    await service.processBatch(campaign());

    const set = campaigns.updateOne.mock.calls.at(-1)![1].$set;
    expect(set.status).toBe('sent');
    expect(set.recipientCount).toBe(8);
    expect(set.errorMessage).toBe('1 no se pudieron enviar · 2 omitidos');
    expect(set.sentAt).toBeInstanceOf(Date);
  });

  it('si no salió ninguno y hubo errores, la campaña falla', async () => {
    statsAfter({ failed: 3 });
    await service.processBatch(campaign());
    expect(campaigns.updateOne.mock.calls.at(-1)![1].$set.status).toBe(
      'failed',
    );
  });

  it('SMS: respeta el ritmo del proveedor y usa el link personal', async () => {
    const r = recipient({
      to: '+51999000111',
      shortUrl: 'https://go.x/abc1234',
    });
    recipients.find.mockReturnValue(query([r]));
    statsAfter({ sent: 1 });

    await service.processBatch(
      campaign({ type: 'sms', body: 'Hola {nombre}: {link}' }),
    );

    expect(recipients.find.mock.results[0].value.limit).toHaveBeenCalledWith(
      30,
    );
    expect(sms.dispatch).toHaveBeenCalledWith(
      { ratePerMinute: 30 },
      '+51999000111',
      'Hola Ana: https://go.x/abc1234',
    );
    expect(r.providerId).toBe('sms-1');
  });

  it('SMS sin proveedor: la campaña falla en vez de reintentar para siempre', async () => {
    sms.requireConfig.mockRejectedValue(
      new Error('No hay un proveedor de SMS activo'),
    );
    await service.processBatch(campaign({ type: 'sms' }));
    expect(campaigns.updateOne.mock.calls[0][1].$set).toMatchObject({
      status: 'failed',
    });
    expect(sms.dispatch).not.toHaveBeenCalled();
  });

  describe('link de baja', () => {
    it('el token es verificable y no se puede falsificar', () => {
      const token = service.unsubscribeToken(String(tenantId), 'ana@test.com');
      expect(service.verifyUnsubscribeToken(token)).toEqual({
        tenantId: String(tenantId),
        to: 'ana@test.com',
      });
      const [payload, sig] = token.split('.');
      expect(service.verifyUnsubscribeToken(`${payload}.deadbeef`)).toBeNull();
      // La firma de una dirección no sirve para dar de baja a otra.
      const other = service.unsubscribeToken(String(tenantId), 'otra@test.com');
      expect(
        service.verifyUnsubscribeToken(`${other.split('.')[0]}.${sig}`),
      ).toBeNull();
      expect(service.verifyUnsubscribeToken('basura')).toBeNull();
    });

    it('da de baja aunque el destinatario ya no exista (reenvío o campaña borrada)', async () => {
      const done = await service.unsubscribe(
        service.unsubscribeToken(String(tenantId), 'ana@test.com'),
      );

      expect(done).toBe(true);
      // No consulta la colección de destinatarios: el token trae lo necesario.
      expect(recipients.findById).not.toHaveBeenCalled();
      expect(suppression.add).toHaveBeenCalledWith(
        String(tenantId),
        expect.objectContaining({ email: 'ana@test.com', source: 'reply' }),
      );
    });

    it('un teléfono se da de baja como teléfono', async () => {
      await service.unsubscribe(
        service.unsubscribeToken(String(tenantId), '+51999000111'),
      );
      expect(suppression.add).toHaveBeenCalledWith(
        String(tenantId),
        expect.objectContaining({ phone: '+51999000111' }),
      );
    });

    it('un token inválido no da de baja a nadie', async () => {
      expect(await service.unsubscribe('x.y')).toBe(false);
      expect(suppression.add).not.toHaveBeenCalled();
    });
  });
});

describe('helpers de email', () => {
  it('plainEmailHtml escapa el texto', () => {
    expect(plainEmailHtml('<b>hola</b> & "tú"')).toContain(
      '&lt;b&gt;hola&lt;/b&gt; &amp; &quot;tú&quot;',
    );
  });

  it('withUnsubscribeFooter añade el pie solo si el diseño no trae enlace de baja', () => {
    expect(withUnsubscribeFooter('<body><p>x</p></body>', true)).toBe(
      '<body><p>x</p></body>',
    );
    const out = withUnsubscribeFooter('<body><p>x</p></body>', false);
    expect(out).toContain('{baja}');
    expect(out.endsWith('</body>')).toBe(true);
  });

  it('htmlToText conserva los enlaces y quita estilos', () => {
    expect(
      htmlToText(
        '<style>a{color:red}</style><p>Hola <a href="https://x.com">aquí</a></p><p>Adiós</p>',
      ),
    ).toBe('Hola aquí (https://x.com)\nAdiós');
  });
});
