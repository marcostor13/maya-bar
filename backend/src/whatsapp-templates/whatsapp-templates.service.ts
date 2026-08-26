import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WaTemplate, TemplateStatus } from './wa-template.schema';
import {
  CreateWaTemplateDto,
  TemplateButtonDto,
  TemplateHeaderDto,
  UpdateWaTemplateDto,
} from './dto/wa-template.dto';
import { MetaGraphClient, MetaApiError } from '../shared/meta-graph.client';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { WhatsAppAccount } from '../whatsapp-accounts/whatsapp-account.schema';

interface MetaComponent {
  type: string;
  format?: string;
  text?: string;
  example?: Record<string, unknown>;
  buttons?: Record<string, unknown>[];
  [key: string]: unknown;
}

interface MetaTemplate {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
  rejected_reason?: string;
  quality_score?: { score?: string };
  components?: MetaComponent[];
}

/** Cuenta lista para operar plantillas: Cloud API con token y WABA. */
interface TemplateAccount {
  account: WhatsAppAccount;
  token: string;
  wabaId: string;
}

@Injectable()
export class WhatsAppTemplatesService {
  private readonly logger = new Logger(WhatsAppTemplatesService.name);

  constructor(
    @InjectModel(WaTemplate.name) private model: Model<WaTemplate>,
    private accounts: WhatsAppAccountsService,
    private graph: MetaGraphClient,
    private config: ConfigService,
  ) {}

  /** Cuentas del tenant que pueden tener plantillas (Cloud API con WABA y token). */
  async listAccounts(tenantId: string) {
    const accounts = await this.accounts.findAll(tenantId);
    return accounts
      .filter((a) => a.provider === 'cloudapi')
      .map((a) => ({
        _id: String(a._id),
        label: a.label,
        phoneNumber: a.phoneNumber,
        wabaId: a.waBusinessAccountId,
        active: a.active,
        isDefault: !!a.isDefault,
        /** false cuando falta el token o el WABA: la UI lo avisa sin llamar a Meta. */
        ready: !!(a.waAccessToken?.trim() && a.waBusinessAccountId?.trim()),
      }));
  }

