import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaApiError, MetaGraphClient } from '../shared/meta-graph.client';
import type { WaConfig } from '../whatsapp/whatsapp.service';

/** Configuración de llamadas tal como la guarda Meta (`settings.calling`). */
export interface MetaCallingSettings {
  status?: 'ENABLED' | 'DISABLED';
  call_icon_visibility?: 'DEFAULT' | 'DISABLE_ALL';
  callback_permission_status?: 'ENABLED' | 'DISABLED';
  call_hours?: {
    status: 'ENABLED' | 'DISABLED';
    timezone_id?: string;
    weekly_operating_hours?: {
      day_of_week: string;
      open_time: string;
      close_time: string;
    }[];
    holiday_schedule?: { date: string; start_time: string; end_time: string }[];
  };
}

export interface MetaPermissionState {
  permission?: { status?: string; expiration_time?: number };
  actions?: {
    action_name: string;
    can_perform_action: boolean;
    limits?: {
      time_period: string;
      max_allowed: number;
      current_usage: number;
      limit_expiration_time?: number;
    }[];
  }[];
}

type CallAction = 'pre_accept' | 'accept' | 'reject' | 'terminate';

/** BSUID (usuario sin teléfono): Meta lo espera en `recipient`, no en `to`. */
const isBsuid = (contact: string) => !/^\d+$/.test(contact);

/**
 * Calling API de WhatsApp Cloud API. Solo señalización: el audio va directo
 * del navegador a Meta (ver ADR 0002).
 */
@Injectable()
export class CallsMetaService {
  private readonly logger = new Logger(CallsMetaService.name);
  private readonly version: string;

  constructor(
    private graph: MetaGraphClient,
    config: ConfigService,
  ) {
    this.version = config.get<string>('META_CALLING_GRAPH_VERSION') || 'v24.0';
  }

  async action(
    cfg: WaConfig,
    callId: string,
    action: CallAction,
    sdp?: string,
  ): Promise<void> {
    await this.call(() =>
      this.graph.post(`/${cfg.waPhoneNumberId}/calls`, {
        accessToken: cfg.waAccessToken,
        version: this.version,
        json: {
          messaging_product: 'whatsapp',
          call_id: callId,
          action,
          ...(sdp ? { session: { sdp_type: 'answer', sdp } } : {}),
        },
      }),
    );
  }

  /** Inicia una saliente con la oferta SDP del navegador; devuelve el id de Meta. */
  async connect(cfg: WaConfig, contact: string, sdp: string, ref: string) {
    const res = await this.call(() =>
      this.graph.post<{ calls?: { id: string }[] }>(
        `/${cfg.waPhoneNumberId}/calls`,
        {
          accessToken: cfg.waAccessToken,
          version: this.version,
          json: {
            messaging_product: 'whatsapp',
            ...(isBsuid(contact) ? { recipient: contact } : { to: contact }),
            action: 'connect',
            session: { sdp_type: 'offer', sdp },
            biz_opaque_callback_data: ref,
          },
        },
      ),
    );
    const id = res.calls?.[0]?.id;
    if (!id) throw new BadRequestException('Meta no devolvió la llamada');
    return id;
  }

  async getSettings(cfg: WaConfig): Promise<MetaCallingSettings> {
    const res = await this.call(() =>
      this.graph.get<{ calling?: MetaCallingSettings }>(
        `/${cfg.waPhoneNumberId}/settings`,
        { accessToken: cfg.waAccessToken, version: this.version },
      ),
    );
    return res.calling ?? {};
  }

  async updateSettings(cfg: WaConfig, calling: MetaCallingSettings) {
    await this.call(() =>
      this.graph.post(`/${cfg.waPhoneNumberId}/settings`, {
        accessToken: cfg.waAccessToken,
        version: this.version,
        json: { calling },
      }),
    );
  }

  async permission(
    cfg: WaConfig,
    contact: string,
  ): Promise<MetaPermissionState> {
    return this.call(() =>
      this.graph.get<MetaPermissionState>(
        `/${cfg.waPhoneNumberId}/call_permissions`,
        {
          accessToken: cfg.waAccessToken,
          version: this.version,
          params: isBsuid(contact)
            ? { recipient: contact }
            : { user_wa_id: contact },
        },
      ),
    );
  }

  /** Mensaje interactivo con el botón para que el cliente dé permiso. */
  async requestPermission(cfg: WaConfig, contact: string, text: string) {
    await this.call(() =>
      this.graph.post(`/${cfg.waPhoneNumberId}/messages`, {
        accessToken: cfg.waAccessToken,
        version: this.version,
        json: {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          ...(isBsuid(contact) ? { recipient: contact } : { to: contact }),
          type: 'interactive',
          interactive: {
            type: 'call_permission_request',
            action: { name: 'call_permission_request' },
            body: { text },
          },
        },
      }),
    );
  }

  /** Errores de Meta → mensaje para el usuario (el de Meta, que es el útil). */
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof MetaApiError) {
        const body = err.body as {
          error?: { code?: number; error_data?: { details?: string } };
        };
        const code = body?.error?.code;
        const details = body?.error?.error_data?.details;
        this.logger.warn(
          `Meta rechazó la petición de llamadas (código ${code ?? '?'})`,
        );
        throw new BadRequestException(
          `WhatsApp: ${details || err.message}${code ? ` (código ${code})` : ''}`,
        );
      }
      throw err;
    }
  }
}
