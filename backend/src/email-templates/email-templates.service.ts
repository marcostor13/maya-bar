import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  EMAIL_BLOCK_TYPES,
  EmailBlock,
  EmailBlockType,
  EmailDesignDoc,
  EmailTemplate,
} from './email-template.schema';
import {
  CreateEmailTemplateDto,
  GenerateEmailTemplateDto,
  TestEmailTemplateDto,
  UpdateEmailTemplateDto,
} from './dto/email-template.dto';
import { AiService } from '../ai/ai.service';
import { MailService } from '../mail/mail.service';
import { EmailAccountsService } from '../email-accounts/email-accounts.service';
import { EmailTransportService } from '../email-accounts/email-transport.service';
import { htmlToText } from '../campaigns/campaign-sender.service';
import { Tenant } from '../tenants/tenant.schema';
import {
  TOKEN_CATALOG,
  fillTokensHtml,
  fillTokensMultiline,
} from '../shared/contact-tokens';

/** Buzón conectado por el que puede salir una prueba. */
export interface TestSender {
  _id: string;
  label: string;
  email: string;
  isDefault: boolean;
}

export interface GeneratedEmail {
  subject: string;
  preheader: string;
  design: EmailDesignDoc;
}

const TONES: Record<string, string> = {
  amigable: 'amigable y cercano',
  profesional: 'profesional y directo',
  exclusivo: 'exclusivo y premium',
  urgente: 'urgente, con sensación de oportunidad limitada',
  informativo: 'informativo y claro, sin presión de venta',
};

/** Bloques que la IA puede proponer (los demás los añade el usuario a mano). */
const AI_BLOCK_TYPES: EmailBlockType[] = [
  'header',
  'text',
  'button',
  'divider',
  'columns',
  'footer',
];

const MAX_AI_BLOCKS = 12;
/** Tope de pruebas por empresa: no es una vía para enviar correo en masa. */
const MAX_TESTS_PER_WINDOW = 10;
const TEST_WINDOW_MS = 10 * 60 * 1000;

const str = (v: unknown, max = 600): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

@Injectable()
export class EmailTemplatesService {
  /** Pruebas enviadas por empresa en la ventana en curso. */
  private testSends = new Map<string, number[]>();

  constructor(
    @InjectModel(EmailTemplate.name) private model: Model<EmailTemplate>,
    @InjectModel(Tenant.name) private tenantModel: Model<Tenant>,
    private ai: AiService,
    private mail: MailService,
    private emailAccounts: EmailAccountsService,
    private transport: EmailTransportService,
  ) {}

  /** Listado ligero: sin el HTML ni el diseño, que pueden pesar mucho. */
  findAll(tenantId: string): Promise<EmailTemplate[]> {
    return this.model
      .find(
        { tenantId: new Types.ObjectId(tenantId) },
        {
          name: 1,
          subject: 1,
          preheader: 1,
          mode: 1,
          updatedAt: 1,
          createdAt: 1,
        },
      )
      .sort({ updatedAt: -1 })
      .exec();
  }

