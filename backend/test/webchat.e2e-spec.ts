import type { NestExpressApplication } from '@nestjs/platform-express';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import http from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { bearer, createApp, registerTenant, type Session } from './support/app';
import { Customer } from '../src/customers/customer.schema';
import { Conversation } from '../src/conversations/conversation.schema';

const SITE = 'https://www.tienda-andina.pe';
type Sess = {
  visitorId: string;
  token: string;
  identified: boolean;
  config: { title: string; color: string };
};
type Conv = {
  _id: string;
  channel: string;
  contact: string;
  customerId?: string;
};

/** Abre el SSE del visitante y junta lo que llega. */
function openStream(port: number, path: string) {
  const events: { at: number; data: { text: string; direction: string } }[] =
    [];
  let buf = '';
  const req = http.get({
    host: '127.0.0.1',
    port,
    path,
    headers: { Origin: SITE },
  });
  const ready = new Promise<number>((resolve) =>
    req.on('response', (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buf += chunk;
        let i: number;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const line = block.split('\n').find((l) => l.startsWith('data: '));
          if (line)
            events.push({
              at: Date.now(),
              data: JSON.parse(line.slice(6)) as {
                text: string;
                direction: string;
              },
            });
        }
      });
      resolve(res.statusCode ?? 0);
    }),
  );
  return { events, ready, close: () => req.destroy() };
}

