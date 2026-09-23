import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Subject } from 'rxjs';
import { SecretBox } from '../shared/secret-box';
import {
  EmailAccount,
  type EmailConnectionStatus,
  type EmailProvider,
} from './email-account.schema';
import {
  CreateEmailAccountDto,
  UpdateEmailAccountDto,
} from './dto/email-account.dto';
import {
  EmailOAuthService,
  type OAuthProvider,
  type OAuthTokens,
} from './email-oauth.service';
import {
  EmailTransportService,
  type IncomingConfig,
  type MailAuth,
  type SmtpConfig,
} from './email-transport.service';

/** Servidores de Gmail y Outlook: el usuario no tiene que saberlos. */
const OAUTH_SERVERS: Record<
  OAuthProvider,
  Pick<
    EmailAccount,
    | 'incomingHost'
    | 'incomingPort'
    | 'incomingSecure'
    | 'smtpHost'
    | 'smtpPort'
    | 'smtpSecure'
  >
> = {
  gmail: {
    incomingHost: 'imap.gmail.com',
    incomingPort: 993,
    incomingSecure: true,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecure: true,
  },
  outlook: {
    incomingHost: 'outlook.office365.com',
    incomingPort: 993,
    incomingSecure: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false,
  },
};

const SECRET_FIELDS = '+passwordEnc +refreshTokenEnc +accessTokenEnc';
/** Margen antes de que caduque el access token para pedir otro. */
const TOKEN_MARGIN_MS = 2 * 60_000;

/** Evento para que el escucha conecte o suelte un buzón sin esperar su ronda. */
export interface EmailAccountChange {
  accountId: string;
  removed?: boolean;
}

@Injectable()
export class EmailAccountsService {
  private readonly logger = new Logger(EmailAccountsService.name);
  private readonly box: SecretBox;
  readonly changes = new Subject<EmailAccountChange>();

  constructor(
    @InjectModel(EmailAccount.name) private model: Model<EmailAccount>,
    private transport: EmailTransportService,
    private oauth: EmailOAuthService,
    config: ConfigService,
  ) {
    this.box = new SecretBox(
      config.get<string>('EMAIL_ENCRYPTION_KEY') ||
        config.getOrThrow<string>('JWT_SECRET'),
    );
  }

  private oid(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('Identificador inválido');
    return new Types.ObjectId(id);
  }

  // ── Consulta ────────────────────────────────────────────────────────────

  findAll(tenantId: string) {
    return this.model
      .find({ tenantId: this.oid(tenantId) })
      .sort({ createdAt: 1 })
      .exec();
  }

  async findOne(id: string, tenantId: string): Promise<EmailAccount> {
    const doc = await this.model
      .findOne({ _id: this.oid(id), tenantId: this.oid(tenantId) })
      .exec();
    if (!doc) throw new NotFoundException('Cuenta de correo no encontrada');
    return doc;
  }

  /** Uso interno (envío, escucha): incluye las credenciales cifradas. */
  findById(id: string) {
    return this.model.findById(this.oid(id)).select(SECRET_FIELDS).exec();
  }

  findActive() {
    return this.model.find({ active: true }).select(SECRET_FIELDS).exec();
  }

  // ── Alta y edición ──────────────────────────────────────────────────────

  /** Alta manual: se prueba la conexión antes de guardar nada. */
  async createCustom(
    tenantId: string,
    dto: CreateEmailAccountDto,
  ): Promise<EmailAccount> {
    const tid = this.oid(tenantId);
    const email = dto.email.toLowerCase().trim();
    if (await this.model.exists({ tenantId: tid, email }))
      throw new ConflictException('Ese buzón ya está conectado');

    const username = dto.username?.trim() || email;
    const auth: MailAuth = { user: username, pass: dto.password };
    await this.testOrThrow(
      {
        protocol: dto.incomingProtocol,
        host: dto.incomingHost,
        port: dto.incomingPort,
        secure: dto.incomingSecure,
        auth,
      },
      { host: dto.smtpHost, port: dto.smtpPort, secure: dto.smtpSecure, auth },
    );

    const { password, ...rest } = dto;
    const doc = await this.model.create({
      ...rest,
      email,
      username,
      tenantId: tid,
      provider: 'custom',
      passwordEnc: this.box.encrypt(password),
      status: 'connecting',
      isDefault: !(await this.model.exists({ tenantId: tid })),
    });
    this.changes.next({ accountId: String(doc._id) });
    return this.findOne(String(doc._id), tenantId);
  }

