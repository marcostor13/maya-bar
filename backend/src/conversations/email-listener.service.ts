import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import type { ImapFlow } from 'imapflow';
import type { Subscription } from 'rxjs';
import { EmailAccountsService } from '../email-accounts/email-accounts.service';
import {
  EmailTransportService,
  describe,
  type FetchedRaw,
} from '../email-accounts/email-transport.service';
import type { EmailAccount } from '../email-accounts/email-account.schema';
import { parseEmail } from '../email-accounts/email-message';
import { ConversationsService } from './conversations.service';

/** Arriendo del buzón; se renueva en cada ronda (cada minuto). */
const LEASE_MS = 3 * 60_000;
/** POP3 no avisa de correos nuevos: se consulta con esta frecuencia. */
const POP3_INTERVAL_MS = 2 * 60_000;
/** Esperas antes de reconectar un buzón que falló: 1, 2, 5, 10 minutos. */
const BACKOFF_MS = [60_000, 120_000, 300_000, 600_000];
/** UIDL de POP3 que se recuerdan como máximo. */
const MAX_SEEN_UIDLS = 5000;

interface ImapSession {
  client: ImapFlow;
  /** Serializa las sincronizaciones: un correo nuevo durante otra no se pisa. */
  chain: Promise<void>;
  stopping: boolean;
}

/**
 * Escucha los buzones conectados y pasa cada correo nuevo a la bandeja (y al
 * agente, si el buzón tiene uno publicado).
 *
 * - IMAP: conexión abierta con IDLE, el servidor avisa al instante.
 * - POP3: sondeo cada dos minutos.
 * - Varias réplicas del backend: cada buzón lo escucha solo quien tiene su
 *   arriendo en Mongo; si esa réplica muere, otra lo toma al caducar.
 */
