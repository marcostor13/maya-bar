import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import { Event, type EventTicketType } from './event.schema';
import { EventRegistration } from './event-registration.schema';
import { EventTemplate } from './event-template.schema';
import { Tenant } from '../tenants/tenant.schema';
import { Local } from '../locals/local.schema';
import { MpSellerConnection } from '../event-tickets/mp-seller-connection.schema';
import {
  CreateEventDto,
  UpdateEventDto,
  ShareEventDto,
  GenerateFromPromptDto,
  GenerateDesignDto,
  SaveTemplateDto,
  type TicketTypeDto,
} from './dto/event.dto';
import { AiService } from '../ai/ai.service';
import { isOwnerScoped } from '../auth/permissions';

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function eventContext(event: Event): string {
  const date = event.date.toLocaleDateString('es-PE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const price = event.price === 0 ? 'Gratis' : `S/ ${event.price}`;
  const time = event.startTime
    ? `${event.startTime}${event.endTime ? ' - ' + event.endTime : ''}`
    : 'por confirmar';
  return `Título: ${event.title}\nFecha: ${date}\nHorario: ${time}\nPrecio: ${price}\nDescripción: ${event.description ?? '(sin descripción)'}`;
}

/** Marca de la empresa que ve el público en la landing del evento (HU26). */
export interface PublicBrand {
  name: string;
  logo?: string;
  favicon?: string;
}

/** Dónde es el evento, para el invitado (HU33): nunca datos internos del local. */
export interface PublicVenue {
  name: string;
  address?: string;
}

// CRUD de eventos, slug, medios, diseño de invitación y compartir.
/**
 * Fusiona los tipos de entrada que manda el formulario con los guardados
 * (HU67): conserva lo vendido por clave y no deja borrar uno con ventas.
 */
export function mergeTicketTypes(
  current: EventTicketType[],
  incoming: TicketTypeDto[] | undefined,
): EventTicketType[] {
  if (!incoming) return current;
  const byKey = new Map(current.map((t) => [t.key, t]));
  const used = new Set<string>();
  const out = incoming.map((t, i) => {
    let key = t.key || toSlug(t.name).slice(0, 24) || `tipo-${i + 1}`;
    while (used.has(key)) key = `${key}-${i + 1}`;
    used.add(key);
    const prev = byKey.get(key);
    const sold = prev?.sold ?? 0;
    const capacity = Math.floor(t.capacity ?? 0);
    if (capacity && capacity < sold)
      throw new BadRequestException(
        `"${t.name}" ya tiene ${sold} entradas vendidas: el cupo no puede ser menor`,
      );
    return {
      key,
      name: t.name.trim(),
      price: Math.round(t.price * 100) / 100,
      capacity,
      salesEndAt: t.salesEndAt ? new Date(t.salesEndAt) : null,
      sold,
    };
  });
  for (const prev of current)
    if (prev.sold > 0 && !used.has(prev.key))
      throw new BadRequestException(
        `No puedes quitar "${prev.name}": ya tiene entradas vendidas`,
      );
  return out;
}

@Injectable()
export class EventsService {
  constructor(
    @InjectModel(Event.name) private eventModel: Model<Event>,
    @InjectModel(EventRegistration.name)
    private regModel: Model<EventRegistration>,
    @InjectModel(EventTemplate.name)
    private templateModel: Model<EventTemplate>,
    private ai: AiService,
    @InjectModel(Tenant.name) private tenantModel: Model<Tenant>,
    @InjectModel(Local.name) private localModel: Model<Local>,
    // Global (HU42); opcional para las pruebas unitarias.
    @Optional() private limits?: PlanLimitsService,
    // Saber si la empresa puede cobrar entradas en línea (HU67).
    @Optional()
    @InjectModel(MpSellerConnection.name)
    private sellers?: Model<MpSellerConnection>,
  ) {}

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async createEvent(
    tenantId: string,
    userId: string,
    dto: CreateEventDto,
  ): Promise<Event> {
    // Publicar cuenta contra los eventos activos del plan; el borrador no (HU42).
    if (dto.status === 'published')
      await this.limits?.assertCanAdd(tenantId, 'activeEvents');
    const base = toSlug(dto.title);
    const slug = `${base}-${randomUUID().slice(0, 6)}`;
    const event = new this.eventModel({
      ...dto,
      ticketTypes: mergeTicketTypes([], dto.ticketTypes),
      tenantId: new Types.ObjectId(tenantId),
      localId: new Types.ObjectId(dto.localId),
      date: new Date(dto.date),
      capacity: dto.capacity ?? 0,
      price: dto.price ?? 0,
      slug,
      createdBy: new Types.ObjectId(userId),
    });
    return event.save();
  }

  async findEvents(
    tenantId: string,
    userId: string,
    role: string,
    localId?: string,
  ): Promise<Event[]> {
    const tid = new Types.ObjectId(tenantId);
    let filter: Record<string, unknown>;

    if (isOwnerScoped(role)) {
      const uid = new Types.ObjectId(userId);
      filter = {
        tenantId: tid,
        $or: [{ createdBy: uid }, { sharedWith: uid }, { sharedWithAll: true }],
      };
    } else {
      filter = { tenantId: tid };
    }

    if (localId) filter['localId'] = new Types.ObjectId(localId);
    return this.eventModel.find(filter).sort({ date: 1 }).exec();
  }

  async findOneEvent(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<Event> {
    const event = await this.eventModel.findById(id).exec();
    if (!event) throw new NotFoundException('Evento no encontrado');
    if (event.tenantId.toString() !== tenantId) throw new ForbiddenException();
    if (isOwnerScoped(role)) {
      const uid = userId;
      const isOwner = event.createdBy?.toString() === uid;
      const isShared = event.sharedWith?.some((s) => s.toString() === uid);
      if (!isOwner && !isShared && !event.sharedWithAll)
        throw new ForbiddenException();
    }
    return event;
  }

  async findPublicEvent(slug: string): Promise<{
    event: Event;
    registrationsCount: number;
    brand: PublicBrand | null;
    venue: PublicVenue | null;
    payments: { online: boolean; feeIncluded: boolean };
  }> {
    const event = await this.eventModel
      .findOne({ slug, status: 'published' })
      .exec();
    if (!event) throw new NotFoundException('Evento no encontrado');
    const [registrationsCount, tenant, local] = await Promise.all([
      this.regModel.countDocuments({
        eventId: event._id,
        status: 'confirmed',
      }),
      // Solo lo que se muestra al público: nada de correo, RUC ni plan (HU26).
      this.tenantModel
        .findById(event.tenantId)
        .select('name branding.logo branding.favicon')
        .lean<Pick<Tenant, 'name' | 'branding'>>()
        .exec(),
      this.localModel
        .findById(event.localId)
        .select('name address')
        .lean<Pick<Local, 'name' | 'address'>>()
        .exec(),
    ]);
    const brand: PublicBrand | null = tenant
      ? {
          name: tenant.name,
          ...(tenant.branding?.logo ? { logo: tenant.branding.logo } : {}),
          ...(tenant.branding?.favicon
            ? { favicon: tenant.branding.favicon }
            : {}),
        }
      : null;
    const address = event.location?.trim() || local?.address?.trim();
    const venue: PublicVenue | null = local
      ? { name: local.name, ...(address ? { address } : {}) }
      : address
        ? { name: address }
        : null;
    const online =
      !!event.onlinePayment &&
      !!(await this.sellers?.exists({ tenantId: event.tenantId }));
    return {
      event,
      registrationsCount,
      brand,
      venue,
      payments: { online, feeIncluded: true },
    };
  }

  async updateEvent(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
    dto: UpdateEventDto,
  ): Promise<Event> {
    const event = await this.eventModel.findById(id).exec();
    if (!event) throw new NotFoundException('Evento no encontrado');
    if (event.tenantId.toString() !== tenantId) throw new ForbiddenException();
    if (isOwnerScoped(role) && event.createdBy?.toString() !== userId)
      throw new ForbiddenException();
    // Publicar, o dar fecha futura a uno publicado ya pasado, cuenta como evento activo (HU42).
    const wasActive =
      event.status === 'published' &&
      new Date(event.date).getTime() >= Date.now() - 86_400_000;
    const willBeActive =
      (dto.status ?? event.status) === 'published' &&
      new Date(dto.date ?? event.date).getTime() >= Date.now() - 86_400_000;
    if (willBeActive && !wasActive)
      await this.limits?.assertCanAdd(tenantId, 'activeEvents');
    const update: Record<string, unknown> = { ...dto };
    if (dto.date) update['date'] = new Date(dto.date);
    if (dto.ticketTypes)
      update['ticketTypes'] = mergeTicketTypes(
        event.ticketTypes ?? [],
        dto.ticketTypes,
      );
    Object.assign(event, update);
    return event.save();
  }

  async deleteEvent(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<void> {
    const event = await this.eventModel.findById(id).exec();
    if (!event) throw new NotFoundException('Evento no encontrado');
    if (event.tenantId.toString() !== tenantId) throw new ForbiddenException();
    if (isOwnerScoped(role) && event.createdBy?.toString() !== userId)
      throw new ForbiddenException();
    await this.eventModel.findByIdAndDelete(id).exec();
    await this.regModel.deleteMany({ eventId: new Types.ObjectId(id) }).exec();
  }

  async shareEvent(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
    dto: ShareEventDto,
  ): Promise<Event> {
    const event = await this.eventModel.findById(id).exec();
    if (!event) throw new NotFoundException('Evento no encontrado');
    if (event.tenantId.toString() !== tenantId) throw new ForbiddenException();
    if (isOwnerScoped(role) && event.createdBy?.toString() !== userId)
      throw new ForbiddenException();
    if (dto.sharedWithAll !== undefined)
      event.sharedWithAll = dto.sharedWithAll;
    if (dto.sharedWith !== undefined)
      event.sharedWith = dto.sharedWith.map((uid) => new Types.ObjectId(uid));
    return event.save();
  }

  // ─── AI Features ──────────────────────────────────────────────────────────

  private async getEventForAI(id: string, tenantId: string): Promise<Event> {
    const event = await this.eventModel.findById(id).exec();
    if (!event) throw new NotFoundException('Evento no encontrado');
    if (event.tenantId.toString() !== tenantId) throw new ForbiddenException();
    return event;
  }

  async generateFromPrompt(
    dto: GenerateFromPromptDto,
    tenantId?: string,
  ): Promise<{
    title: string;
    description: string;
    price?: number;
    startTime?: string | null;
  }> {
    const mediaCtx = dto.mediaFileNames?.length
      ? `\nArchivos multimedia disponibles: ${dto.mediaFileNames.join(', ')}`
      : '';
    const prompt = `Eres experto en marketing gastronómico y eventos en LATAM. El organizador quiere crear un evento:${mediaCtx}\n\n"${dto.prompt}"\n\nGenera los datos del evento. Responde SOLO con JSON exacto sin texto adicional:\n{\n  "title": "Título atractivo máx 60 chars",\n  "description": "Descripción 2-3 párrafos español latinoamericano sensorial y apetitoso",\n  "price": 0,\n  "startTime": null\n}\n\nReglas: title máx 60 chars, description usa la info dada, price en soles (0 si gratis), startTime en formato "HH:MM" si se menciona hora, null si no.`;
    const text = await this.ai.chat(prompt, {
      maxTokens: 1024,
      ...(tenantId ? { meter: { tenantId, action: 'text' as const } } : {}),
    });
    return this.ai.parseJson<{
      title: string;
      description: string;
      price?: number;
      startTime?: string | null;
    }>(text);
  }

  async generateCopy(
    id: string,
    tenantId: string,
  ): Promise<{ title: string; description: string }> {
    const event = await this.getEventForAI(id, tenantId);
    const prompt = `Eres un experto en marketing gastronómico para LATAM. Genera copy atractivo para este evento:\n\n${eventContext(event)}\n\nResponde SOLO con JSON exacto (sin texto adicional):\n{"title": "...", "description": "..."}\n\nReglas:\n- Título llamativo, máximo 60 caracteres.\n- Descripción: 2-3 párrafos cortos, español latinoamericano, lenguaje sensorial.`;
    const text = await this.ai.chat(prompt, {
      provider: 'openai',
      maxTokens: 1024,
      meter: { tenantId, action: 'text' },
    });
    return this.ai.parseJson<{ title: string; description: string }>(text);
  }

  async generateSocial(
    id: string,
    tenantId: string,
  ): Promise<{ instagram: string; whatsapp: string }> {
    const event = await this.getEventForAI(id, tenantId);
    const prompt = `Eres un community manager experto en gastronomía LATAM. Genera textos para redes sociales para este evento:\n\n${eventContext(event)}\n\nResponde SOLO con JSON exacto:\n{\n  "instagram": "Caption para Instagram (máx 300 chars, con emojis, CTA, 5 hashtags al final)",\n  "whatsapp": "Mensaje para difundir por WhatsApp (informal, entusiasta, con datos clave del evento)"\n}`;
    const text = await this.ai.chat(prompt, {
      provider: 'openai',
      maxTokens: 600,
      meter: { tenantId, action: 'text' },
    });
    return this.ai.parseJson<{ instagram: string; whatsapp: string }>(text);
  }

  async generateHashtags(
    id: string,
    tenantId: string,
  ): Promise<{ hashtags: string[] }> {
    const event = await this.getEventForAI(id, tenantId);
    const prompt = `Genera 15 hashtags en español e inglés para este evento gastronómico en LATAM:\n\n${eventContext(event)}\n\nResponde SOLO con JSON: {"hashtags": ["#...", "#...", ...]}\nMix: 5 generales de gastronomía, 5 específicos del evento, 5 de tendencia/lifestyle.`;
    const text = await this.ai.chat(prompt, {
      provider: 'openai',
      maxTokens: 400,
      meter: { tenantId, action: 'text' },
    });
    return this.ai.parseJson<{ hashtags: string[] }>(text);
  }

  async generateEmail(
    id: string,
    tenantId: string,
  ): Promise<{ subject: string; body: string }> {
    const event = await this.getEventForAI(id, tenantId);
    const prompt = `Eres un experto en email marketing gastronómico. Crea un email de invitación para este evento:\n\n${eventContext(event)}\n\nResponde SOLO con JSON exacto:\n{\n  "subject": "Asunto del email (atractivo, máx 60 chars)",\n  "body": "Cuerpo del email en texto plano con saltos de línea. Debe incluir: saludo personalizado con {nombre}, descripción apetitosa del evento, datos clave (fecha/hora/precio), llamada a la acción clara, y cierre cálido."\n}`;
    const text = await this.ai.chat(prompt, {
      provider: 'openai',
      maxTokens: 1200,
      meter: { tenantId, action: 'text' },
    });
    return this.ai.parseJson<{ subject: string; body: string }>(text);
  }

  // ─── Invitation Design ────────────────────────────────────────────────────

  async generateDesign(
    dto: GenerateDesignDto,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const mediaList = (dto.mediaFiles ?? [])
      .map((f) => `- ${f.name} (${f.mimeType}): ${f.url}`)
      .join('\n');

    const prompt = `Eres diseñador gráfico creando invitaciones para eventos gastronómicos y de entretenimiento en LATAM.

Crea un JSON de diseño para un flyer vertical (9:16, canvas 324×576px).

Descripción: "${dto.prompt}"

Archivos multimedia disponibles:
${mediaList || 'Sin archivos'}

Devuelve SOLO el JSON con esta estructura exacta (sin markdown, sin texto adicional):
{
  "version": "1",
  "background": {
    "type": "image",
    "url": "URL exacta del archivo si aplica, cadena vacía si no",
    "color": "#1a1a2e",
    "overlay": { "color": "#000000", "opacity": 0.35 }
  },
  "elements": [
    {
      "id": "el-1",
      "type": "text",
      "left": 0,
      "top": 5,
      "width": 100,
      "content": "NOMBRE DEL LOCAL",
      "imageUrl": "",
      "imageHeight": 0,
      "style": {
        "fontFamily": "Poppins",
        "fontSize": "20px",
        "fontWeight": "300",
        "color": "#ffffff",
        "textAlign": "center",
        "letterSpacing": "0.3em",
        "lineHeight": "1.2",
        "textTransform": "uppercase",
        "padding": "8px",
        "background": "transparent",
        "borderRadius": "0"
      }
    }
  ]
}

Reglas:
- Canvas 324×576px: título principal=48-60px, subtítulo=28-38px, cuerpo=18-24px, pie=14px
- Estructura (top %): nombre-local=5, título-fecha=18, artista=42, detalles=62, dirección=86
- CENTRADO HORIZONTAL OBLIGATORIO en TODOS los elementos (texto, imagen, badge, botón): siempre left = (100 - width) / 2. Ejemplos: width=100 → left=0; width=60 → left=20; width=40 → left=30. NUNCA dejes un elemento descentrado.
- Texto: width=100, left=0, textAlign="center" (preferido). Si usas un ancho menor, recalcula left con la fórmula.
- Texto blanco (#ffffff) sobre fondos oscuros; overlay.opacity entre 0.25-0.5 con imagen de fondo
- Badge estilo pill: background="rgba(255,255,255,0.15)", borderRadius="9999px", padding="4px 20px"
- Para logos/imágenes: type="image", imageUrl=URL del archivo, imageHeight=altura en px, y centra con left = (100 - width) / 2
- Crea 4-7 elementos ordenados por top ascendente
- Si hay imagen de fondo disponible: background.type="image", background.url=URL exacta
- Si hay video de fondo: background.type="video", background.url=URL exacta`;

    const text = await this.ai.chat(prompt, {
      maxTokens: 2048,
      ...(tenantId ? { meter: { tenantId, action: 'text' as const } } : {}),
    });
    return this.ai.parseJson<Record<string, unknown>>(text);
  }

  // ─── Templates ────────────────────────────────────────────────────────────

  async findTemplates(tenantId: string): Promise<EventTemplate[]> {
    return this.templateModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async saveTemplate(
    tenantId: string,
    dto: SaveTemplateDto,
  ): Promise<EventTemplate> {
    const tpl = new this.templateModel({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
      design: dto.design,
    });
    return tpl.save();
  }

  async deleteTemplate(id: string, tenantId: string): Promise<void> {
    const tpl = await this.templateModel.findById(id).exec();
    if (!tpl) throw new NotFoundException('Plantilla no encontrada');
    if (tpl.tenantId.toString() !== tenantId) throw new ForbiddenException();
    await this.templateModel.findByIdAndDelete(id).exec();
  }
}