  /** Alta o reconexión desde el callback de OAuth (Gmail / Outlook). */
  async upsertFromOAuth(
    tenantId: string,
    provider: OAuthProvider,
    tokens: OAuthTokens,
  ): Promise<EmailAccount> {
    if (!tokens.email)
      throw new Error('El proveedor no informó la dirección del buzón');
    const tid = this.oid(tenantId);
    const secrets = {
      refreshTokenEnc: tokens.refreshToken
        ? this.box.encrypt(tokens.refreshToken)
        : undefined,
      accessTokenEnc: this.box.encrypt(tokens.accessToken),
      accessTokenExpiresAt: tokens.expiresAt,
    };
    const existing = await this.model
      .findOne({ tenantId: tid, email: tokens.email })
      .exec();
    let id: string;
    if (existing) {
      await this.model
        .updateOne(
          { _id: existing._id },
          {
            $set: {
              ...secrets,
              ...OAUTH_SERVERS[provider],
              provider,
              incomingProtocol: 'imap',
              username: tokens.email,
              active: true,
              status: 'connecting',
              lastError: null,
            },
          },
        )
        .exec();
      id = String(existing._id);
    } else {
      const doc = await this.model.create({
        tenantId: tid,
        label: provider === 'gmail' ? 'Gmail' : 'Outlook',
        email: tokens.email,
        fromName: tokens.name,
        provider,
        incomingProtocol: 'imap',
        username: tokens.email,
        ...OAUTH_SERVERS[provider],
        ...secrets,
        status: 'connecting',
        isDefault: !(await this.model.exists({ tenantId: tid })),
      });
      id = String(doc._id);
    }
    this.changes.next({ accountId: id });
    return this.findOne(id, tenantId);
  }

  async update(
    id: string,
    tenantId: string,
    dto: UpdateEmailAccountDto,
  ): Promise<EmailAccount> {
    const account = await this.findOne(id, tenantId);
    const { password, ...rest } = dto;
    const serverFields = [
      'incomingProtocol',
      'incomingHost',
      'incomingPort',
      'incomingSecure',
      'smtpHost',
      'smtpPort',
      'smtpSecure',
      'username',
    ] as const;
    const changesServer =
      password !== undefined || serverFields.some((f) => rest[f] !== undefined);
    if (changesServer && account.provider !== 'custom')
      throw new BadRequestException(
        'Los servidores de Gmail y Outlook no se editan: reconecta la cuenta',
      );

    const set: Record<string, unknown> = { ...rest };
    if (changesServer) {
      const full = await this.findById(id);
      const merged = {
        ...full!.toObject(),
        ...rest,
      } as unknown as EmailAccount;
      const auth: MailAuth = {
        user: merged.username || merged.email,
        pass: password ?? this.decrypt(full!.passwordEnc),
      };
      await this.testOrThrow(
        {
          protocol: merged.incomingProtocol,
          host: merged.incomingHost!,
          port: merged.incomingPort!,
          secure: merged.incomingSecure,
          auth,
        },
        {
          host: merged.smtpHost!,
          port: merged.smtpPort!,
          secure: merged.smtpSecure,
          auth,
        },
      );
      if (password) set.passwordEnc = this.box.encrypt(password);
      // Otro servidor u otro protocolo: el punto de sincronización no vale.
      if (
        rest.incomingHost ||
        rest.incomingProtocol ||
        rest.username !== undefined
      ) {
        set.uidValidity = null;
        set.lastUid = null;
        set.seenUidls = [];
      }
      set.status = 'connecting';
      set.lastError = null;
    }
    await this.model.updateOne({ _id: account._id }, { $set: set }).exec();
    this.changes.next({ accountId: id });
    return this.findOne(id, tenantId);
  }

  async setDefault(id: string, tenantId: string): Promise<EmailAccount> {
    const account = await this.findOne(id, tenantId);
    await this.model
      .updateMany(
        { tenantId: account.tenantId },
        { $set: { isDefault: false } },
      )
      .exec();
    await this.model
      .updateOne({ _id: account._id }, { $set: { isDefault: true } })
      .exec();
    return this.findOne(id, tenantId);
  }

  async remove(id: string, tenantId: string): Promise<{ ok: true }> {
    const account = await this.findOne(id, tenantId);
    await this.model.deleteOne({ _id: account._id }).exec();
    if (account.isDefault) {
      const next = await this.model
        .findOne({ tenantId: account.tenantId })
        .sort({ createdAt: 1 })
        .exec();
      if (next)
        await this.model
          .updateOne({ _id: next._id }, { $set: { isDefault: true } })
          .exec();
    }
    this.changes.next({ accountId: id, removed: true });
    return { ok: true };
  }

