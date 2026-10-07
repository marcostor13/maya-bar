import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { EmailTemplatesService } from './email-templates.service';
import { EmailTemplate } from './email-template.schema';
import { Tenant } from '../tenants/tenant.schema';
import { AiService } from '../ai/ai.service';
import { MailService } from '../mail/mail.service';

const query = <T>(value: T) => {
  const q: Record<string, jest.Mock> = {};
  for (const m of ['sort', 'lean']) q[m] = jest.fn(() => q);
  q.exec = jest.fn().mockResolvedValue(value);
  return q;
};

describe('EmailTemplatesService', () => {
  const tenantId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  let service: EmailTemplatesService;
  let model: Record<string, jest.Mock>;
  const ai = { chat: jest.fn(), parseJson: jest.fn() };
  const mail = { sendHtml: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    model = {
      find: jest.fn(() => query([])),
      findOne: jest.fn(() => query(null)),
      create: jest.fn((doc: unknown) => Promise.resolve(doc)),
      deleteOne: jest.fn(() => query({})),
    };
    ai.chat.mockResolvedValue('{}');
    mail.sendHtml.mockResolvedValue('id');
    const mod = await Test.createTestingModule({
      providers: [
        EmailTemplatesService,
        { provide: getModelToken(EmailTemplate.name), useValue: model },
        {
          provide: getModelToken(Tenant.name),
          useValue: { findById: jest.fn(() => query({ name: 'Maya' })) },
        },
        { provide: AiService, useValue: ai },
        { provide: MailService, useValue: mail },
      ],
    }).compile();
    service = mod.get(EmailTemplatesService);
  });

  it('el listado es de la empresa y no trae el HTML', async () => {
    await service.findAll(tenantId);
    const [filter, projection] = model.find.mock.calls[0];
    expect(filter.tenantId.toString()).toBe(tenantId);
    expect(projection.html).toBeUndefined();
    expect(projection.design).toBeUndefined();
  });

  it('una plantilla de otra empresa no existe para esta', async () => {
    await expect(
      service.findOne(new Types.ObjectId().toString(), tenantId),
    ).rejects.toThrow(NotFoundException);
    expect(model.findOne.mock.calls[0][0].tenantId.toString()).toBe(tenantId);
    await expect(service.findOne('no-es-un-id', tenantId)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('en modo HTML no guarda diseño de bloques', async () => {
    await service.create(tenantId, userId, {
      name: ' Mi HTML ',
      mode: 'html',
      design: { blocks: [] },
      html: '<p>hola</p>',
    });
    const saved = model.create.mock.calls[0][0];
    expect(saved.name).toBe('Mi HTML');
    expect(saved.design).toBeUndefined();
    expect(saved.tenantId.toString()).toBe(tenantId);
  });

  it('duplicar copia el contenido dentro de la misma empresa', async () => {
    const source = {
      name: 'Promo',
      subject: 's',
      preheader: 'p',
      mode: 'blocks',
      design: { settings: {}, blocks: [] },
      html: '<p>x</p>',
      tenantId: new Types.ObjectId(tenantId),
    };
    model.findOne.mockReturnValue(query(source));
    await service.duplicate(new Types.ObjectId().toString(), tenantId, userId);
    expect(model.create.mock.calls[0][0]).toMatchObject({
      name: 'Promo (copia)',
      html: '<p>x</p>',
      tenantId: source.tenantId,
    });
  });

  describe('generate', () => {
    it('solo deja pasar bloques conocidos y fuerza el enlace pedido', async () => {
      ai.parseJson.mockReturnValue({
        subject: 'Oferta',
        preheader: 'Mira',
        blocks: [
          { type: 'header', title: 'Hola' },
          { type: 'html', code: '<script>alert(1)</script>' },
          { type: 'video', src: 'x' },
          { type: 'text', content: 'Texto' },
          { type: 'text', content: '' },
          { type: 'button', label: 'Ir', href: 'https://malo.example' },
          { type: 'columns', items: [{ title: 'solo una' }] },
          { type: 'footer', text: 'Adiós' },
          'basura',
        ],
      });

      const out = await service.generate(tenantId, {
        brief: 'Promo de octubre',
        ctaUrl: 'https://tienda.com',
      });

      expect(out.design.blocks.map((b) => b.type)).toEqual([
        'header',
        'text',
        'button',
        'footer',
      ]);
      expect(out.design.blocks[2].props.href).toBe('https://tienda.com');
      expect(out.design.blocks.every((b) => b.id)).toBe(true);
      expect(out.subject).toBe('Oferta');
      // El encargo y la empresa llegan al modelo.
      expect(ai.chat.mock.calls[0][0]).toContain('Promo de octubre');
      expect(ai.chat.mock.calls[0][0]).toContain('Maya');
    });

    it('sin enlace pedido, el botón usa el link corto de cada destinatario', async () => {
      ai.parseJson.mockReturnValue({
        blocks: [{ type: 'button', label: 'Ir' }],
      });
      const out = await service.generate(tenantId, { brief: 'x' });
      expect(out.design.blocks[0].props.href).toBe('{link}');
    });

    it('si la IA no devuelve nada utilizable, lo dice en vez de guardar vacío', async () => {
      ai.parseJson.mockReturnValue({ blocks: [{ type: 'video' }] });
      await expect(service.generate(tenantId, { brief: 'x' })).rejects.toThrow(
        /diseño utilizable/,
      );
    });
  });

  describe('sendTest', () => {
    const dto = {
      to: 'yo@test.com',
      subject: 'Hola {nombre}',
      html: '<p>{nombre} · {empresa}</p>',
    };

    it('envía con datos de ejemplo y lo marca como prueba', async () => {
      await service.sendTest(tenantId, dto);
      const sent = mail.sendHtml.mock.calls[0][0];
      expect(sent.to).toBe('yo@test.com');
      expect(sent.subject).toBe('[Prueba] Hola María Pérez');
      expect(sent.html).toBe('<p>María Pérez · Maya</p>');
    });

    it('tiene un tope por empresa: no sirve para enviar correo en masa', async () => {
      for (let i = 0; i < 10; i++) await service.sendTest(tenantId, dto);
      await expect(service.sendTest(tenantId, dto)).rejects.toThrow(
        /muchas pruebas/,
      );
      expect(mail.sendHtml).toHaveBeenCalledTimes(10);
      // El tope es por empresa.
      await expect(
        service.sendTest(new Types.ObjectId().toString(), dto),
      ).resolves.toBeUndefined();
    });

    it('un fallo del proveedor llega como error legible', async () => {
      mail.sendHtml.mockRejectedValue(new Error('dominio no verificado'));
      await expect(service.sendTest(tenantId, dto)).rejects.toThrow(
        'No se pudo enviar la prueba: dominio no verificado',
      );
    });
  });
});
