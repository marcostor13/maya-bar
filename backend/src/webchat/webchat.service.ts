import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Model, Types } from 'mongoose';
import { Tenant } from '../tenants/tenant.schema';
import { Conversation } from '../conversations/conversation.schema';
import { ConversationsService } from '../conversations/conversations.service';
import { WebChatHub, type WebChatEvent } from '../conversations/web-chat-hub';
import {
  domainAllowed,
  hostOf,
  normalizeDomain,
} from '../api-access/api-access.service';
import { WebWidget } from './web-widget.schema';
import type { UpdateWidgetDto } from './dto/webchat.dto';

export interface WebOrigin {
  origin?: string;
  referer?: string;
}

/**
 * Chat web embebible (HU69): configuración del widget, sesión del visitante
 * firmada, control de dominios y mensajes hacia y desde la bandeja.
 */
@Injectable()
export class WebchatService {
  private readonly secret: string;

  constructor(
    @InjectModel(WebWidget.name) private widgets: Model<WebWidget>,
    @InjectModel(Tenant.name) private tenants: Model<Tenant>,
    @InjectModel(Conversation.name) private convs: Model<Conversation>,
    private conversations: ConversationsService,
    private hub: WebChatHub,
    config: ConfigService,
  ) {
    this.secret = `webchat:${config.getOrThrow<string>('JWT_SECRET')}`;
  }

  // ── Configuración (administrador) ──────────────────────────────────────

  async getOrCreate(tenantId: string) {
    const tid = new Types.ObjectId(tenantId);
    return (
      (await this.widgets.findOne({ tenantId: tid }).exec()) ??
      this.widgets.create({
        tenantId: tid,
        key: randomBytes(16).toString('hex'),
      })
    );
  }

  async update(tenantId: string, dto: UpdateWidgetDto) {
    const w = await this.getOrCreate(tenantId);
    if (dto.allowedDomains) {
      const clean = dto.allowedDomains.map((d) => {
        const n = normalizeDomain(d);
        if (!n) throw new BadRequestException(`Dominio inválido: ${d}`);
        return n;
      });
      w.allowedDomains = [...new Set(clean)];
    }
    if (dto.active && !(dto.allowedDomains ?? w.allowedDomains).length)
      throw new BadRequestException(
        'Agrega al menos un dominio donde pegarás el chat',
      );
    if (dto.whatsappNumber !== undefined)
      w.whatsappNumber = dto.whatsappNumber.replace(/\D/g, '') || undefined;
    if (dto.agentId !== undefined)
      w.agentId = dto.agentId ? new Types.ObjectId(dto.agentId) : undefined;
    for (const k of [
      'active',
      'title',
      'greeting',
      'color',
      'askContact',
    ] as const)
      if (dto[k] !== undefined)
        (w as unknown as Record<string, unknown>)[k] = dto[k];
    return w.save();
  }

  // ── Público ────────────────────────────────────────────────────────────

  /** Widget activo cuyo dominio de origen está permitido; si no, no carga. */
  async resolve(key: string, from: WebOrigin): Promise<WebWidget> {
    const w = /^[a-f0-9]{32}$/.test(key)
      ? await this.widgets.findOne({ key }).exec()
      : null;
    if (!w || !w.active) throw new NotFoundException('Chat no disponible');
    const host = hostOf(from.origin) ?? hostOf(from.referer);
    if (!host || !domainAllowed(host, w.allowedDomains))
      throw new ForbiddenException(
        `El chat no está habilitado para ${host ?? 'este sitio'}`,
      );
    return w;
  }

  sign(w: WebWidget, visitorId: string) {
    return createHmac('sha256', this.secret)
      .update(`${String(w._id)}:${visitorId}`)
      .digest('base64url')
      .slice(0, 32);
  }

  /** Devuelve el visitante del token; un token ajeno o alterado no sirve. */
  visitor(w: WebWidget, token: string): string {
    const [visitorId, sig] = (token ?? '').split('.');
    if (!/^v[a-f0-9]{24}$/.test(visitorId ?? '') || !sig)
      throw new ForbiddenException('Sesión de chat inválida');
    const good = Buffer.from(this.sign(w, visitorId));
    const got = Buffer.from(sig);
    if (good.length !== got.length || !timingSafeEqual(good, got))
      throw new ForbiddenException('Sesión de chat inválida');
    return visitorId;
  }

  async session(w: WebWidget, visitorId?: string) {
    const id =
      visitorId && /^v[a-f0-9]{24}$/.test(visitorId)
        ? visitorId
        : `v${randomBytes(12).toString('hex')}`;
    const [tenant, conv, messages] = await Promise.all([
      this.tenants.findById(w.tenantId).select('name branding').lean().exec(),
      this.convs
        .findOne({ channel: 'web', accountId: w._id, contact: id })
        .select('customerId contactName')
        .lean()
        .exec(),
      this.conversations.webHistory(String(w._id), id),
    ]);
    return {
      visitorId: id,
      token: `${id}.${this.sign(w, id)}`,
      identified: !!conv?.customerId,
      config: {
        title: w.title,
        greeting: w.greeting,
        color: w.color,
        company: tenant?.name ?? '',
        logo: tenant?.branding?.logo ?? '',
        askContact: w.askContact,
        whatsappUrl: w.whatsappNumber
          ? `https://wa.me/${w.whatsappNumber}`
          : '',
      },
      messages,
    };
  }

  async send(w: WebWidget, token: string, text: string, honeypot?: string) {
    const visitorId = this.visitor(w, token);
    const clean = text.trim();
    if (!clean) throw new BadRequestException('Escribe un mensaje');
    // Un bot llenó la trampa: se le contesta como si nada, sin guardar.
    if (honeypot?.trim()) return { ok: true };
    const msg = await this.conversations.handleWebInbound(w, visitorId, clean);
    return msg
      ? {
          ok: true,
          message: {
            id: String(msg._id),
            direction: 'in',
            author: 'customer',
            type: 'text',
            text: msg.text,
            at: new Date(msg.at).toISOString(),
          } satisfies WebChatEvent,
        }
      : { ok: true };
  }

  async identify(
    w: WebWidget,
    token: string,
    data: { name?: string; phone?: string; email?: string; website?: string },
  ) {
    const visitorId = this.visitor(w, token);
    if (data.website?.trim()) return { ok: true };
    if (!data.phone?.trim() && !data.email?.trim())
      throw new BadRequestException('Deja tu teléfono o tu email');
    await this.conversations.identifyWebVisitor(w, visitorId, data);
    return { ok: true };
  }

  history(w: WebWidget, token: string, since?: string) {
    const visitorId = this.visitor(w, token);
    const d = since ? new Date(since) : undefined;
    return this.conversations.webHistory(
      String(w._id),
      visitorId,
      d && !isNaN(d.getTime()) ? d : undefined,
    );
  }

  subscribe(w: WebWidget, visitorId: string, fn: (e: WebChatEvent) => void) {
    return this.hub.subscribe(String(w._id), visitorId, fn);
  }
}
