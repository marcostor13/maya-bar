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

  const waha = (payload: Record<string, unknown>) =>
    controller.handleWaha('acc1', {
      event: 'message',
      payload: { id: 'w1', from: '51999888777@c.us', ...payload },
    });

  describe('Cloud API', () => {
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
  });

  describe('WAHA', () => {
    it('descarta borrados y avisos internos', async () => {
      for (const type of ['revoked', 'e2e_notification', 'call_log', 'gp2'])
        await waha({ type, body: '' });
      expect(conversations.handleWhatsAppInbound).not.toHaveBeenCalled();
    });

    it('un adjunto sin URL se guarda como su tipo, marcado sin archivo', async () => {
      await waha({ type: 'image', hasMedia: true, body: '', media: null });
      expect(received()).toMatchObject({
        type: 'image',
        mediaUnavailable: true,
      });
      expect(received()?.media).toBeUndefined();
    });

    it('una encuesta llega como texto con sus opciones', async () => {
      await waha({
        type: 'poll_creation',
        body: '',
        _data: {
          pollName: '¿Mesa o barra?',
          pollOptions: [{ name: 'Mesa' }, { name: 'Barra' }],
        },
      });
      expect(received()).toMatchObject({
        type: 'text',
        text: 'Encuesta: ¿Mesa o barra?\n• Mesa\n• Barra',
      });
    });

    it('lo que no se reconoce queda como no soportado con su tipo', async () => {
      await waha({ type: 'ciphertext', body: '' });
      expect(received()).toMatchObject({
        type: 'unsupported',
        rawType: 'ciphertext',
      });
    });

    describe('NOWEB / GOWS (sin `type`, mensaje en _data.message)', () => {
      const noweb = (message: Record<string, unknown>, extra = {}) =>
        waha({ body: '', _data: { message }, ...extra });

      it('descarta borrados, ediciones, votos y solo metadatos', async () => {
        await noweb({ protocolMessage: { type: 0 } });
        await noweb({ editedMessage: { message: {} } });
        await noweb({ pollUpdateMessage: {} });
        await noweb({
          senderKeyDistributionMessage: {},
          messageContextInfo: {},
        });
        expect(conversations.handleWhatsAppInbound).not.toHaveBeenCalled();
      });

      it('una reacción llega como su emoji y la retirada se descarta', async () => {
        await noweb({ reactionMessage: { text: '' } });
        expect(conversations.handleWhatsAppInbound).not.toHaveBeenCalled();
        await noweb({ reactionMessage: { text: '👍' } });
        expect(received()).toMatchObject({ type: 'text', text: '👍' });
      });

      it('una encuesta llega como texto', async () => {
        await noweb({
          messageContextInfo: {},
          pollCreationMessageV3: {
            name: '¿Hora?',
            options: [{ optionName: '20:00' }, { optionName: '21:00' }],
          },
        });
        expect(received()).toMatchObject({
          type: 'text',
          text: 'Encuesta: ¿Hora?\n• 20:00\n• 21:00',
        });
      });

      it('"ver una vez" llega como adjunto sin archivo', async () => {
        await noweb({
          viewOnceMessageV2: { message: { videoMessage: {} } },
        });
        expect(received()).toMatchObject({
          type: 'video',
          mediaUnavailable: true,
        });
      });

      it('un texto dentro de un mensaje temporal pasa normal', async () => {
        await noweb(
          { ephemeralMessage: { message: { conversation: 'hola' } } },
          { body: 'hola' },
        );
        expect(received()).toMatchObject({ type: 'text', text: 'hola' });
      });

      it('lo desconocido queda como no soportado con su clave', async () => {
        await noweb({ eventMessage: { name: 'Fiesta' } });
        expect(received()).toMatchObject({
          type: 'unsupported',
          rawType: 'eventMessage',
        });
      });
    });

    it('un texto normal pasa igual que antes', async () => {
      await waha({ type: 'chat', body: 'hola' });
      expect(received()).toMatchObject({ type: 'text', text: 'hola' });
    });
  });
});
