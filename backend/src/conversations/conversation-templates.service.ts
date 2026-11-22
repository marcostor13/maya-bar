import {
  BadRequestException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WaTemplate } from '../whatsapp-templates/wa-template.schema';
import {
  resolveTemplateSend,
  templateVariableCount,
} from '../whatsapp-templates/template-send';
import { ConversationsService } from './conversations.service';
import { Message } from './message.schema';
import { SendTemplateDto } from './dto/conversation.dto';

/** Plantilla tal como la ve el selector de la bandeja. */
export interface ChatTemplateView {
  _id: string;
  name: string;
  language: string;
  category?: string;
  body: string;
  headerType?: string;
  headerText?: string;
  footer?: string;
  /** Variables `{{n}}` del cuerpo. */
  variables: number;
  /** La cabecera de texto lleva una variable. */
  headerVariable: boolean;
}

const FIELDS = {
  variables: 'las variables',
  headerText: 'el texto de la cabecera',
  headerMediaUrl: 'el archivo de la cabecera',
};

/**
 * Plantillas de WhatsApp desde el chat (HU27): las que se pueden enviar por la
 * cuenta del chat y el envío, que reabre la ventana de 24 h.
 */
@Injectable()
export class ConversationTemplatesService {
  constructor(
    @InjectModel(WaTemplate.name) private templateModel: Model<WaTemplate>,
    private conversations: ConversationsService,
  ) {}

  /** Aprobadas de la cuenta del chat que se pueden mandar sin más datos. */
  async list(id: string, tenantId: string): Promise<ChatTemplateView[]> {
    const conv = await this.conversations.getConversation(id, tenantId);
    if (!(await this.conversations.windowStatus(conv)).applies) return [];
    const list = await this.templateModel
      .find({
        tenantId: conv.tenantId,
        accountId: conv.accountId,
        status: 'APPROVED',
        // La de autenticación lleva un código y un botón que no se rellenan aquí.
        category: { $ne: 'AUTHENTICATION' },
      })
      .sort({ name: 1, language: 1 })
      .lean<WaTemplate[]>()
      .exec();
    // Primero las de utilidad: más baratas que las de marketing.
    return list
      .filter((t) => this.sendable(t))
      .sort(
        (a, b) =>
          Number(b.category === 'UTILITY') - Number(a.category === 'UTILITY'),
      )
      .map((t) => ({
        _id: String(t._id),
        name: t.name,
        language: t.language,
        category: t.category,
        body: t.body ?? '',
        headerType: t.headerType,
        headerText: t.headerText,
        footer: t.footer,
        variables: templateVariableCount(t.body),
        headerVariable:
          t.headerType?.toUpperCase() === 'TEXT' &&
          templateVariableCount(t.headerText) > 0,
      }));
  }

  async send(
    id: string,
    tenantId: string,
    userId: string,
    dto: SendTemplateDto,
  ): Promise<Message> {
    const conv = await this.conversations.getConversation(id, tenantId);
    if (!(await this.conversations.windowStatus(conv)).applies)
      throw new BadRequestException(
        'Las plantillas solo se envían por WhatsApp Cloud API.',
      );
    const template = Types.ObjectId.isValid(dto.templateId)
      ? await this.templateModel
          .findOne({
            _id: new Types.ObjectId(dto.templateId),
            tenantId: conv.tenantId,
            accountId: conv.accountId,
          })
          .exec()
      : null;
    if (!template || !this.sendable(template))
      throw new UnprocessableEntityException(
        'Esa plantilla no existe en la cuenta de WhatsApp de este chat.',
      );
    const resolved = resolveTemplateSend(
      template,
      { variables: dto.variables, headerText: dto.headerText },
      FIELDS,
    );
    return this.conversations.sendTemplateMessage(
      id,
      tenantId,
      userId,
      resolved,
      dto.clientId,
    );
  }

  /** Sin código de autenticación y, si lleva archivo en la cabecera, con el archivo guardado. */
  private sendable(t: {
    category?: string;
    headerType?: string;
    headerMediaUrl?: string;
  }): boolean {
    if (t.category === 'AUTHENTICATION') return false;
    const format = t.headerType?.toUpperCase();
    return !format || format === 'TEXT' || !!t.headerMediaUrl;
  }
}
