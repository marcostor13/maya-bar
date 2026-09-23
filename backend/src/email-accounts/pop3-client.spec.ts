import { createServer, type Server, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import { Pop3Client, unstuff } from './pop3-client';

/** Servidor POP3 mínimo: responde en trozos pequeños para forzar el reensamblado. */
function fakePop3(messages: Record<string, string>, password = 'secreto') {
  const ids = Object.keys(messages);
  const server: Server = createServer((socket: Socket) => {
    const send = (text: string) => {
      // Se parte la respuesta para probar que el cliente acumula bien.
      for (let i = 0; i < text.length; i += 7)
        socket.write(text.slice(i, i + 7));
    };
    send('+OK POP3 listo\r\n');
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      let idx: number;
      while ((idx = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const [cmd, arg] = line.split(' ');
        if (cmd === 'USER') send('+OK\r\n');
        else if (cmd === 'PASS')
          send(
            arg === password
              ? '+OK dentro\r\n'
              : '-ERR [AUTH] contraseña incorrecta\r\n',
          );
        else if (cmd === 'UIDL')
          send(
            `+OK\r\n${ids.map((id, i) => `${i + 1} ${id}`).join('\r\n')}${ids.length ? '\r\n' : ''}.\r\n`,
          );
        else if (cmd === 'RETR') {
          const body = messages[ids[Number(arg) - 1]]
            .split('\r\n')
            .map((l) => (l.startsWith('.') ? `.${l}` : l))
            .join('\r\n');
          send(`+OK\r\n${body}\r\n.\r\n`);
        } else if (cmd === 'QUIT') {
          send('+OK adiós\r\n');
          socket.end();
        } else send('-ERR comando desconocido\r\n');
      }
    });
  });
  return new Promise<{ server: Server; port: number }>((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, port: (server.address() as AddressInfo).port }),
    ),
  );
}

describe('Pop3Client', () => {
  it('inicia sesión, lista por UIDL y descarga quitando el relleno de puntos', async () => {
    const raw =
      'Subject: Hola\r\n\r\nLínea 1\r\n.linea que empieza por punto\r\nfin';
    const { server, port } = await fakePop3({
      'uid-a': raw,
      'uid-b': 'Subject: B\r\n\r\nb',
    });
    const pop = new Pop3Client({ host: '127.0.0.1', port, secure: false });
    try {
      await pop.connect();
      await pop.login('ana@acme.pe', 'secreto');
      const uidl = await pop.uidl();
      expect([...uidl.entries()]).toEqual([
        [1, 'uid-a'],
        [2, 'uid-b'],
      ]);
      const msg = await pop.retr(1);
      expect(msg.toString('utf8')).toBe(`${raw}\r\n`);
      await pop.quit();
    } finally {
      server.close();
    }
  });

  it('lista un buzón vacío', async () => {
    const { server, port } = await fakePop3({});
    const pop = new Pop3Client({ host: '127.0.0.1', port, secure: false });
    try {
      await pop.connect();
      await pop.login('ana', 'secreto');
      expect((await pop.uidl()).size).toBe(0);
      await pop.quit();
    } finally {
      server.close();
    }
  });

  it('rechaza una contraseña incorrecta con el mensaje del servidor', async () => {
    const { server, port } = await fakePop3({});
    const pop = new Pop3Client({ host: '127.0.0.1', port, secure: false });
    try {
      await pop.connect();
      await expect(pop.login('ana', 'mala')).rejects.toThrow(
        'POP3: [AUTH] contraseña incorrecta',
      );
      await pop.quit();
    } finally {
      server.close();
    }
  });

  it('falla limpio si no hay servidor', async () => {
    const pop = new Pop3Client({
      host: '127.0.0.1',
      port: 1,
      secure: false,
      timeoutMs: 2000,
    });
    await expect(pop.connect()).rejects.toThrow();
  });

  it('unstuff solo quita el punto inicial de cada línea', () => {
    expect(unstuff(Buffer.from('..a\r\nb..\r\n..c')).toString()).toBe(
      '.a\r\nb..\r\n.c',
    );
  });
});

describe('EmailTransportService.fetchPop3New', () => {
  const { EmailTransportService } = jest.requireActual<
    typeof import('./email-transport.service')
  >('./email-transport.service');
  const transport = new EmailTransportService({
    get: (k: string) =>
      k === 'EMAIL_ALLOW_PRIVATE_HOSTS' ? 'true' : undefined,
  } as never);

  it('la primera vez solo memoriza; después trae únicamente lo nuevo', async () => {
    const { server, port } = await fakePop3({
      'uid-a': 'Subject: A\r\n\r\na',
      'uid-b': 'Subject: B\r\n\r\nb',
    });
    const cfg = {
      protocol: 'pop3' as const,
      host: '127.0.0.1',
      port,
      secure: false,
      auth: { user: 'ana', pass: 'secreto' },
    };
    try {
      const first = await transport.fetchPop3New(cfg, [], true);
      expect(first).toEqual({ uidls: ['uid-a', 'uid-b'], messages: [] });

      const next = await transport.fetchPop3New(cfg, ['uid-a'], false);
      expect(next.messages.map((m) => [m.id, m.raw.toString()])).toEqual([
        ['uid-b', 'Subject: B\r\n\r\nb\r\n'],
      ]);
    } finally {
      server.close();
    }
  });

  it('POP3 no acepta tokens de OAuth', async () => {
    await expect(
      transport.fetchPop3New(
        {
          protocol: 'pop3',
          host: '127.0.0.1',
          port: 1,
          secure: false,
          auth: { user: 'a', accessToken: 't' },
        },
        [],
        false,
      ),
    ).rejects.toThrow('POP3 solo admite usuario y contraseña');
  });
});