describe('Chat web en el sitio de la empresa (HU69, e2e)', () => {
  let app: NestExpressApplication;
  let owner: Session;
  let other: Session;
  let key: string;
  let port: number;
  const api = () => request(app.getHttpServer());
  const session = (origin: string | null, visitorId?: string) => {
    const r = api()
      .post(`/public/webchat/${key}/session`)
      .send(visitorId ? { visitorId } : {});
    return origin ? r.set('Origin', origin) : r;
  };

  beforeAll(async () => {
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;
    owner = await registerTenant(app, 'Tienda Andina');
    other = await registerTenant(app, 'Otra');
    const w = await api().get('/webchat/widget').set(bearer(owner)).expect(200);
    key = (w.body as { key: string }).key;
    expect((w.body as { snippet: string }).snippet).toContain(
      `data-key="${key}"`,
    );
    // Sin dominios no se puede activar.
    await api()
      .put('/webchat/widget')
      .set(bearer(owner))
      .send({ active: true })
      .expect(400);
    await api()
      .put('/webchat/widget')
      .set(bearer(owner))
      .send({
        active: true,
        allowedDomains: ['https://tienda-andina.pe/'],
        color: '#E11D48',
        title: 'Hablemos',
      })
      .expect(200);
  });
  afterAll(async () => {
    // El SSE deja conexiones keep-alive: se cortan para que Jest termine.
    app.getHttpServer().closeAllConnections();
    await app.close();
  });

  it('C2: el widget no carga en un dominio que no está en la lista', async () => {
    const js = await api().get('/public/webchat/widget.js').expect(200);
    expect(js.headers['content-type']).toContain('javascript');
    expect(js.text).toContain('/session');

    await session('https://sitio-ajeno.com').expect(403);
    await session(null).expect(403);
    // El subdominio www del dominio permitido sí carga.
    const ok = await session(SITE).expect(201);
    expect((ok.body as Sess).config).toMatchObject({
      title: 'Hablemos',
      color: '#E11D48',
    });
    // Preflight CORS desde el sitio del cliente.
    const pre = await api()
      .options(`/public/webchat/${key}/session`)
      .set('Origin', SITE)
      .set('Access-Control-Request-Method', 'POST');
    expect(pre.headers['access-control-allow-origin']).toBe(SITE);
    // Apagado, no carga en ningún lado.
    await api()
      .put('/webchat/widget')
      .set(bearer(owner))
      .send({ active: false })
      .expect(200);
    await session(SITE).expect(404);
    await api()
      .put('/webchat/widget')
      .set(bearer(owner))
      .send({ active: true })
      .expect(200);
    // Otra empresa no ve ni toca este widget.
    const theirs = await api()
      .get('/webchat/widget')
      .set(bearer(other))
      .expect(200);
    expect((theirs.body as { key: string }).key).not.toBe(key);
  });

  it('C1: el mensaje del widget llega a la bandeja y la respuesta llega al widget en menos de 2 s', async () => {
    const s = (await session(SITE).expect(201)).body as Sess;
    const stream = openStream(
      port,
      `/public/webchat/${key}/stream?token=${encodeURIComponent(s.token)}`,
    );
    expect(await stream.ready).toBe(200);

    await api()
      .post(`/public/webchat/${key}/messages`)
      .set('Origin', SITE)
      .send({ token: s.token, text: '¿Tienen envío a Arequipa?' })
      .expect(201);

    const accounts = await api()
      .get('/conversations/accounts')
      .set(bearer(owner))
      .expect(200);
    expect(
      (accounts.body as { channel: string }[]).some((a) => a.channel === 'web'),
    ).toBe(true);
    const list = await api()
      .get('/conversations?channel=web')
      .set(bearer(owner))
      .expect(200);
    const rows = (
      Array.isArray(list.body)
        ? list.body
        : (list.body as { items: Conv[] }).items
    ) as Conv[];
    const conv = rows.find((c) => c.contact === s.visitorId)!;
    expect(conv).toMatchObject({ channel: 'web' });
    const msgs = await api()
      .get(`/conversations/${conv._id}/messages`)
      .set(bearer(owner))
      .expect(200);
    expect(JSON.stringify(msgs.body)).toContain('¿Tienen envío a Arequipa?');

    const sentAt = Date.now();
    await api()
      .post(`/conversations/${conv._id}/messages`)
      .set(bearer(owner))
      .send({ text: 'Sí, llegamos en 48 h' })
      .expect(201);
    for (
      let i = 0;
      i < 40 &&
      !stream.events.some((e) => e.data.text === 'Sí, llegamos en 48 h');
      i++
    )
      await new Promise((r) => setTimeout(r, 50));
    const got = stream.events.find(
      (e) => e.data.text === 'Sí, llegamos en 48 h',
    );
    stream.close();
    expect(got).toBeDefined();
    expect(got!.data.direction).toBe('out');
    expect(got!.at - sentAt).toBeLessThan(2000);

    // Al reconectar, el historial trae la conversación completa.
    const hist = await api()
      .get(
        `/public/webchat/${key}/messages?token=${encodeURIComponent(s.token)}`,
      )
      .set('Origin', SITE)
      .expect(200);
    expect((hist.body as { text: string }[]).map((m) => m.text)).toEqual([
      '¿Tienen envío a Arequipa?',
      'Sí, llegamos en 48 h',
    ]);
  });

  it('identifica al visitante, lo fusiona con el contacto existente y rechaza tokens alterados', async () => {
    const customers = app.get<Model<Customer>>(getModelToken(Customer.name));
    const existing = await customers.create({
      tenantId: new Types.ObjectId(owner.user.tenantId!),
      name: 'Rosa Quispe',
      email: 'rosa@correo.pe',
      tags: [],
      source: 'manual',
    });
    const s = (await session(SITE).expect(201)).body as Sess;
    await api()
      .post(`/public/webchat/${key}/contact`)
      .set('Origin', SITE)
      .send({ token: s.token, name: 'Rosa' })
      .expect(400);
    await api()
      .post(`/public/webchat/${key}/contact`)
      .set('Origin', SITE)
      .send({ token: s.token, name: 'Rosa', email: 'ROSA@correo.pe' })
      .expect(201);
    const conv = await app
      .get<Model<Conversation>>(getModelToken(Conversation.name))
      .findOne({ channel: 'web', contact: s.visitorId })
      .lean<Conversation>()
      .exec();
    expect(String(conv!.customerId)).toBe(String(existing._id));
    expect(
      ((await session(SITE, s.visitorId).expect(201)).body as Sess).identified,
    ).toBe(true);

    const forged = `${s.visitorId}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    await api()
      .post(`/public/webchat/${key}/messages`)
      .set('Origin', SITE)
      .send({ token: forged, text: 'hola' })
      .expect(403);
    // La trampa para bots: responde ok pero no guarda nada.
    const bot = (await session(SITE).expect(201)).body as Sess;
    await api()
      .post(`/public/webchat/${key}/messages`)
      .set('Origin', SITE)
      .send({ token: bot.token, text: 'compra ya', website: 'http://spam' })
      .expect(201);
    expect(
      await app
        .get<Model<Conversation>>(getModelToken(Conversation.name))
        .exists({ contact: bot.visitorId }),
    ).toBeNull();
  });
});