  async findOne(id: string, tenantId: string): Promise<EmailTemplate> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('Identificador inválido');
    const template = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .exec();
    if (!template) throw new NotFoundException('Plantilla no encontrada');
    return template;
  }

  create(
    tenantId: string,
    userId: string,
    dto: CreateEmailTemplateDto,
  ): Promise<EmailTemplate> {
    return this.model.create({
      name: dto.name.trim(),
      subject: dto.subject?.trim() ?? '',
      preheader: dto.preheader?.trim() ?? '',
      mode: dto.mode,
      design: dto.mode === 'blocks' ? dto.design : undefined,
      html: dto.html,
      tenantId: new Types.ObjectId(tenantId),
      createdBy: new Types.ObjectId(userId),
    });
  }

  async update(
    id: string,
    tenantId: string,
    dto: UpdateEmailTemplateDto,
  ): Promise<EmailTemplate> {
    const template = await this.findOne(id, tenantId);
    if (dto.name !== undefined) template.name = dto.name.trim();
    if (dto.subject !== undefined) template.subject = dto.subject.trim();
    if (dto.preheader !== undefined) template.preheader = dto.preheader.trim();
    if (dto.mode !== undefined) template.mode = dto.mode;
    if (dto.design !== undefined)
      template.design = dto.design as unknown as EmailDesignDoc;
    if (dto.html !== undefined) template.html = dto.html;
    if (template.mode === 'html') template.design = undefined;
    template.markModified('design');
    return template.save();
  }

  async duplicate(
    id: string,
    tenantId: string,
    userId: string,
  ): Promise<EmailTemplate> {
    const source = await this.findOne(id, tenantId);
    return this.model.create({
      name: `${source.name} (copia)`.slice(0, 80),
      subject: source.subject,
      preheader: source.preheader,
      mode: source.mode,
      design: source.design,
      html: source.html,
      tenantId: source.tenantId,
      createdBy: new Types.ObjectId(userId),
    });
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const template = await this.findOne(id, tenantId);
    await this.model.deleteOne({ _id: template._id }).exec();
  }

  /**
   * Propone un email completo como lista de bloques. Devolver bloques (y no
   * HTML) deja el resultado editable en el constructor y evita que el modelo
   * invente marcado que los clientes de correo no pintan.
   */
  async generate(
    tenantId: string,
    dto: GenerateEmailTemplateDto,
  ): Promise<GeneratedEmail> {
    const tenant = await this.tenantModel
      .findById(tenantId, { name: 1 })
      .lean()
      .exec();
    const company = tenant?.name ?? 'la empresa';
    const tone = TONES[dto.tone ?? 'amigable'] ?? TONES.amigable;
    const prompt = `Eres un experto en email marketing en español de Latinoamérica. Diseña un email para "${company}".

Encargo: ${dto.brief}
Tono: ${tone}
${dto.goal ? `Objetivo (qué debe hacer quien lo lee): ${dto.goal}` : ''}
${dto.ctaUrl ? `URL del botón principal: ${dto.ctaUrl}` : 'URL del botón principal: usa exactamente {link}'}

Devuelve SOLO un JSON válido, sin texto antes ni después, con esta forma:
{
  "subject": "asunto de máximo 60 caracteres",
  "preheader": "texto de vista previa de máximo 90 caracteres",
  "blocks": [ ... ]
}

Cada bloque es un objeto con "type" y sus campos. Tipos permitidos:
- {"type":"header","title":"...","subtitle":"..."}
- {"type":"text","content":"..."}  (texto plano; **negrita**, *cursiva* y [texto](url) permitidos; párrafos separados por una línea en blanco)
- {"type":"button","label":"...","href":"..."}
- {"type":"divider"}
- {"type":"columns","items":[{"title":"...","text":"..."},{"title":"...","text":"..."}]}  (2 o 3 elementos, para beneficios o pasos)
- {"type":"footer","text":"..."}

Reglas:
- Entre 5 y 9 bloques. Empieza con un "header" y termina con un "footer".
- Exactamente un "button" principal, con una llamada a la acción concreta.
- Saluda con {primer_nombre} en el primer bloque de texto.
- Variables disponibles: {nombre}, {primer_nombre}, {empresa}, {link}. No inventes otras.
- Sin HTML, sin emojis en el asunto, sin datos de contacto inventados (teléfonos, direcciones, precios que no estén en el encargo).
- El "footer" es una línea breve de despedida de {empresa}; el link de baja se añade solo.`;

    const raw = await this.ai.chat(prompt, { maxTokens: 1800 });
    const parsed = this.ai.parseJson<{
      subject?: unknown;
      preheader?: unknown;
      blocks?: unknown;
    }>(raw);

    const blocks = this.sanitizeBlocks(parsed.blocks, dto.ctaUrl);
    if (!blocks.length)
      throw new BadRequestException(
        'La IA no devolvió un diseño utilizable. Inténtalo de nuevo.',
      );
    return {
      subject: str(parsed.subject, 120),
      preheader: str(parsed.preheader, 160),
      design: {
        settings: dto.brandColor ? { brandColor: dto.brandColor } : {},
        blocks,
      },
    };
  }

  /** Buzones activos de la empresa, el predeterminado primero. */
  async testSenders(tenantId: string): Promise<TestSender[]> {
    const accounts = await this.emailAccounts.findAll(tenantId);
    return accounts
      .filter((a) => a.active)
      .map((a) => ({
        _id: String(a._id),
        label: a.label,
        email: a.email,
        isDefault: a.isDefault,
      }))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  }

  /**
   * Envía la plantilla a un correo con datos de ejemplo. Sale por el buzón
   * conectado que se elija (o el predeterminado); si la empresa no tiene
   * ninguno, por el remitente de la plataforma.
   */
  async sendTest(tenantId: string, dto: TestEmailTemplateDto): Promise<void> {
    const senders = await this.testSenders(tenantId);
    const sender = dto.accountId
      ? senders.find((s) => s._id === dto.accountId)
      : senders[0];
    if (dto.accountId && !sender)
      throw new BadRequestException(
        'Esa cuenta de correo ya no está disponible',
      );

    const now = Date.now();
    const recent = (this.testSends.get(tenantId) ?? []).filter(
      (t) => now - t < TEST_WINDOW_MS,
    );
    if (recent.length >= MAX_TESTS_PER_WINDOW)
      throw new BadRequestException(
        'Has enviado muchas pruebas seguidas. Espera unos minutos.',
      );
    this.testSends.set(tenantId, [...recent, now]);

    const tenant = await this.tenantModel
      .findById(tenantId, { name: 1 })
      .lean()
      .exec();
    const example = Object.fromEntries(
      TOKEN_CATALOG.map((t) => [t.token, t.example]),
    );
    const contact = {
      name: example['{nombre}'],
      email: dto.to,
      phone: example['{telefono}'],
    };
    const ctx = {
      empresa: tenant?.name ?? example['{empresa}'],
      link: 'https://mayacrm.site',
      baja: 'https://mayacrm.site',
    };
    const subject = `[Prueba] ${fillTokensMultiline(dto.subject, contact, ctx)}`;
    const html = fillTokensHtml(dto.html, contact, ctx);
    try {
      const account = sender
        ? await this.emailAccounts.findById(sender._id)
        : null;
      if (account)
        await this.transport.send(
          await this.emailAccounts.smtpConfig(account),
          {
            from: this.emailAccounts.fromHeader(account),
            to: dto.to,
            subject,
            text: htmlToText(html),
            html,
          },
        );
      else
        await this.mail.sendHtml({
          to: dto.to,
          subject,
          html,
          fromName: tenant?.name,
        });
    } catch (err) {
      throw new BadRequestException(
        `No se pudo enviar la prueba: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Solo deja pasar tipos y campos conocidos: la salida del modelo no es de fiar. */
  private sanitizeBlocks(input: unknown, ctaUrl?: string): EmailBlock[] {
    if (!Array.isArray(input)) return [];
    const blocks: EmailBlock[] = [];
    for (const item of input.slice(0, MAX_AI_BLOCKS)) {
      if (!item || typeof item !== 'object') continue;
      const b = item as Record<string, unknown>;
      const type = str(b.type, 20) as EmailBlockType;
      if (!AI_BLOCK_TYPES.includes(type)) continue;
      if (!(EMAIL_BLOCK_TYPES as readonly string[]).includes(type)) continue;

      let props: Record<string, unknown> | null = null;
      switch (type) {
        case 'header':
          if (str(b.title))
            props = {
              title: str(b.title, 120),
              subtitle: str(b.subtitle, 200),
            };
          break;
        case 'text':
          if (str(b.content, 3000)) props = { content: str(b.content, 3000) };
          break;
        case 'button':
          if (str(b.label))
            props = {
              label: str(b.label, 60),
              href: ctaUrl || str(b.href, 500) || '{link}',
            };
          break;
        case 'divider':
          props = {};
          break;
        case 'columns': {
          const items = (Array.isArray(b.items) ? b.items : [])
            .slice(0, 3)
            .map((raw) => {
              const it = (raw ?? {}) as Record<string, unknown>;
              return { title: str(it.title, 80), text: str(it.text, 400) };
            })
            .filter((it) => it.title || it.text);
          if (items.length >= 2) props = { items };
          break;
        }
        case 'footer':
          props = { text: str(b.text, 300), showUnsubscribe: true };
          break;
      }
      if (props) blocks.push({ id: randomUUID(), type, props });
    }
    return blocks;
  }
}