@Injectable()
export class EmailListenerService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(EmailListenerService.name);
  private readonly listenerId = randomUUID();
  private readonly sessions = new Map<string, ImapSession>();
  private readonly lastPoll = new Map<string, number>();
  private readonly failures = new Map<
    string,
    { count: number; retryAt: number }
  >();
  private readonly busy = new Set<string>();
  private subscription?: Subscription;
  private sweeping = false;
  private stopping = false;

  constructor(
    private accounts: EmailAccountsService,
    private transport: EmailTransportService,
    private conversations: ConversationsService,
    private config: ConfigService,
  ) {}

  private get enabled(): boolean {
    return this.config.get<string>('EMAIL_LISTENER_ENABLED') !== 'false';
  }

  onModuleInit() {
    if (!this.enabled) return;
    // Alta, edición o baja de un buzón: se atiende sin esperar a la ronda.
    this.subscription = this.accounts.changes.subscribe((change) => {
      this.failures.delete(change.accountId);
      this.lastPoll.delete(change.accountId);
      void this.stop(change.accountId).then(() => {
        if (!change.removed) void this.sweep();
      });
    });
    setTimeout(() => void this.sweep(), 5_000);
  }

  async onApplicationShutdown() {
    this.stopping = true;
    this.subscription?.unsubscribe();
    await Promise.all([...this.sessions.keys()].map((id) => this.stop(id)));
  }

  @Cron(CronExpression.EVERY_MINUTE)
  tick() {
    if (this.enabled) void this.sweep();
  }

  /** Ronda: toma o renueva arriendos y arranca lo que falte. */
  async sweep(): Promise<void> {
    if (this.sweeping || this.stopping) return;
    this.sweeping = true;
    try {
      const active = await this.accounts.findActive();
      const activeIds = new Set(active.map((a) => String(a._id)));
      for (const id of this.sessions.keys())
        if (!activeIds.has(id)) await this.stop(id);

      for (const account of active) {
        const id = String(account._id);
        const mine = await this.accounts.claimLease(
          id,
          this.listenerId,
          LEASE_MS,
        );
        if (!mine) {
          if (this.sessions.has(id)) await this.stop(id, false);
          continue;
        }
        const failure = this.failures.get(id);
        if (failure && failure.retryAt > Date.now()) continue;

        if (account.incomingProtocol === 'imap') {
          if (!this.sessions.has(id) && !this.busy.has(id))
            void this.startImap(account);
        } else if (
          Date.now() - (this.lastPoll.get(id) ?? 0) >=
          POP3_INTERVAL_MS
        ) {
          void this.pollPop3(account);
        }
      }
    } catch (err) {
      this.logger.error(`Ronda de correo falló: ${String(err)}`);
    } finally {
      this.sweeping = false;
    }
  }

  // ── IMAP ────────────────────────────────────────────────────────────────

  private async startImap(account: EmailAccount): Promise<void> {
    const id = String(account._id);
    this.busy.add(id);
    let session: ImapSession | undefined;
    try {
      await this.transport.assertHost(account.incomingHost ?? '');
      const client = this.transport.createImap(
        await this.accounts.incomingConfig(account),
      );
      session = { client, chain: Promise.resolve(), stopping: false };
      const current = session;
      client.on('exists', () => this.queueSync(id, current));
      client.on('error', (err: Error) =>
        this.logger.warn(`IMAP ${account.email}: ${err.message}`),
      );
      client.on('close', () => {
        if (current.stopping || this.sessions.get(id) !== current) return;
        this.sessions.delete(id);
        // Cortes de red o del servidor: se reconecta en la siguiente ronda.
        this.logger.warn(
          `IMAP ${account.email}: conexión cerrada, se reconectará`,
        );
        void this.accounts.setStatus(id, 'connecting', 'Reconectando…');
      });

      await client.connect();
      this.sessions.set(id, session);
      this.queueSync(id, session);
      await session.chain;
      this.failures.delete(id);
      await this.accounts.setStatus(id, 'connected');
      this.logger.log(`IMAP ${account.email}: escuchando en vivo`);
    } catch (err) {
      if (session) {
        session.stopping = true;
        this.sessions.delete(id);
        await session.client.logout().catch(() => session?.client.close());
      }
      await this.fail(id, account.email, err);
    } finally {
      this.busy.delete(id);
    }
  }

  private queueSync(id: string, session: ImapSession) {
    session.chain = session.chain
      .then(() => this.syncImap(id, session))
      .catch((err: unknown) =>
        this.logger.error(`Sincronización IMAP de ${id} falló: ${String(err)}`),
      );
  }

  private async syncImap(id: string, session: ImapSession): Promise<void> {
    if (session.stopping) return;
    const account = await this.accounts.findById(id);
    if (!account?.active) return;
    const result = await this.transport.fetchImapSince(session.client, {
      uidValidity: account.uidValidity,
      lastUid: account.lastUid,
    });
    if (!result.messages.length) {
      await this.accounts.saveSync(id, {
        uidValidity: result.uidValidity,
        lastUid: result.lastUid,
      });
      return;
    }
    for (const raw of result.messages) {
      await this.deliver(account, raw);
      // El avance se guarda correo a correo: si el proceso cae a mitad, no
      // se reprocesa lo ya ingresado.
      await this.accounts.saveSync(id, {
        uidValidity: result.uidValidity,
        lastUid: Number(raw.id),
      });
    }
  }

  // ── POP3 ────────────────────────────────────────────────────────────────

  private async pollPop3(account: EmailAccount): Promise<void> {
    const id = String(account._id);
    if (this.busy.has(id)) return;
    this.busy.add(id);
    this.lastPoll.set(id, Date.now());
    try {
      const seen = await this.accounts.seenUidls(id);
      const { uidls, messages } = await this.transport.fetchPop3New(
        await this.accounts.incomingConfig(account),
        seen ?? [],
        seen === null,
      );
      const known = new Set(seen ?? uidls);
      for (const raw of messages) {
        await this.deliver(account, raw);
        known.add(raw.id);
      }
      // Solo se recuerdan los que siguen en el servidor y ya se procesaron:
      // los que quedaron fuera por el tope se traen en el siguiente sondeo.
      await this.accounts.saveSync(id, {
        seenUidls: uidls.filter((u) => known.has(u)).slice(-MAX_SEEN_UIDLS),
      });
      this.failures.delete(id);
      await this.accounts.setStatus(id, 'connected');
    } catch (err) {
      await this.fail(id, account.email, err);
    } finally {
      this.busy.delete(id);
    }
  }

  // ── Común ───────────────────────────────────────────────────────────────

  /** Un correo que no se puede leer no frena al resto del buzón. */
  private async deliver(account: EmailAccount, raw: FetchedRaw): Promise<void> {
    try {
      const email = await parseEmail(raw.raw);
      await this.conversations.handleEmailInbound(account, email);
    } catch (err) {
      this.logger.error(
        `Correo ${raw.id} de ${account.email} no se pudo ingresar: ${String(err)}`,
      );
    }
  }

  private async fail(id: string, email: string, err: unknown) {
    const prev = this.failures.get(id)?.count ?? 0;
    const wait = BACKOFF_MS[Math.min(prev, BACKOFF_MS.length - 1)];
    this.failures.set(id, { count: prev + 1, retryAt: Date.now() + wait });
    const message = describe(err);
    this.logger.warn(`Buzón ${email}: ${message}`);
    await this.accounts.setStatus(id, 'error', message).catch(() => undefined);
  }

  private async stop(id: string, release = true): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      session.stopping = true;
      this.sessions.delete(id);
      await session.client.logout().catch(() => session.client.close());
    }
    if (release) await this.accounts.releaseLease(id, this.listenerId);
  }
}
