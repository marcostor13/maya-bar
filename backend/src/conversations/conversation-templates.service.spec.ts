import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ConversationTemplatesService } from './conversation-templates.service';
import { resolveTemplateSend } from '../whatsapp-templates/template-send';

const tenantId = new Types.ObjectId().toString();
const userId = new Types.ObjectId().toString();
const accountId = new Types.ObjectId();
const convId = String(new Types.ObjectId());
const tplId = String(new Types.ObjectId());

function query(result: unknown) {
  const q: any = { exec: jest.fn().mockResolvedValue(result) };
  q.sort = jest.fn().mockReturnValue(q);
  q.lean = jest.fn().mockReturnValue(q);
  return q;
}

const approved = {
  _id: new Types.ObjectId(tplId),
  name: 'seguimiento',
  language: 'es',
  category: 'UTILITY',
  status: 'APPROVED',
  body: 'Hola {{1}}, ¿seguimos con {{2}}?',
};

describe('ConversationTemplatesService (HU27)', () => {
  let service: ConversationTemplatesService;
  let templateModel: any;
  let conversations: any;
  let applies: boolean;

  beforeEach(() => {
    applies = true;
    templateModel = {
      find: jest.fn(() => query([])),
      findOne: jest.fn(() => query(approved)),
    };
    conversations = {
      getConversation: jest.fn().mockResolvedValue({
        _id: convId,
        tenantId: new Types.ObjectId(tenantId),
        accountId,
      }),
      windowStatus: jest.fn(() =>
        Promise.resolve({ applies, open: false, expiresAt: null }),
      ),
      sendTemplateMessage: jest.fn().mockResolvedValue({ _id: 'm1' }),
    };
    service = new ConversationTemplatesService(templateModel, conversations);
  });

  it('lista solo aprobadas de la cuenta del chat, sin autenticación ni multimedia sin archivo', async () => {
    templateModel.find.mockReturnValue(
      query([
        approved,
        { ...approved, name: 'promo', headerType: 'IMAGE' },
        {
          ...approved,
          name: 'con_foto',
          headerType: 'IMAGE',
          headerMediaUrl: 'https://x/y.jpg',
        },
        {
          ...approved,
          name: 'cab',
          headerType: 'TEXT',
          headerText: 'Hola {{1}}',
        },
      ]),
    );
    const list = await service.list(convId, tenantId);
    expect(templateModel.find).toHaveBeenCalledWith({
      tenantId: new Types.ObjectId(tenantId),
      accountId,
      status: 'APPROVED',
      category: { $ne: 'AUTHENTICATION' },
    });
    expect(list.map((t) => t.name)).toEqual(['seguimiento', 'con_foto', 'cab']);
    expect(list[0]).toMatchObject({ variables: 2, headerVariable: false });
    expect(list[2].headerVariable).toBe(true);
  });

  it('sin ventana (QR, otros canales) no hay plantillas', async () => {
    applies = false;
    expect(await service.list(convId, tenantId)).toEqual([]);
    expect(templateModel.find).not.toHaveBeenCalled();
    await expect(
      service.send(convId, tenantId, userId, { templateId: tplId }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('C3: rellena las variables y la envía', async () => {
    await service.send(convId, tenantId, userId, {
      templateId: tplId,
      variables: [' Ana ', 'tu pedido'],
      clientId: 'client-123456',
    });
    expect(templateModel.findOne).toHaveBeenCalledWith({
      _id: new Types.ObjectId(tplId),
      tenantId: new Types.ObjectId(tenantId),
      accountId,
    });
    expect(conversations.sendTemplateMessage).toHaveBeenCalledWith(
      convId,
      tenantId,
      userId,
      {
        text: 'Hola Ana, ¿seguimos con tu pedido?',
        send: {
          name: 'seguimiento',
          language: 'es',
          variables: ['Ana', 'tu pedido'],
          header: undefined,
        },
      },
      'client-123456',
    );
  });

  it('C4: faltan variables → 422 sin enviar', async () => {
    await expect(
      service.send(convId, tenantId, userId, {
        templateId: tplId,
        variables: ['Ana'],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(conversations.sendTemplateMessage).not.toHaveBeenCalled();
  });

  it('C4: de otra cuenta o no aprobada → 422', async () => {
    templateModel.findOne.mockReturnValue(query(null));
    await expect(
      service.send(convId, tenantId, userId, { templateId: tplId }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    templateModel.findOne.mockReturnValue(
      query({ ...approved, status: 'PENDING' }),
    );
    await expect(
      service.send(convId, tenantId, userId, {
        templateId: tplId,
        variables: ['a', 'b'],
      }),
    ).rejects.toThrow(/no está aprobada/);
    expect(conversations.sendTemplateMessage).not.toHaveBeenCalled();
  });
});

describe('resolveTemplateSend', () => {
  it('cabecera de texto con variable la pide; multimedia usa el archivo guardado', () => {
    const base = {
      name: 'x',
      language: 'es',
      status: 'APPROVED',
      body: 'Hola',
    };
    expect(() =>
      resolveTemplateSend(
        { ...base, headerType: 'TEXT', headerText: 'Hola {{1}}' },
        {},
      ),
    ).toThrow(/cabecera/);
    expect(
      resolveTemplateSend(
        { ...base, headerType: 'TEXT', headerText: 'Hola {{1}}' },
        { headerText: 'Ana' },
      ).send.header,
    ).toEqual({ format: 'TEXT', text: 'Ana' });
    expect(
      resolveTemplateSend(
        { ...base, headerType: 'image', headerMediaUrl: 'https://s3/x.jpg' },
        {},
      ).send.header,
    ).toEqual({ format: 'IMAGE', mediaUrl: 'https://s3/x.jpg' });
  });
});