  async findAll(tenantId: string, accountId?: string): Promise<WaTemplate[]> {
    const query: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
    };
    if (accountId && Types.ObjectId.isValid(accountId))
      query.accountId = new Types.ObjectId(accountId);
    return this.model.find(query).sort({ name: 1 }).exec();
  }

  /** Trae de Meta las plantillas del WABA de la cuenta y refresca el espejo local. */
  async sync(tenantId: string, accountId: string): Promise<WaTemplate[]> {
    const { token, wabaId } = await this.resolveAccount(tenantId, accountId);
    const data = await this.metaRequest<{ data?: MetaTemplate[] }>(() =>
      this.graph.get(`/${wabaId}/message_templates`, {
        accessToken: token,
        params: {
          limit: '200',
          fields:
            'id,name,category,language,status,components,rejected_reason,quality_score',
        },
      }),
    );

    const tid = new Types.ObjectId(tenantId);
    const aid = new Types.ObjectId(accountId);
    const seen: string[] = [];
    const results: WaTemplate[] = [];

    for (const t of data.data ?? []) {
      seen.push(t.id);
      const doc = await this.model
        .findOneAndUpdate(
          { accountId: aid, metaId: t.id },
          {
            tenantId: tid,
            accountId: aid,
            metaId: t.id,
            ...this.denormalize(t),
          },
          { upsert: true, new: true },
        )
        .exec();
      results.push(doc);
    }

    // Lo borrado en Meta desaparece del espejo local.
    await this.model
      .deleteMany({ accountId: aid, metaId: { $nin: seen } })
      .exec();

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(
    tenantId: string,
    dto: CreateWaTemplateDto,
  ): Promise<WaTemplate> {
    const { token, wabaId } = await this.resolveAccount(
      tenantId,
      dto.accountId,
    );
    const components = await this.buildComponents(dto, token);

    const created = await this.metaRequest<{ id: string; status?: string }>(
      () =>
        this.graph.post(`/${wabaId}/message_templates`, {
          accessToken: token,
          json: {
            name: dto.name,
            category: dto.category,
            language: dto.language,
            allow_category_change: dto.allowCategoryChange ?? true,
            components,
          },
        }),
    );

    return this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      accountId: new Types.ObjectId(dto.accountId),
      metaId: created.id,
      name: dto.name,
      category: dto.category,
      language: dto.language,
      status: (created.status as TemplateStatus) ?? 'PENDING',
      ...this.denormalizeComponents(components),
    });
  }

  /**
   * Meta solo deja editar los componentes (y la categoría mientras no esté
   * aprobada). El nombre y el idioma son inmutables: para cambiarlos hay que
   * crear otra plantilla.
   */
  async update(
    tenantId: string,
    id: string,
    dto: UpdateWaTemplateDto,
  ): Promise<WaTemplate> {
    const template = await this.getOwned(tenantId, id);
    const { token } = await this.resolveAccount(
      tenantId,
      String(template.accountId),
    );
    const components = await this.buildComponents(dto, token);

    const payload: Record<string, unknown> = { components };
    if (dto.category && template.status !== 'APPROVED')
      payload.category = dto.category;

    await this.metaRequest(() =>
      this.graph.post(`/${template.metaId}`, {
        accessToken: token,
        json: payload,
      }),
    );

    Object.assign(template, this.denormalizeComponents(components));
    if (payload.category) template.category = dto.category!;
    // Toda edición vuelve a pasar por revisión de Meta.
    template.status = 'PENDING';
    template.rejectedReason = undefined;
    return template.save();
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const template = await this.getOwned(tenantId, id);
    const { token, wabaId } = await this.resolveAccount(
      tenantId,
      String(template.accountId),
    );
    await this.metaRequest(() =>
      this.graph.delete(`/${wabaId}/message_templates`, {
        accessToken: token,
        params: { hsm_id: template.metaId, name: template.name },
      }),
    ).catch((err) => {
      // Si en Meta ya no existe, igual limpiamos el espejo local.
      this.logger.warn(
        `No se pudo borrar la plantilla ${template.name} en Meta: ${String(err)}`,
      );
    });
    await this.model.findByIdAndDelete(template._id).exec();
  }

  // ------------------------------------------------------------------
  // Componentes
  // ------------------------------------------------------------------

  /** Traduce el formulario a los `components` que espera Graph. */
  private async buildComponents(
    dto: CreateWaTemplateDto | UpdateWaTemplateDto,
    token: string,
  ): Promise<MetaComponent[]> {
    const components: MetaComponent[] = [];

    if (dto.header) {
      components.push(await this.buildHeader(dto.header, token));
    }

    const body: MetaComponent = { type: 'BODY', text: dto.body };
    const examples = (dto.bodyExamples ?? []).filter((v) => v?.trim());
    const placeholders = this.countPlaceholders(dto.body);
    if (placeholders > 0) {
      if (examples.length !== placeholders)
        throw new BadRequestException(
          `El cuerpo usa ${placeholders} variable(s); indica un ejemplo para cada una`,
        );
      body.example = { body_text: [examples] };
    }
    components.push(body);

    if (dto.footer?.trim())
      components.push({ type: 'FOOTER', text: dto.footer.trim() });

    const buttons = (dto.buttons ?? []).map((b) => this.buildButton(b));
    if (buttons.length) components.push({ type: 'BUTTONS', buttons });

    return components;
  }

  private async buildHeader(
    header: TemplateHeaderDto,
    token: string,
  ): Promise<MetaComponent> {
    if (header.format === 'TEXT') {
      const text = header.text?.trim();
      if (!text)
        throw new BadRequestException('La cabecera de texto está vacía');
      const component: MetaComponent = {
        type: 'HEADER',
        format: 'TEXT',
        text,
      };
      const placeholders = this.countPlaceholders(text);
      if (placeholders > 1)
        throw new BadRequestException(
          'La cabecera admite como máximo una variable',
        );
      if (placeholders === 1) {
        if (!header.example?.trim())
          throw new BadRequestException(
            'Indica un ejemplo para la variable de la cabecera',
          );
        component.example = { header_text: [header.example.trim()] };
      }
      return component;
    }

    if (header.format === 'LOCATION')
      return { type: 'HEADER', format: 'LOCATION' };

    // IMAGE | VIDEO | DOCUMENT — Meta exige un handle de la Resumable Upload API.
    const handle =
      header.handle?.trim() ||
      (header.mediaUrl
        ? await this.uploadHeaderMedia(header.mediaUrl, token)
        : '');
    if (!handle)
      throw new BadRequestException(
        'Sube un archivo de ejemplo para la cabecera multimedia',
      );
    return {
      type: 'HEADER',
      format: header.format,
      example: { header_handle: [handle] },
    };
  }

  private buildButton(b: TemplateButtonDto): Record<string, unknown> {
    switch (b.type) {
      case 'QUICK_REPLY': {
        if (!b.text?.trim())
          throw new BadRequestException('Falta el texto del botón');
        return { type: 'QUICK_REPLY', text: b.text.trim() };
      }
      case 'URL': {
        if (!b.text?.trim() || !b.url?.trim())
          throw new BadRequestException('El botón de URL necesita texto y URL');
        const button: Record<string, unknown> = {
          type: 'URL',
          text: b.text.trim(),
          url: b.url.trim(),
        };
        if (this.countPlaceholders(b.url) > 0) {
          if (!b.urlExample?.trim())
            throw new BadRequestException(
              'Indica un ejemplo para la variable de la URL',
            );
          button.example = [b.urlExample.trim()];
        }
        return button;
      }
      case 'PHONE_NUMBER': {
        if (!b.text?.trim() || !b.phoneNumber?.trim())
          throw new BadRequestException(
            'El botón de llamada necesita texto y teléfono',
          );
        return {
          type: 'PHONE_NUMBER',
          text: b.text.trim(),
          phone_number: b.phoneNumber.trim(),
        };
      }
      case 'COPY_CODE': {
        if (!b.example?.trim())
          throw new BadRequestException(
            'El botón de copiar código necesita un código de ejemplo',
          );
        return { type: 'COPY_CODE', example: b.example.trim() };
      }
    }
  }

  /**
   * Sube el archivo de ejemplo de una cabecera multimedia con la Resumable
   * Upload API y devuelve el handle que Meta pide en `example.header_handle`.
   */
  private async uploadHeaderMedia(
    mediaUrl: string,
    token: string,
  ): Promise<string> {
    const appId = this.config.get<string>('FACEBOOK_APP_ID');
    if (!appId)
      throw new BadRequestException(
        'FACEBOOK_APP_ID no está configurado en el servidor: no se puede subir el archivo de la cabecera',
      );

    const res = await fetch(mediaUrl);
    if (!res.ok)
      throw new BadRequestException(
        'No se pudo descargar el archivo de la cabecera',
      );
    const bytes = new Uint8Array(await res.arrayBuffer());
    const fileType =
      res.headers.get('content-type') ?? 'application/octet-stream';

    const session = await this.metaRequest<{ id: string }>(() =>
      this.graph.post(`/${appId}/uploads`, {
        accessToken: token,
        params: {
          file_length: String(bytes.byteLength),
          file_type: fileType,
        },
      }),
    );
    const uploaded = await this.metaRequest<{ h: string }>(() =>
      this.graph.postBinary(`/${session.id}`, bytes, { accessToken: token }),
    );
    return uploaded.h;
  }

  /** Cuenta las variables {{1}}, {{2}}… de un texto. */
  private countPlaceholders(text = ''): number {
    const found = new Set(
      [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1]),
    );
    return found.size;
  }

  // ------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------

  private denormalize(t: MetaTemplate) {
    return {
      name: t.name,
      category: t.category,
      language: t.language,
      status: t.status as TemplateStatus,
      rejectedReason: t.rejected_reason,
      qualityScore: t.quality_score?.score,
      ...this.denormalizeComponents(t.components ?? []),
    };
  }

  private denormalizeComponents(components: MetaComponent[]) {
    const header = components.find((c) => c.type === 'HEADER');
    return {
      headerType: header?.format,
      headerText: header?.text,
      body: components.find((c) => c.type === 'BODY')?.text ?? '',
      footer: components.find((c) => c.type === 'FOOTER')?.text,
      components: components as unknown as Record<string, unknown>[],
    };
  }

  private async getOwned(tenantId: string, id: string): Promise<WaTemplate> {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Plantilla no encontrada');
    const template = await this.model
      .findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
      })
      .exec();
    if (!template) throw new NotFoundException('Plantilla no encontrada');
    return template;
  }

  /** Valida que la cuenta sea del tenant y tenga credenciales de Cloud API. */
  private async resolveAccount(
    tenantId: string,
    accountId: string,
  ): Promise<TemplateAccount> {
    if (!accountId)
      throw new BadRequestException('Elige una cuenta de WhatsApp');
    const account = await this.accounts.findOne(accountId, tenantId);
    if (account.provider !== 'cloudapi')
      throw new BadRequestException(
        'Las plantillas solo existen en cuentas de WhatsApp Cloud API',
      );
    const token = account.waAccessToken?.trim();
    const wabaId = account.waBusinessAccountId?.trim();
    if (!token || !wabaId)
      throw new BadRequestException(
        `La cuenta "${account.label}" no tiene Access Token o WABA ID: complétalos en Configuración → WhatsApp`,
      );
    return { account, token, wabaId };
  }

  /** Traduce errores de Meta a BadRequestException conservando status y mensaje. */
  private async metaRequest<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (err) {
      if (err instanceof MetaApiError)
        throw new BadRequestException(`Meta API ${err.status}: ${err.message}`);
      throw err;
    }
  }
}
