import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { SecretBox } from '../shared/secret-box';
import type { OAuthTokens } from '../email-accounts/email-oauth.service';
import {
  CalendarConnection,
  type CalendarProvider,
} from './calendar-connection.schema';
import { CalendarOAuthService, PROVIDER_LABEL } from './calendar-oauth.service';
import { CreateCalendarEventDto } from './dto/calendar.dto';

/** Se renueva el token si le queda menos de esto. */
const EXPIRY_MARGIN_MS = 60_000;
const SECRETS = '+accessTokenEnc +refreshTokenEnc';

export interface CalendarConnectionView {
  _id: string;
  provider: CalendarProvider;
  email: string;
  name?: string;
  isDefault: boolean;
}

export interface CalendarEventResult {
  provider: CalendarProvider;
  eventId: string;
  htmlLink?: string;
  joinUrl?: string;
  start: string;
  end: string;
  connectionEmail: string;
}

interface EventInput {
  title: string;
  description?: string;
  start: Date;
  end: Date;
  attendees: string[];
  timeZone?: string;
}

/** Respuesta HTTP ya leída: el cuerpo en JSON y el código. */
interface ApiResponse {
  status: number;
  ok: boolean;
  data: Record<string, unknown>;
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);
  private readonly box: SecretBox;

  constructor(
    @InjectModel(CalendarConnection.name)
    private model: Model<CalendarConnection>,
    private oauth: CalendarOAuthService,
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

  private view(c: CalendarConnection): CalendarConnectionView {
    return {
      _id: String(c._id),
      provider: c.provider,
      email: c.email,
      name: c.name,
      isDefault: !!c.isDefault,
    };
  }

  // ── Conexiones ──────────────────────────────────────────────────────────

  async list(tenantId: string) {
    const docs = await this.model
      .find({ tenantId: this.oid(tenantId) })
      .sort({ createdAt: 1 })
      .exec();
    return {
      available: this.oauth.available(),
      connections: docs.map((d) => this.view(d)),
    };
  }

  private async findOne(
    id: string,
    tenantId: string,
  ): Promise<CalendarConnection> {
    const doc = await this.model
      .findOne({ _id: this.oid(id), tenantId: this.oid(tenantId) })
      .select(SECRETS)
      .exec();
    if (!doc) throw new NotFoundException('Calendario no encontrado');
    return doc;
  }

  /** Alta o reconexión desde el callback de OAuth. */
  async upsertFromOAuth(
    tenantId: string,
    provider: CalendarProvider,
    tokens: OAuthTokens,
    userId?: string,
  ): Promise<CalendarConnectionView> {
    if (!tokens.email)
      throw new Error('El proveedor no informó la cuenta del calendario');
    const tid = this.oid(tenantId);
    const fields = {
      name: tokens.name,
      accessTokenEnc: this.box.encrypt(tokens.accessToken),
      ...(tokens.refreshToken
        ? { refreshTokenEnc: this.box.encrypt(tokens.refreshToken) }
        : {}),
      expiresAt: tokens.expiresAt,
      ...(userId && Types.ObjectId.isValid(userId)
        ? { connectedBy: new Types.ObjectId(userId) }
        : {}),
    };
    const existing = await this.model
      .findOne({ tenantId: tid, provider, email: tokens.email })
      .exec();
    if (existing) {
      await this.model
        .updateOne({ _id: existing._id }, { $set: fields })
        .exec();
      return this.view(await this.findOne(String(existing._id), tenantId));
    }
    const doc = await this.model.create({
      tenantId: tid,
      provider,
      email: tokens.email,
      ...fields,
      // La primera conexión de la empresa queda como predeterminada.
      isDefault: !(await this.model.exists({ tenantId: tid })),
    });
    return this.view(doc);
  }

  async setDefault(
    id: string,
    tenantId: string,
  ): Promise<CalendarConnectionView> {
    const conn = await this.findOne(id, tenantId);
    await this.model
      .updateMany({ tenantId: conn.tenantId }, { $set: { isDefault: false } })
      .exec();
    await this.model
      .updateOne({ _id: conn._id }, { $set: { isDefault: true } })
      .exec();
    return this.view(await this.findOne(id, tenantId));
  }

  async remove(id: string, tenantId: string): Promise<{ ok: true }> {
    const conn = await this.findOne(id, tenantId);
    await this.model.deleteOne({ _id: conn._id }).exec();
    if (conn.isDefault) {
      const next = await this.model
        .findOne({ tenantId: conn.tenantId })
        .sort({ createdAt: 1 })
        .exec();
      if (next)
        await this.model
          .updateOne({ _id: next._id }, { $set: { isDefault: true } })
          .exec();
    }
    return { ok: true };
  }

  /** La conexión pedida o, sin ella, la predeterminada de la empresa. */
  private async pick(
    tenantId: string,
    connectionId?: string,
  ): Promise<CalendarConnection> {
    if (connectionId) return this.findOne(connectionId, tenantId);
    const tid = this.oid(tenantId);
    const conn =
      (await this.model
        .findOne({ tenantId: tid, isDefault: true })
        .select(SECRETS)
        .exec()) ??
      (await this.model
        .findOne({ tenantId: tid })
        .sort({ createdAt: 1 })
        .select(SECRETS)
        .exec());
    if (!conn)
      throw new BadRequestException(
        'No hay ningún calendario conectado. Conecta Google Calendar o Microsoft 365 en Configuración.',
      );
    return conn;
  }

  // ── Tokens ──────────────────────────────────────────────────────────────

  private async accessToken(
    conn: CalendarConnection,
    force = false,
  ): Promise<string> {
    const fresh =
      conn.accessTokenEnc &&
      conn.expiresAt &&
      new Date(conn.expiresAt).getTime() - EXPIRY_MARGIN_MS > Date.now();
    if (!force && fresh) return this.box.decrypt(conn.accessTokenEnc!);

    const reconnect = new BadRequestException(
      `La conexión con ${PROVIDER_LABEL[conn.provider]} (${conn.email}) caducó o fue revocada. Vuelve a conectarla en Configuración → Calendario.`,
    );
    if (!conn.refreshTokenEnc) throw reconnect;
    let tokens: OAuthTokens;
    try {
      tokens = await this.oauth.refresh(
        conn.provider,
        this.box.decrypt(conn.refreshTokenEnc),
      );
    } catch (err) {
      this.logger.warn(
        `No se pudo renovar el token de ${conn.provider} (${conn.email}): ${String(err)}`,
      );
      throw reconnect;
    }
    const set: Record<string, unknown> = {
      accessTokenEnc: this.box.encrypt(tokens.accessToken),
      expiresAt: tokens.expiresAt,
    };
    // Microsoft rota el refresh token; Google normalmente no lo reenvía.
    if (tokens.refreshToken)
      set.refreshTokenEnc = this.box.encrypt(tokens.refreshToken);
    await this.model.updateOne({ _id: conn._id }, { $set: set }).exec();
    Object.assign(conn, set);
    return tokens.accessToken;
  }

  // ── Eventos ─────────────────────────────────────────────────────────────

  async createEvent(
    tenantId: string,
    dto: CreateCalendarEventDto,
  ): Promise<CalendarEventResult> {
    const start = new Date(dto.start);
    if (Number.isNaN(start.getTime()))
      throw new BadRequestException('Fecha de inicio inválida');
    const end = new Date(start.getTime() + dto.durationMinutes * 60_000);
    const conn = await this.pick(tenantId, dto.connectionId);
    const input: EventInput = {
      title: dto.title.trim(),
      description: dto.description?.trim() || undefined,
      start,
      end,
      attendees: [
        ...new Set((dto.attendees ?? []).map((a) => a.trim().toLowerCase())),
      ].filter(Boolean),
      timeZone: dto.timeZone,
    };

    const send = async (force: boolean) => {
      const token = await this.accessToken(conn, force);
      return conn.provider === 'google'
        ? this.postGoogle(token, input)
        : this.postMicrosoft(token, input);
    };
    let res = await send(false);
    // Token revocado o vencido antes de tiempo: se renueva una vez y se reintenta.
    if (res.status === 401) res = await send(true);
    if (!res.ok) {
      const err = res.data.error as
        | { message?: string; code?: string }
        | undefined;
      this.logger.warn(
        `${conn.provider} rechazó el evento (${res.status}): ${JSON.stringify(res.data).slice(0, 500)}`,
      );
      if (res.status === 401 || res.status === 403)
        throw new BadRequestException(
          `${PROVIDER_LABEL[conn.provider]} no permitió crear el evento. Vuelve a conectar el calendario en Configuración → Calendario.`,
        );
      throw new BadGatewayException(
        `${PROVIDER_LABEL[conn.provider]} no pudo crear el evento${err?.message ? `: ${err.message}` : ''}`,
      );
    }

    const base = {
      provider: conn.provider,
      start: start.toISOString(),
      end: end.toISOString(),
      connectionEmail: conn.email,
    };
    if (conn.provider === 'google') {
      const d = res.data as {
        id: string;
        htmlLink?: string;
        hangoutLink?: string;
        conferenceData?: {
          entryPoints?: { entryPointType?: string; uri?: string }[];
        };
      };
      const video = d.conferenceData?.entryPoints?.find(
        (e) => e.entryPointType === 'video',
      )?.uri;
      return {
        ...base,
        eventId: d.id,
        htmlLink: d.htmlLink,
        joinUrl: d.hangoutLink || video,
      };
    }
    const d = res.data as {
      id: string;
      webLink?: string;
      onlineMeeting?: { joinUrl?: string } | null;
      onlineMeetingUrl?: string | null;
    };
    return {
      ...base,
      eventId: d.id,
      htmlLink: d.webLink,
      joinUrl: d.onlineMeeting?.joinUrl || d.onlineMeetingUrl || undefined,
    };
  }

  private async request(
    url: string,
    token: string,
    body: unknown,
  ): Promise<ApiResponse> {
    let res: Awaited<ReturnType<typeof fetch>>;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.logger.warn(`Calendario inaccesible: ${String(err)}`);
      throw new BadGatewayException(
        'No se pudo contactar al proveedor del calendario',
      );
    }
    const data = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return { status: res.status, ok: res.ok, data };
  }

  /** Google Calendar: evento con Google Meet (`conferenceDataVersion=1`). */
  private postGoogle(token: string, e: EventInput) {
    const when = (d: Date) => ({
      dateTime: d.toISOString(),
      ...(e.timeZone ? { timeZone: e.timeZone } : {}),
    });
    return this.request(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
      token,
      {
        summary: e.title,
        ...(e.description ? { description: e.description } : {}),
        start: when(e.start),
        end: when(e.end),
        attendees: e.attendees.map((email) => ({ email })),
        conferenceData: {
          createRequest: {
            requestId: randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      },
    );
  }

  /**
   * Microsoft Graph: evento con reunión de Teams. Las horas van en UTC; Graph
   * las muestra a cada asistente en su propia zona.
   */
  private postMicrosoft(token: string, e: EventInput) {
    const when = (d: Date) => ({
      dateTime: d.toISOString().replace(/Z$/, ''),
      timeZone: 'UTC',
    });
    return this.request('https://graph.microsoft.com/v1.0/me/events', token, {
      subject: e.title,
      ...(e.description
        ? { body: { contentType: 'text', content: e.description } }
        : {}),
      start: when(e.start),
      end: when(e.end),
      attendees: e.attendees.map((address) => ({
        emailAddress: { address },
        type: 'required',
      })),
      isOnlineMeeting: true,
      onlineMeetingProvider: 'teamsForBusiness',
    });
  }
}
