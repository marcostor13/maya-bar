import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Injectable,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiKeyGuard, type ApiKeyReq } from './api-key.guard';
import { ApiAccessService } from './api-access.service';
import { ApiCrmService } from './api-crm.service';
import {
  ApiHooksService,
  HOOK_EVENTS,
  HOOK_SAMPLES,
  type HookEvent,
} from './api-hooks.service';
import { buildOpenApi } from './openapi';
import {
  ApiListQueryDto,
  ApiTagsDto,
  ApiWhatsappTemplateDto,
  CreateApiLeadDto,
  SubscribeHookDto,
  UpdateApiContactDto,
  UpsertApiContactDto,
} from './dto/api-crm.dto';

/** Solo claves de tipo "automatización" (Zapier, Make, servidor) usan la API del CRM. */
@Injectable()
export class AutomationKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<ApiKeyReq>();
    if (req.apiAccess?.purpose !== 'automation')
      throw new ForbiddenException(
        'Esta clave es para tu web. Crea una clave de tipo "Automatización (Zapier / Make)" en Ajustes → Integraciones.',
      );
    return true;
  }
}

/** Especificación pública de la API (HU65). Sin clave: la leen Zapier, Make y quien integre. */
@Controller('api/v1')
export class ApiDocsController {
  @Get('openapi.json')
  spec() {
    return buildOpenApi();
  }
}

/** API del CRM para Zapier y Make (HU65). */
@Controller('api/v1')
@UseGuards(ApiKeyGuard, AutomationKeyGuard)
export class ApiCrmController {
  constructor(
    private crm: ApiCrmService,
    private hooks: ApiHooksService,
    private accesses: ApiAccessService,
  ) {}

  /** Prueba de conexión de Zapier/Make. */
  @Get('me')
  me(@Request() req: ApiKeyReq) {
    const a = req.apiAccess;
    return {
      accessId: String(a._id),
      name: a.name,
      tenantId: String(a.tenantId),
      channel: a.channel,
      account: a.accountLabel,
    };
  }

  @Get('contacts')
  listContacts(@Request() req: ApiKeyReq, @Query() q: ApiListQueryDto) {
    return this.crm.listContacts(req.apiAccess, q);
  }

  @Get('contacts/:id')
  getContact(@Request() req: ApiKeyReq, @Param('id') id: string) {
    return this.crm.getContact(req.apiAccess, id);
  }

  @Post('contacts')
  async upsertContact(
    @Request() req: ApiKeyReq,
    @Body() dto: UpsertApiContactDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.accesses.consumeQuota(req.apiAccess);
    const out = await this.crm.upsertContact(req.apiAccess, dto);
    res.status(out.created ? 201 : 200);
    return out;
  }

  @Patch('contacts/:id')
  async updateContact(
    @Request() req: ApiKeyReq,
    @Param('id') id: string,
    @Body() dto: UpdateApiContactDto,
  ) {
    await this.accesses.consumeQuota(req.apiAccess);
    return this.crm.updateContact(req.apiAccess, id, dto);
  }

  @Post('contacts/:id/tags')
  @HttpCode(200)
  async addTags(
    @Request() req: ApiKeyReq,
    @Param('id') id: string,
    @Body() dto: ApiTagsDto,
  ) {
    await this.accesses.consumeQuota(req.apiAccess);
    return this.crm.addTags(req.apiAccess, id, dto.tags);
  }

  @Get('leads')
  listLeads(@Request() req: ApiKeyReq, @Query() q: ApiListQueryDto) {
    return this.crm.listLeads(req.apiAccess, q);
  }

  @Post('leads')
  async createLead(@Request() req: ApiKeyReq, @Body() dto: CreateApiLeadDto) {
    await this.accesses.consumeQuota(req.apiAccess);
    return this.crm.createLead(req.apiAccess, dto);
  }

  @Post('whatsapp/templates')
  async sendTemplate(
    @Request() req: ApiKeyReq,
    @Body() dto: ApiWhatsappTemplateDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('idempotency-key') key?: string,
  ) {
    const { message, duplicate } = await this.crm.sendWhatsappTemplate(
      req.apiAccess,
      dto,
      key,
    );
    res.status(duplicate ? 200 : 201);
    return message;
  }

  // ── REST hooks ────────────────────────────────────────────────────────

  @Get('hooks')
  listHooks(@Request() req: ApiKeyReq) {
    return this.hooks.list(req.apiAccess);
  }

  @Post('hooks')
  subscribe(@Request() req: ApiKeyReq, @Body() dto: SubscribeHookDto) {
    return this.hooks.subscribe(req.apiAccess, dto.event, dto.targetUrl);
  }

  @Delete('hooks/:id')
  unsubscribe(@Request() req: ApiKeyReq, @Param('id') id: string) {
    return this.hooks.unsubscribe(req.apiAccess, id);
  }

  /** Ejemplo de la carga de un disparador, para mapear campos (performList de Zapier). */
  @Get('hooks/samples/:event')
  sample(@Param('event') event: string) {
    if (!HOOK_EVENTS.includes(event as HookEvent)) return [];
    return [
      {
        id: 'sample',
        event,
        occurredAt: new Date().toISOString(),
        data: HOOK_SAMPLES[event as HookEvent],
      },
    ];
  }
}
