import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Resend } from 'resend';
import { ResendConfig, ResendDomain } from './resend-config.schema';
import { SaveResendConfigDto } from './dto/resend.dto';
import { SecretBox } from '../shared/secret-box';

/** Configuración tal como se devuelve a la interfaz: sin la API key. */
export interface ResendConfigView {
  enabled: boolean;
  hasKey: boolean;
  keyHint: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  ratePerMinute: number;
  domains: ResendDomain[];
  checkedAt?: Date;
  /** Si el dominio del remitente está verificado; `null` si no se pudo saber. */
  fromVerified: boolean | null;
}

export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
}

/** Remitente ya resuelto de una empresa: se carga una vez por lote. */
export interface TenantMailer {
  from: string;
  ratePerMinute: number;
  /** Envía y devuelve el id del mensaje en Resend. Lanza si Resend lo rechaza. */
  send(mail: OutgoingMail): Promise<string>;
}

const domainOf = (email: string) => email.split('@')[1]?.toLowerCase() ?? '';

/** `"Nombre" <correo>` sin caracteres que rompan la cabecera. */
function fromHeader(name: string, email: string): string {
  const clean = name.replace(/["<>\\\r\n]/g, '').trim();
  return clean ? `${clean} <${email}>` : email;
}

@Injectable()
export class ResendService {
  private readonly logger = new Logger(ResendService.name);
  private readonly box: SecretBox;

  constructor(
    @InjectModel(ResendConfig.name) private model: Model<ResendConfig>,
    config: ConfigService,
  ) {
    this.box = new SecretBox(
      config.get<string>('EMAIL_ENCRYPTION_KEY') ||
        config.getOrThrow<string>('JWT_SECRET'),
    );
  }

  private find(tenantId: string) {
    return this.model
      .findOne({ tenantId: new Types.ObjectId(tenantId) })
      .exec();
  }

  /** Se sobrescribe en las pruebas para no tocar la red. */
  protected client(apiKey: string): Resend {
    return new Resend(apiKey);
  }

  async getConfig(tenantId: string): Promise<ResendConfigView> {
    return this.view(await this.find(tenantId));
  }

  /** Lo mínimo que necesita el editor de campañas. */
  async status(
    tenantId: string,
  ): Promise<{ configured: boolean; from: string }> {
    const cfg = await this.find(tenantId);
    return {
      configured: this.usable(cfg),
      from: cfg ? fromHeader(cfg.fromName, cfg.fromEmail) : '',
    };
  }

  async saveConfig(
    tenantId: string,
    dto: SaveResendConfigDto,
  ): Promise<ResendConfigView> {
    const existing = await this.find(tenantId);
    const apiKey = dto.apiKey?.trim()
      ? dto.apiKey.trim()
      : existing?.sealedKey
        ? this.box.decrypt(existing.sealedKey)
        : '';
    if (!apiKey)
      throw new BadRequestException('Pega la API key de tu cuenta de Resend');

    const fromEmail = dto.fromEmail.trim().toLowerCase();
    const domains = await this.fetchDomains(apiKey);
    if (domains) {
      const found = domains.find((d) => d.name === domainOf(fromEmail));
      if (dto.enabled && found?.status !== 'verified')
        throw new BadRequestException(
          found
            ? `El dominio ${found.name} todavía no está verificado en Resend (estado: ${found.status}). Termina la verificación en Resend y vuelve a guardar.`
            : `El dominio ${domainOf(fromEmail)} no está en tu cuenta de Resend. Añádelo y verifícalo allí, o usa un remitente de: ${domains.map((d) => d.name).join(', ') || 'ningún dominio todavía'}.`,
        );
    }

    const saved = await this.model
      .findOneAndUpdate(
        { tenantId: new Types.ObjectId(tenantId) },
        {
          $set: {
            enabled: dto.enabled,
            sealedKey: this.box.encrypt(apiKey),
            keyHint: apiKey.slice(-4),
            fromEmail,
            fromName: dto.fromName?.trim() ?? '',
            replyTo: dto.replyTo?.trim().toLowerCase() ?? '',
            ratePerMinute: dto.ratePerMinute ?? 100,
            // Una key solo de envío no deja listar dominios: se conserva lo último.
            ...(domains ? { domains, checkedAt: new Date() } : {}),
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
    return this.view(saved);
  }

  async remove(tenantId: string): Promise<void> {
    await this.model
      .deleteOne({ tenantId: new Types.ObjectId(tenantId) })
      .exec();
  }

  /** Correo de prueba con la cuenta guardada, aunque esté desactivada. */
  async test(tenantId: string, to: string): Promise<{ id: string }> {
    const cfg = await this.find(tenantId);
    if (!cfg?.sealedKey || !cfg.fromEmail)
      throw new BadRequestException('Guarda primero la configuración');
    try {
      const id = await this.mailerFor(cfg).send({
        to,
        subject: 'Prueba de envío desde Maya CRM',
        html: '<p>Tu cuenta de Resend está conectada. Este es un correo de prueba.</p>',
        text: 'Tu cuenta de Resend está conectada. Este es un correo de prueba.',
      });
      return { id };
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  /** Remitente propio de la empresa, o `null` si no tiene Resend activo. */
  async mailer(tenantId: string): Promise<TenantMailer | null> {
    const cfg = await this.find(tenantId);
    return this.usable(cfg) ? this.mailerFor(cfg!) : null;
  }

  private mailerFor(cfg: ResendConfig): TenantMailer {
    const client = this.client(this.box.decrypt(cfg.sealedKey!));
    const from = fromHeader(cfg.fromName, cfg.fromEmail);
    return {
      from,
      ratePerMinute: cfg.ratePerMinute || 100,
      send: async (mail) => {
        const res = await client.emails.send({
          from,
          to: mail.to,
          subject: mail.subject,
          html: mail.html,
          ...(mail.text ? { text: mail.text } : {}),
          ...(cfg.replyTo ? { replyTo: cfg.replyTo } : {}),
          ...(mail.headers ? { headers: mail.headers } : {}),
        });
        if (res.error) {
          const status = (res.error as { statusCode?: number }).statusCode;
          // El código va en el mensaje: el envío masivo decide con él si reintenta.
          throw new Error(
            `Resend respondió ${status ?? 'error'}: ${res.error.message}`,
          );
        }
        return res.data?.id ?? '';
      },
    };
  }

  /**
   * Dominios de la cuenta. Devuelve `null` si la key es válida pero no tiene
   * permiso para listarlos (key "solo envío"); lanza si la key no sirve.
   */
  private async fetchDomains(apiKey: string): Promise<ResendDomain[] | null> {
    let res: Awaited<ReturnType<Resend['domains']['list']>>;
    try {
      res = await this.client(apiKey).domains.list();
    } catch (err) {
      throw new BadRequestException(
        `No se pudo contactar con Resend: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (res.error) {
      const name = (res.error as { name?: string }).name ?? '';
      if (name === 'restricted_api_key') return null;
      throw new BadRequestException(
        name === 'validation_error' ||
          name === 'invalid_api_Key' ||
          name === 'missing_api_key'
          ? 'Resend no reconoce esa API key. Cópiala de nuevo desde tu cuenta.'
          : `Resend rechazó la API key: ${res.error.message}`,
      );
    }
    const list = (
      res.data as { data?: { name: string; status: string }[] } | null
    )?.data;
    return (list ?? []).map((d) => ({
      name: d.name.toLowerCase(),
      status: d.status,
    }));
  }

  private usable(cfg: ResendConfig | null): boolean {
    return !!cfg && cfg.enabled && !!cfg.sealedKey && !!cfg.fromEmail;
  }

  private view(cfg: ResendConfig | null): ResendConfigView {
    const domains = (cfg?.domains ?? []).map((d) => ({
      name: d.name,
      status: d.status,
    }));
    const mine = domains.find((d) => d.name === domainOf(cfg?.fromEmail ?? ''));
    return {
      enabled: cfg?.enabled ?? false,
      hasKey: !!cfg?.sealedKey,
      keyHint: cfg?.keyHint ?? '',
      fromEmail: cfg?.fromEmail ?? '',
      fromName: cfg?.fromName ?? '',
      replyTo: cfg?.replyTo ?? '',
      ratePerMinute: cfg?.ratePerMinute ?? 100,
      domains,
      checkedAt: cfg?.checkedAt,
      fromVerified: domains.length ? mine?.status === 'verified' : null,
    };
  }
}
