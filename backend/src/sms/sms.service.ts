import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SmsConfig } from './sms-config.schema';
import { SaveSmsConfigDto } from './dto/sms.dto';
import { SecretBox } from '../shared/secret-box';
import { assertPublicHost } from '../shared/network';
import { buildSmsRequest, readPath, referencedSecrets } from './sms-request';

/** Configuración tal como se devuelve a la interfaz: sin valores secretos. */
export interface SmsConfigView {
  enabled: boolean;
  name: string;
  url: string;
  method: string;
  headers: { key: string; value: string }[];
  bodyType: string;
  body: string;
  from: string;
  secrets: { name: string; hasValue: boolean }[];
  successPath: string;
  successValue: string;
  idPath: string;
  defaultCountryCode: string;
  ratePerMinute: number;
  /** Secretos usados en la petición que aún no tienen valor. */
  missingSecrets: string[];
}

export interface SmsSendResult {
  /** Id del mensaje según el proveedor, si la respuesta lo trae. */
  id?: string;
  status: number;
  /** Respuesta del proveedor, recortada. */
  response: string;
}

const TIMEOUT_MS = 15_000;
const MAX_RESPONSE = 600;

/** Pasa un teléfono a E.164 usando el prefijo por defecto de la empresa. */
export function toE164(rawPhone: string, countryCode: string): string | null {
  const raw = (rawPhone ?? '').trim();
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (raw.startsWith('+')) {
    // ya trae país
  } else if (raw.startsWith('00')) {
    digits = digits.slice(2);
  } else if (!(digits.startsWith(countryCode) && digits.length > 10)) {
    digits = countryCode + digits.replace(/^0+/, '');
  }
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly box: SecretBox;

  constructor(
    @InjectModel(SmsConfig.name) private model: Model<SmsConfig>,
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

  async getConfig(tenantId: string): Promise<SmsConfigView> {
    return this.view(await this.find(tenantId));
  }

  /** Lo mínimo que necesita el editor de campañas. */
  async status(
    tenantId: string,
  ): Promise<{ configured: boolean; name: string; from: string }> {
    const cfg = await this.find(tenantId);
    return {
      configured: this.isUsable(cfg),
      name: cfg?.name ?? '',
      from: cfg?.from ?? '',
    };
  }

  async saveConfig(
    tenantId: string,
    dto: SaveSmsConfigDto,
  ): Promise<SmsConfigView> {
    const url = dto.url.trim();
    if (url) await this.assertSafeUrl(url);
    if (dto.bodyType === 'json' && dto.body.trim()) {
      // Se valida con valores de relleno: el JSON debe seguir siéndolo.
      const probe = buildSmsRequest(
        {
          url: 'https://example.com',
          method: 'POST',
          headers: [],
          bodyType: 'json',
          body: dto.body,
        },
        { to: '+10000000000', message: 'x', from: 'x', secrets: {} },
      );
      try {
        JSON.parse(probe.body ?? '');
      } catch {
        throw new BadRequestException(
          'El cuerpo no es un JSON válido. Revisa comillas y comas.',
        );
      }
    }

    const existing = await this.find(tenantId);
    const previous = new Map(
      (existing?.secrets ?? []).map((s) => [s.name.toLowerCase(), s.sealed]),
    );
    const secrets = dto.secrets
      .map((s) => {
        const name = s.name.toLowerCase();
        const sealed = s.value?.trim()
          ? this.box.encrypt(s.value.trim())
          : previous.get(name);
        return sealed ? { name, sealed } : null;
      })
      .filter((s): s is { name: string; sealed: string } => s !== null);

    const saved = await this.model
      .findOneAndUpdate(
        { tenantId: new Types.ObjectId(tenantId) },
        {
          $set: {
            enabled: dto.enabled,
            name: dto.name.trim(),
            url,
            method: dto.method,
            headers: dto.headers
              .filter((h) => h.key.trim())
              .map((h) => ({ key: h.key.trim(), value: h.value })),
            bodyType: dto.bodyType,
            body: dto.body,
            from: dto.from.trim(),
            secrets,
            successPath: dto.successPath?.trim() ?? '',
            successValue: dto.successValue?.trim() ?? '',
            idPath: dto.idPath?.trim() ?? '',
            defaultCountryCode: dto.defaultCountryCode ?? '51',
            ratePerMinute: dto.ratePerMinute ?? 60,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
    return this.view(saved);
  }

  /** Envío de prueba: usa la configuración guardada aunque esté desactivada. */
  async test(
    tenantId: string,
    to: string,
    message: string,
  ): Promise<SmsSendResult> {
    const cfg = await this.find(tenantId);
    if (!cfg?.url)
      throw new BadRequestException('Guarda primero la configuración');
    try {
      return await this.dispatch(cfg, to, message);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  /** Carga la configuración activa de la empresa o lanza si no hay. */
  async requireConfig(tenantId: string): Promise<SmsConfig> {
    const cfg = await this.find(tenantId);
    if (!this.isUsable(cfg))
      throw new BadRequestException(
        'No hay un proveedor de SMS activo. Configúralo en Configuración → SMS.',
      );
    return cfg!;
  }

  /**
   * Envía un SMS con una configuración ya cargada (el envío masivo la carga
   * una vez por lote). Lanza `Error` con un mensaje legible si falla.
   */
  dispatch(
    cfg: SmsConfig,
    to: string,
    message: string,
  ): Promise<SmsSendResult> {
    return this.execute(cfg, to, message);
  }

  private async execute(
    cfg: SmsConfig,
    rawTo: string,
    message: string,
  ): Promise<SmsSendResult> {
    const to = toE164(rawTo, cfg.defaultCountryCode || '51');
    if (!to) throw new Error('Teléfono inválido');

    const secrets: Record<string, string> = {};
    for (const s of cfg.secrets) secrets[s.name] = this.box.decrypt(s.sealed);

    const request = buildSmsRequest(cfg, {
      to,
      message,
      from: cfg.from,
      secrets,
    });
    await this.assertSafeUrl(request.url);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    let text: string;
    try {
      res = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: controller.signal,
        // Una redirección podría llevar a la red interna saltándose la comprobación.
        redirect: 'error',
      });
      text = await res.text();
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      throw new Error(
        aborted
          ? 'El proveedor de SMS no respondió a tiempo'
          : `No se pudo conectar con el proveedor de SMS: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    const response = text.slice(0, MAX_RESPONSE);
    if (!res.ok)
      throw new Error(`El proveedor respondió ${res.status}: ${response}`);

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    if (cfg.successPath) {
      const actual = readPath(json, cfg.successPath);
      const ok = cfg.successValue
        ? String(actual).toLowerCase() === cfg.successValue.toLowerCase()
        : actual !== undefined && actual !== null && actual !== false;
      if (!ok)
        throw new Error(`El proveedor no confirmó el envío: ${response}`);
    }
    const id = cfg.idPath ? readPath(json, cfg.idPath) : undefined;
    return {
      id:
        typeof id === 'string' || typeof id === 'number'
          ? String(id)
          : undefined,
      status: res.status,
      response,
    };
  }

  private isUsable(cfg: SmsConfig | null): boolean {
    return !!cfg && cfg.enabled && !!cfg.url;
  }

  private async assertSafeUrl(raw: string): Promise<void> {
    let url: URL;
    try {
      // Las variables de la URL no afectan al host; se validan sin ellas.
      url = new URL(raw.replace(/\{[^{}]*\}/g, 'x'));
    } catch {
      throw new BadRequestException('La URL del proveedor no es válida');
    }
    if (url.protocol !== 'https:')
      throw new BadRequestException('La URL del proveedor debe ser https');
    try {
      await assertPublicHost(url.hostname);
    } catch {
      throw new BadRequestException(
        'La URL del proveedor no apunta a una dirección pública',
      );
    }
  }

  private view(cfg: SmsConfig | null): SmsConfigView {
    const stored = new Set((cfg?.secrets ?? []).map((s) => s.name));
    const used = cfg
      ? referencedSecrets({
          url: cfg.url,
          method: cfg.method,
          headers: cfg.headers,
          bodyType: cfg.bodyType,
          body: cfg.body,
        })
      : [];
    return {
      enabled: cfg?.enabled ?? false,
      name: cfg?.name ?? '',
      url: cfg?.url ?? '',
      method: cfg?.method ?? 'POST',
      headers: (cfg?.headers ?? []).map((h) => ({
        key: h.key,
        value: h.value,
      })),
      bodyType: cfg?.bodyType ?? 'json',
      body: cfg?.body ?? '',
      from: cfg?.from ?? '',
      secrets: [...new Set([...stored, ...used])].map((name) => ({
        name,
        hasValue: stored.has(name),
      })),
      successPath: cfg?.successPath ?? '',
      successValue: cfg?.successValue ?? '',
      idPath: cfg?.idPath ?? '',
      defaultCountryCode: cfg?.defaultCountryCode ?? '51',
      ratePerMinute: cfg?.ratePerMinute ?? 60,
      missingSecrets: used.filter((n) => !stored.has(n)),
    };
  }
}
