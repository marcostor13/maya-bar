import {
  createServer as createHttp,
  type Server as HttpServer,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import { EmailTransportService } from './email-transport.service';

function transport(allowPrivate = true) {
  const env: Record<string, string> = allowPrivate
    ? {
        EMAIL_ALLOW_PRIVATE_HOSTS: 'true',
        // El servidor de prueba usa el certificado autofirmado de smtp-server.
        EMAIL_TLS_REJECT_UNAUTHORIZED: 'false',
      }
    : {};
  const config = { get: (k: string) => env[k] };
  return new EmailTransportService(config as never);
}

/** Servidor SMTP real en local: guarda lo recibido para inspeccionarlo. */
async function smtp() {
  const received: {
    from?: string;
    to: string[];
    raw: Buffer;
    user?: string;
  }[] = [];
  const server = new SMTPServer({
    secure: false,
    authOptional: false,
    onAuth(auth, _session, cb) {
      if (auth.username === 'ventas@acme.pe' && auth.password === 'clave')
        return cb(null, { user: auth.username });
      cb(new Error('Credenciales inválidas'));
    },
    onData(stream, session, cb) {
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => {
        received.push({
          from: session.envelope.mailFrom
            ? session.envelope.mailFrom.address
            : undefined,
          to: session.envelope.rcptTo.map((r) => r.address),
          raw: Buffer.concat(chunks),
          user: session.user,
        });
        cb();
      });
    },
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.server.address() as AddressInfo).port;
  return { server, port, received };
}

describe('EmailTransportService', () => {
  it('envía por SMTP con autenticación, hilo y adjunto descargado', async () => {
    const { server, port, received } = await smtp();
    const files: HttpServer = createHttp((_req, res) => {
      res.setHeader('content-type', 'application/pdf');
      res.end('%PDF contenido');
    });
    await new Promise<void>((r) => files.listen(0, '127.0.0.1', r));
    const filesPort = (files.address() as AddressInfo).port;
    try {
      const id = await transport().send(
        {
          host: '127.0.0.1',
          port,
          secure: false,
          auth: { user: 'ventas@acme.pe', pass: 'clave' },
        },
        {
          from: '"Acme Ventas" <ventas@acme.pe>',
          to: 'ana@cliente.pe',
          subject: 'Re: Cotización',
          text: 'Hola Ana',
          html: '<p>Hola Ana</p>',
          inReplyTo: '<abc@cliente.pe>',
          headers: { 'Auto-Submitted': 'auto-replied' },
          references: ['<first@acme.pe>', '<abc@cliente.pe>'],
          attachments: [
            {
              href: `http://127.0.0.1:${filesPort}/propuesta.pdf`,
              filename: 'propuesta.pdf',
              contentType: 'application/pdf',
            },
          ],
        },
      );
      expect(id).toMatch(/^<.+@.+>$/);
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        from: 'ventas@acme.pe',
        to: ['ana@cliente.pe'],
        user: 'ventas@acme.pe',
      });
      const mail = await simpleParser(received[0].raw);
      expect(mail.subject).toBe('Re: Cotización');
      expect(mail.messageId).toBe(id);
      expect(mail.inReplyTo).toBe('<abc@cliente.pe>');
      expect(mail.headers.get('auto-submitted')).toBe('auto-replied');
      expect(mail.references).toEqual(['<first@acme.pe>', '<abc@cliente.pe>']);
      expect(mail.text?.trim()).toBe('Hola Ana');
      expect(mail.attachments[0].filename).toBe('propuesta.pdf');
      expect(mail.attachments[0].content.toString()).toBe('%PDF contenido');
    } finally {
      server.close();
      files.close();
    }
  });

  it('rechaza credenciales SMTP inválidas', async () => {
    const { server, port } = await smtp();
    try {
      await expect(
        transport().send(
          {
            host: '127.0.0.1',
            port,
            secure: false,
            auth: { user: 'ventas@acme.pe', pass: 'mala' },
          },
          {
            from: 'ventas@acme.pe',
            to: 'x@y.pe',
            subject: 's',
            text: 't',
            html: 't',
          },
        ),
      ).rejects.toThrow();
    } finally {
      server.close();
    }
  });

  it('no conecta a hosts internos salvo que se permita explícitamente', async () => {
    await expect(
      transport(false).send(
        {
          host: '127.0.0.1',
          port: 25,
          secure: false,
          auth: { user: 'a', pass: 'b' },
        },
        { from: 'a@b.pe', to: 'c@d.pe', subject: 's', text: 't', html: 't' },
      ),
    ).rejects.toThrow('no es pública');
    await expect(
      transport(false).assertHost('169.254.169.254'),
    ).rejects.toThrow();
    await expect(
      transport(false).assertHost('93.184.216.34'),
    ).resolves.toBeUndefined();
  });

  it('no descarga adjuntos de la red interna aunque el SMTP sea válido', async () => {
    const t = transport(false);
    // El SMTP pasa la comprobación: el fallo debe venir del adjunto.
    jest
      .spyOn(t, 'assertHost')
      .mockImplementation((host: string) =>
        host === '10.0.0.5'
          ? Promise.reject(new Error('La dirección no es pública'))
          : Promise.resolve(),
      );
    await expect(
      t.send(
        {
          host: 'smtp.acme.pe',
          port: 587,
          secure: false,
          auth: { user: 'a', pass: 'b' },
        },
        {
          from: 'a@b.pe',
          to: 'c@d.pe',
          subject: 's',
          text: 't',
          html: 't',
          attachments: [{ href: 'http://10.0.0.5/secreto' }],
        },
      ),
    ).rejects.toThrow('no es pública');
  });

  describe('fetchImapSince', () => {
    function client(
      uidValidity: bigint,
      uidNext: number,
      msgs: { uid: number; source: string }[],
    ) {
      return {
        mailboxOpen: jest.fn().mockResolvedValue({ uidValidity, uidNext }),
        fetch: jest.fn(function* () {
          for (const m of msgs)
            yield { uid: m.uid, source: Buffer.from(m.source) };
        }),
      };
    }

    it('la primera vez marca el punto actual sin importar el histórico', async () => {
      const c = client(7n, 101, []);
      const res = await transport().fetchImapSince(c as never, {});
      expect(res).toEqual({ uidValidity: '7', lastUid: 100, messages: [] });
      expect(c.fetch).not.toHaveBeenCalled();
    });

    it('trae solo los correos posteriores al último UID', async () => {
      // `N:*` devuelve también el último si no hay nuevos: se descarta.
      const c = client(7n, 106, [
        { uid: 100, source: 'viejo' },
        { uid: 104, source: 'a' },
        { uid: 105, source: 'b' },
      ]);
      const res = await transport().fetchImapSince(c as never, {
        uidValidity: '7',
        lastUid: 100,
      });
      expect(c.fetch).toHaveBeenCalledWith(
        '101:*',
        { uid: true, source: true },
        { uid: true },
      );
      expect(res.lastUid).toBe(105);
      expect(res.messages.map((m) => [m.id, m.raw.toString()])).toEqual([
        ['104', 'a'],
        ['105', 'b'],
      ]);
    });

    it('si cambió UIDVALIDITY empieza de nuevo desde el final', async () => {
      const c = client(8n, 50, [{ uid: 10, source: 'x' }]);
      const res = await transport().fetchImapSince(c as never, {
        uidValidity: '7',
        lastUid: 900,
      });
      expect(res).toEqual({ uidValidity: '8', lastUid: 49, messages: [] });
    });

    it('sin correos nuevos no llama a fetch', async () => {
      const c = client(7n, 101, []);
      const res = await transport().fetchImapSince(c as never, {
        uidValidity: '7',
        lastUid: 100,
      });
      expect(res.messages).toEqual([]);
      expect(c.fetch).not.toHaveBeenCalled();
    });
  });
});
