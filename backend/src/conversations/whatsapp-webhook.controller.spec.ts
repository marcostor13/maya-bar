import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import type { InboundMessage } from './conversations.service';

/** Lo que el webhook entrega al servicio para cada payload de WhatsApp. */
describe('WhatsAppWebhookController — tipos de mensaje', () => {
  const account = { _id: 'acc1', active: true };
  let accounts: any;
  let conversations: { handleWhatsAppInbound: jest.Mock; handleAck: jest.Mock };
  let controller: any;

  beforeEach(() => {
    accounts = {
      findById: jest.fn().mockResolvedValue(account),
      findByPhoneNumberId: jest.fn().mockResolvedValue(account),
    };
    conversations = {
      handleWhatsAppInbound: jest.fn().mockResolvedValue(undefined),
      handleAck: jest.fn(),
    };
    controller = new WhatsAppWebhookController(accounts, conversations as any);
  });

  const received = (): InboundMessage | undefined =>
    conversations.handleWhatsAppInbound.mock.calls[0]?.[1];

  const cloud = (message: Record<string, unknown>) =>
    controller.handleCloud('acc1', {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ profile: { name: 'Ana' } }],
                messages: [{ from: '51999888777', id: 'wamid.1', ...message }],
              },
            },
          ],
        },
      ],
    });

  describe('Cloud API', () => {
    const cloudRaw = (value: Record<string, unknown>) =>
      controller.handleCloud('acc1', {
        entry: [{ changes: [{ value }] }],
      });

    it('un usuario con username sin teléfono llega por su BSUID', async () => {
      await cloudRaw({
        contacts: [
          {
            user_id: 'PE.1502576394655843',
            profile: { username: 'farma.cliente' },
          },
        ],
        messages: [
          {
            from_user_id: 'PE.1502576394655843',
            id: 'wamid.2',
            type: 'text',
            text: { body: 'Hola' },
          },
        ],
      });
      expect(received()).toMatchObject({
        contact: 'PE.1502576394655843',
        chatId: 'PE.1502576394655843',
        contactName: 'farma.cliente',
        text: 'Hola',
      });
    });

    it('si vienen teléfono y BSUID, el contacto sigue siendo el teléfono', async () => {
      await cloudRaw({
        contacts: [{ wa_id: '51999888777', user_id: 'PE.1' }],
        messages: [
          {
            from: '51999888777',
            from_user_id: 'PE.1',
            id: 'wamid.3',
            type: 'text',
            text: { body: 'x' },
          },
        ],
      });
      expect(received()?.contact).toBe('51999888777');
    });

    it('sin ningún identificador del remitente no llega al servicio', async () => {
      await cloudRaw({
        messages: [{ id: 'wamid.4', type: 'text', text: { body: 'x' } }],
      });
      expect(conversations.handleWhatsAppInbound).not.toHaveBeenCalled();
    });

    it('descarta request_welcome y ephemeral', async () => {
      await cloud({ type: 'request_welcome' });
      await cloud({ type: 'ephemeral' });
      expect(conversations.handleWhatsAppInbound).not.toHaveBeenCalled();
    });

    it('descarta la reacción retirada (sin emoji)', async () => {
      await cloud({ type: 'reaction', reaction: { emoji: '' } });
      expect(conversations.handleWhatsAppInbound).not.toHaveBeenCalled();
    });

    it('convierte un pedido del catálogo en texto', async () => {
      await cloud({
        type: 'order',
        order: {
          text: 'Para hoy',
          product_items: [
            {
              product_retailer_id: 'PIZZA',
              quantity: 2,
              item_price: 30,
              currency: 'PEN',
            },
          ],
        },
      });
      expect(received()).toMatchObject({
        type: 'text',
        text: 'Pedido del catálogo (1 producto):\n• 2 × PIZZA (30 PEN)\nPara hoy',
      });
    });

    it('el aviso de sistema llega como texto sin agente', async () => {
      await cloud({
        type: 'system',
        system: { body: 'Ana cambió de número' },
      });
      expect(received()).toMatchObject({
        type: 'text',
        text: 'Aviso de WhatsApp: Ana cambió de número',
        noAgent: true,
      });
    });

    it('un tipo desconocido queda como no soportado con su tipo original', async () => {
      await cloud({
        type: 'unsupported',
        errors: [{ code: 131051, title: 'Message type unknown' }],
      });
      expect(received()).toMatchObject({
        type: 'unsupported',
        rawType: 'unsupported',
      });
    });

    it('guarda qué fue el mensaje no soportado (edición, encuesta…)', async () => {
      await cloud({
        type: 'unsupported',
        errors: [{ code: 131051, title: 'Message type unknown' }],
        unsupported: { type: 'edit' },
      });
      expect(received()).toMatchObject({
        type: 'unsupported',
        rawType: 'unsupported:edit',
      });
    });

    it('un subtipo con caracteres raros no se guarda tal cual', async () => {
      await cloud({
        type: 'unsupported',
        unsupported: { type: '<script>' },
      });
      expect(received()).toMatchObject({ rawType: 'unsupported' });
    });

    it('el contenido no disponible (#131060) se distingue', async () => {
      await cloud({
        type: 'unsupported',
        errors: [{ code: 131060, title: 'Message unavailable' }],
      });
      expect(received()).toMatchObject({ rawType: 'unavailable' });
    });
  });
});
