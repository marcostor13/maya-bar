import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CalendarService } from './calendar.service';
import { SecretBox } from '../shared/secret-box';

const TENANT = new Types.ObjectId().toString();
const box = new SecretBox('jwt');
const HOUR = 3600_000;

type Doc = Record<string, unknown> & { _id: Types.ObjectId };

/** Consulta encadenable de Mongoose: `.select()` y `.sort()` devuelven la misma. */
function query<T>(value: T) {
  const q = {
    select: () => q,
    sort: () => q,
    exec: () => Promise.resolve(value),
  };
  return q;
}

function setup(docs: Doc[] = []) {
  const matches = (d: Doc, f: Record<string, unknown>) =>
    Object.entries(f).every(([k, v]) => String(d[k]) === String(v));
  const model = {
    find: jest.fn((f: Record<string, unknown>) =>
      query(docs.filter((d) => matches(d, f))),
    ),
    findOne: jest.fn((f: Record<string, unknown>) =>
      query(docs.find((d) => matches(d, f)) ?? null),
    ),
    exists: jest.fn((f: Record<string, unknown>) =>
      Promise.resolve(docs.some((d) => matches(d, f)) ? { _id: 1 } : null),
    ),
    create: jest.fn((doc: Record<string, unknown>) => {
      const d = { ...doc, _id: new Types.ObjectId() };
      docs.push(d);
      return Promise.resolve(d);
    }),
    updateOne: jest.fn(
      (f: { _id: Types.ObjectId }, u: { $set: Record<string, unknown> }) => {
        const d = docs.find((x) => String(x._id) === String(f._id));
        if (d) Object.assign(d, u.$set);
        return query({ matchedCount: d ? 1 : 0 });
      },
    ),
    updateMany: jest.fn(() => query({})),
    deleteOne: jest.fn(() => query({})),
  };
  const oauth = {
    refresh: jest.fn(),
    available: () => ({ google: true, microsoft: false }),
  };
  const config = { get: () => undefined, getOrThrow: () => 'jwt' };
  const service = new CalendarService(
    model as never,
    oauth as never,
    config as never,
  );
  return { service, model, oauth, docs };
}

function connection(over: Partial<Doc> = {}): Doc {
  return {
    _id: new Types.ObjectId(),
    tenantId: new Types.ObjectId(TENANT),
    provider: 'google',
    email: 'agenda@acme.pe',
    isDefault: true,
    accessTokenEnc: box.encrypt('access-ok'),
    refreshTokenEnc: box.encrypt('refresh-ok'),
    expiresAt: new Date(Date.now() + HOUR),
    ...over,
  };
}

function mockFetch(...responses: { status?: number; body: unknown }[]) {
  const fn = jest.fn();
  for (const r of responses)
    fn.mockResolvedValueOnce({
      status: r.status ?? 200,
      ok: (r.status ?? 200) < 400,
      json: () => Promise.resolve(r.body),
    });
  global.fetch = fn as never;
  return fn;
}

const call = (fn: jest.Mock, i = 0) => {
  const [url, init] = fn.mock.calls[i] as [
    string,
    { headers: Record<string, string>; body: string },
  ];
  return {
    url,
    auth: init.headers.Authorization,
    body: JSON.parse(init.body) as Record<string, any>,
  };
};

const event = {
  title: 'Demo con Acme',
  description: 'Presentación del producto',
  start: '2026-10-01T15:00:00-05:00',
  durationMinutes: 30,
  attendees: ['Cliente@Acme.PE', 'cliente@acme.pe'],
};