  async test(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    const account = await this.findById(id);
    try {
      await this.transport.test(
        await this.incomingConfig(account!),
        await this.smtpConfig(account!),
      );
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  private async testOrThrow(incoming: IncomingConfig, smtp: SmtpConfig) {
    try {
      await this.transport.test(incoming, smtp);
    } catch (err) {
      throw new BadRequestException(
        `No se pudo conectar: ${(err as Error).message}`,
      );
    }
  }

  // ── Credenciales resueltas para el transporte ──────────────────────────

  private decrypt(sealed?: string): string {
    if (!sealed) throw new Error('La cuenta no tiene credenciales guardadas');
    try {
      return this.box.decrypt(sealed);
    } catch {
      throw new Error(
        'No se pudieron leer las credenciales guardadas: vuelve a conectar la cuenta',
      );
    }
  }

  /** Contraseña o access token vigente (lo renueva si está por caducar). */
  async auth(account: EmailAccount): Promise<MailAuth> {
    const user = account.username || account.email;
    if (account.provider === 'custom')
      return { user, pass: this.decrypt(account.passwordEnc) };

    const valid =
      account.accessTokenEnc &&
      account.accessTokenExpiresAt &&
      account.accessTokenExpiresAt.getTime() - Date.now() > TOKEN_MARGIN_MS;
    if (valid)
      return { user, accessToken: this.decrypt(account.accessTokenEnc) };

    const refreshToken = this.decrypt(account.refreshTokenEnc);
    const tokens = await this.oauth
      .refresh(account.provider, refreshToken)
      .catch((err: Error) => {
        throw new Error(
          `${err.message}. Vuelve a conectar la cuenta de ${account.provider === 'gmail' ? 'Gmail' : 'Outlook'}.`,
        );
      });
    account.accessTokenEnc = this.box.encrypt(tokens.accessToken);
    account.accessTokenExpiresAt = tokens.expiresAt;
    const set: Record<string, unknown> = {
      accessTokenEnc: account.accessTokenEnc,
      accessTokenExpiresAt: tokens.expiresAt,
    };
    // Microsoft rota el refresh token: hay que guardar el nuevo.
    if (tokens.refreshToken && tokens.refreshToken !== refreshToken)
      set.refreshTokenEnc = account.refreshTokenEnc = this.box.encrypt(
        tokens.refreshToken,
      );
    await this.model.updateOne({ _id: account._id }, { $set: set }).exec();
    return { user, accessToken: tokens.accessToken };
  }

  async incomingConfig(account: EmailAccount): Promise<IncomingConfig> {
    return {
      protocol: account.incomingProtocol,
      host: account.incomingHost!,
      port: account.incomingPort!,
      secure: account.incomingSecure,
      auth: await this.auth(account),
    };
  }

  async smtpConfig(account: EmailAccount): Promise<SmtpConfig> {
    return {
      host: account.smtpHost!,
      port: account.smtpPort!,
      secure: account.smtpSecure,
      auth: await this.auth(account),
    };
  }

  /** "Nombre" <correo> para el campo De:. */
  fromHeader(account: EmailAccount): string {
    const name = (account.fromName || account.label || '').replace(
      /["\\]/g,
      '',
    );
    return name ? `"${name}" <${account.email}>` : account.email;
  }

  // ── Estado de conexión y sincronización ────────────────────────────────

  async setStatus(id: string, status: EmailConnectionStatus, error?: string) {
    await this.model
      .updateOne(
        { _id: this.oid(id) },
        { $set: { status, lastError: error ?? null } },
      )
      .exec();
  }

  async saveSync(
    id: string,
    patch: {
      uidValidity?: string;
      lastUid?: number;
      seenUidls?: string[];
    },
  ) {
    await this.model
      .updateOne(
        { _id: this.oid(id) },
        { $set: { ...patch, lastSyncAt: new Date() } },
      )
      .exec();
  }

  async seenUidls(id: string): Promise<string[] | null> {
    const doc = await this.model
      .findById(this.oid(id))
      .select('+seenUidls lastSyncAt')
      .lean<{ seenUidls?: string[]; lastSyncAt?: Date }>()
      .exec();
    // Sin sincronización previa: se devuelve null para no importar lo viejo.
    return doc?.lastSyncAt ? (doc.seenUidls ?? []) : null;
  }

  /**
   * Reserva el buzón para esta instancia. Con varias réplicas del backend,
   * solo una lo escucha: si muere, el arriendo caduca y otra lo toma.
   */
  async claimLease(
    id: string,
    listenerId: string,
    ms: number,
  ): Promise<boolean> {
    const now = new Date();
    const res = await this.model
      .updateOne(
        {
          _id: this.oid(id),
          active: true,
          $or: [
            { listenerId },
            { leaseUntil: null },
            { leaseUntil: { $exists: false } },
            { leaseUntil: { $lte: now } },
          ],
        },
        { $set: { listenerId, leaseUntil: new Date(now.getTime() + ms) } },
      )
      .exec();
    return res.modifiedCount > 0 || res.matchedCount > 0;
  }

  async releaseLease(id: string, listenerId: string) {
    await this.model
      .updateOne(
        { _id: this.oid(id), listenerId },
        { $set: { leaseUntil: null, listenerId: null } },
      )
      .exec()
      .catch(() => undefined);
  }

  providerLabel(p: EmailProvider): string {
    return p === 'gmail' ? 'Gmail' : p === 'outlook' ? 'Outlook' : 'IMAP/SMTP';
  }
}
