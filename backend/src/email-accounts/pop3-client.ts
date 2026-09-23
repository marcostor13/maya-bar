import { connect as netConnect, Socket } from 'node:net';
import { connect as tlsConnect } from 'node:tls';

export interface Pop3Options {
  host: string;
  port: number;
  /** true = TLS directo (995). false = texto plano (110), solo para pruebas. */
  secure: boolean;
  timeoutMs?: number;
  /** false acepta certificados autofirmados. */
  rejectUnauthorized?: boolean;
}

/**
 * Cliente POP3 mínimo (RFC 1939): lo justo para listar por UIDL y descargar.
 * POP3 no tiene notificaciones, así que el buzón se sondea periódicamente y
 * se comparan los UIDL con los ya vistos.
 */
export class Pop3Client {
  private socket?: Socket;
  private buffer = Buffer.alloc(0);
  private waiter?: {
    multiline: boolean;
    resolve: (b: Buffer) => void;
    reject: (e: Error) => void;
  };

  constructor(private readonly opts: Pop3Options) {}

  async connect(): Promise<void> {
    const { host, port, secure } = this.opts;
    const timeout = this.opts.timeoutMs ?? 30_000;
    await new Promise<void>((resolve, reject) => {
      const socket = secure
        ? tlsConnect(
            {
              host,
              port,
              servername: host,
              rejectUnauthorized: this.opts.rejectUnauthorized ?? true,
            },
            () => resolve(),
          )
        : netConnect({ host, port }, () => resolve());
      socket.setTimeout(timeout, () =>
        socket.destroy(new Error('POP3: tiempo de espera agotado')),
      );
      socket.once('error', reject);
      socket.on('data', (chunk: Buffer) => this.onData(chunk));
      socket.on('error', (err) => this.fail(err));
      socket.on('close', () => this.fail(new Error('POP3: conexión cerrada')));
      this.socket = socket;
    });
    await this.read(false); // saludo del servidor
  }

  async login(user: string, pass: string): Promise<void> {
    await this.command(`USER ${user}`);
    await this.command(`PASS ${pass}`);
  }

  /** Número de mensaje → UIDL (identificador estable entre sesiones). */
  async uidl(): Promise<Map<number, string>> {
    const body = (await this.command('UIDL', true)).toString('utf8');
    const out = new Map<number, string>();
    for (const line of body.split('\r\n')) {
      const [num, uid] = line.trim().split(/\s+/);
      if (num && uid) out.set(Number(num), uid);
    }
    return out;
  }

  /** Mensaje completo en RFC 822, sin el relleno de puntos del protocolo. */
  retr(num: number): Promise<Buffer> {
    return this.command(`RETR ${num}`, true);
  }

  async quit(): Promise<void> {
    try {
      await this.command('QUIT');
    } catch {
      /* el servidor puede cerrar sin responder */
    }
    this.socket?.destroy();
  }

  private command(line: string, multiline = false): Promise<Buffer> {
    if (!this.socket) return Promise.reject(new Error('POP3: sin conexión'));
    const reply = this.read(multiline);
    this.socket.write(`${line}\r\n`);
    return reply;
  }

  private read(multiline: boolean): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.waiter = { multiline, resolve, reject };
      this.flush();
    });
  }

  private onData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.flush();
  }

  private fail(err: Error) {
    const w = this.waiter;
    this.waiter = undefined;
    w?.reject(err);
  }

  /** Resuelve la respuesta en curso si ya llegó completa. */
  private flush() {
    const w = this.waiter;
    if (!w) return;
    const eol = this.buffer.indexOf('\r\n');
    if (eol < 0) return;
    const status = this.buffer.subarray(0, eol).toString('utf8');
    if (status.startsWith('-ERR')) {
      this.buffer = this.buffer.subarray(eol + 2);
      this.waiter = undefined;
      // La respuesta del servidor puede repetir el usuario, nunca la contraseña.
      w.reject(new Error(`POP3: ${status.slice(4).trim() || 'error'}`));
      return;
    }
    if (!status.startsWith('+OK')) return;
    if (!w.multiline) {
      this.buffer = this.buffer.subarray(eol + 2);
      this.waiter = undefined;
      w.resolve(Buffer.from(status));
      return;
    }
    // Multilínea: termina en una línea con un solo punto.
    const start = eol + 2;
    const end =
      this.buffer.subarray(start, start + 3).toString() === '.\r\n'
        ? start
        : this.buffer.indexOf('\r\n.\r\n', start - 2);
    if (end < 0) return;
    const bodyEnd = end === start ? start : end + 2;
    const body = this.buffer.subarray(start, bodyEnd);
    this.buffer = this.buffer.subarray(end === start ? start + 3 : end + 5);
    this.waiter = undefined;
    w.resolve(unstuff(body));
  }
}

/** Quita el punto que POP3 antepone a las líneas que empiezan por punto. */
export function unstuff(body: Buffer): Buffer {
  const text = body.toString('latin1').replace(/(^|\r\n)\.\./g, '$1.');
  return Buffer.from(text, 'latin1');
}