describe('CalendarService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('crea el evento en Google con Meet y devuelve el enlace', async () => {
    const { service } = setup([connection()]);
    const fetch = mockFetch({
      body: {
        id: 'g-1',
        htmlLink: 'https://calendar.google.com/event?eid=1',
        hangoutLink: 'https://meet.google.com/abc-defg-hij',
      },
    });

    const res = await service.createEvent(TENANT, {
      ...event,
      timeZone: 'America/Lima',
    });

    const { url, auth, body } = call(fetch);
    expect(url).toBe(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
    );
    expect(auth).toBe('Bearer access-ok');
    expect(body).toMatchObject({
      summary: 'Demo con Acme',
      description: 'Presentación del producto',
      start: { dateTime: '2026-10-01T20:00:00.000Z', timeZone: 'America/Lima' },
      end: { dateTime: '2026-10-01T20:30:00.000Z', timeZone: 'America/Lima' },
      attendees: [{ email: 'cliente@acme.pe' }],
      conferenceData: {
        createRequest: { conferenceSolutionKey: { type: 'hangoutsMeet' } },
      },
    });
    expect(body.conferenceData.createRequest.requestId).toEqual(
      expect.any(String),
    );
    expect(res).toEqual({
      provider: 'google',
      eventId: 'g-1',
      htmlLink: 'https://calendar.google.com/event?eid=1',
      joinUrl: 'https://meet.google.com/abc-defg-hij',
      start: '2026-10-01T20:00:00.000Z',
      end: '2026-10-01T20:30:00.000Z',
      connectionEmail: 'agenda@acme.pe',
    });
  });

  it('crea el evento en Microsoft Graph con Teams', async () => {
    const { service } = setup([
      connection({ provider: 'microsoft', email: 'ventas@acme.com' }),
    ]);
    const fetch = mockFetch({
      status: 201,
      body: {
        id: 'ms-1',
        webLink: 'https://outlook.office365.com/owa/?itemid=1',
        onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup/1' },
      },
    });

    const res = await service.createEvent(TENANT, event);

    const { url, body } = call(fetch);
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/events');
    expect(body).toEqual({
      subject: 'Demo con Acme',
      body: { contentType: 'text', content: 'Presentación del producto' },
      start: { dateTime: '2026-10-01T20:00:00.000', timeZone: 'UTC' },
      end: { dateTime: '2026-10-01T20:30:00.000', timeZone: 'UTC' },
      attendees: [
        { emailAddress: { address: 'cliente@acme.pe' }, type: 'required' },
      ],
      isOnlineMeeting: true,
      onlineMeetingProvider: 'teamsForBusiness',
    });
    expect(res).toMatchObject({
      provider: 'microsoft',
      eventId: 'ms-1',
      joinUrl: 'https://teams.microsoft.com/l/meetup/1',
      connectionEmail: 'ventas@acme.com',
    });
  });

  it('sin connectionId usa la conexión predeterminada', async () => {
    const { service } = setup([
      connection({ isDefault: false, email: 'otra@acme.pe' }),
      connection({ provider: 'microsoft', email: 'default@acme.com' }),
    ]);
    const fetch = mockFetch({ body: { id: 'ms-2' } });

    const res = await service.createEvent(TENANT, event);

    expect(call(fetch).url).toContain('graph.microsoft.com');
    expect(res.connectionEmail).toBe('default@acme.com');
  });

  it('con connectionId usa esa conexión', async () => {
    const other = connection({ isDefault: false, email: 'otra@acme.pe' });
    const { service } = setup([
      connection({ provider: 'microsoft', email: 'default@acme.com' }),
      other,
    ]);
    mockFetch({ body: { id: 'g-2' } });

    const res = await service.createEvent(TENANT, {
      ...event,
      connectionId: String(other._id),
    });
    expect(res.connectionEmail).toBe('otra@acme.pe');
  });

  it('renueva el token vencido antes de crear el evento y lo guarda', async () => {
    const conn = connection({ expiresAt: new Date(Date.now() - 1000) });
    const { service, oauth, docs } = setup([conn]);
    oauth.refresh.mockResolvedValue({
      accessToken: 'access-nuevo',
      expiresAt: new Date(Date.now() + HOUR),
    });
    const fetch = mockFetch({ body: { id: 'g-3' } });

    await service.createEvent(TENANT, event);

    expect(oauth.refresh).toHaveBeenCalledWith('google', 'refresh-ok');
    expect(call(fetch).auth).toBe('Bearer access-nuevo');
    expect(box.decrypt(docs[0].accessTokenEnc as string)).toBe('access-nuevo');
    expect(box.decrypt(docs[0].refreshTokenEnc as string)).toBe('refresh-ok');
  });

  it('si el proveedor responde 401 renueva y reintenta una vez', async () => {
    const { service, oauth } = setup([connection()]);
    oauth.refresh.mockResolvedValue({
      accessToken: 'access-nuevo',
      refreshToken: 'refresh-rotado',
      expiresAt: new Date(Date.now() + HOUR),
    });
    const fetch = mockFetch(
      { status: 401, body: { error: { message: 'Invalid Credentials' } } },
      { body: { id: 'g-4' } },
    );

    const res = await service.createEvent(TENANT, event);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(call(fetch, 1).auth).toBe('Bearer access-nuevo');
    expect(res.eventId).toBe('g-4');
  });

  it('pide reconectar si no se puede renovar el token', async () => {
    const { service, oauth } = setup([
      connection({ expiresAt: new Date(Date.now() - 1000) }),
    ]);
    oauth.refresh.mockRejectedValue(new Error('invalid_grant'));
    const fetch = mockFetch();

    const err = await service.createEvent(TENANT, event).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toMatch(/Vuelve a conectarla/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sin calendarios conectados responde 400 con un mensaje claro', async () => {
    const { service } = setup([]);
    const err = await service.createEvent(TENANT, event).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toMatch(
      /No hay ningún calendario conectado/,
    );
  });

  it('la primera conexión queda como predeterminada y nunca expone tokens', async () => {
    const { service, docs } = setup([]);
    const first = await service.upsertFromOAuth(TENANT, 'google', {
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: new Date(),
      email: 'agenda@acme.pe',
    });
    const second = await service.upsertFromOAuth(TENANT, 'microsoft', {
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: new Date(),
      email: 'ventas@acme.com',
    });
    expect(first.isDefault).toBe(true);
    expect(second.isDefault).toBe(false);
    expect(docs[0].accessTokenEnc).not.toBe('a');

    const list = await service.list(TENANT);
    expect(list.available).toEqual({ google: true, microsoft: false });
    expect(Object.keys(list.connections[0]).sort()).toEqual(
      ['_id', 'email', 'isDefault', 'name', 'provider'].sort(),
    );
  });
});
