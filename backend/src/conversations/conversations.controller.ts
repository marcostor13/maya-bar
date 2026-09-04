import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { ModuleGuard } from '../roles/module.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertRole, CRM_ROLES, type AuthReq } from '../auth/permissions';
import { ConversationsService } from './conversations.service';
import {
  SendMessageDto,
  AutoReplyDto,
  StatusDto,
  SaveContactDto,
  SetTagsDto,
  SendToPipelineDto,
} from './dto/conversation.dto';

@Controller('conversations')
@UseGuards(JwtAuthGuard, ModuleGuard('inbox'))
export class ConversationsController {
  constructor(private service: ConversationsService) {}

  @Get()
  list(
    @Request() req: AuthReq,
    @Query('channel') channel?: string,
    @Query('accountId') accountId?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('unread') unread?: string,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.listConversations(req.user.tenantId, {
      channel,
      accountId,
      status,
      q,
      unread: unread === 'true',
    });
  }

  /** Cuentas conectadas (WhatsApp + Instagram) para el selector de la bandeja. */
  @Get('accounts')
  accounts(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.listAccounts(req.user.tenantId);
  }

  /** Etiquetas ya usadas en el tenant, para sugerirlas al clasificar. */
  @Get('tags')
  tags(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.availableTags(req.user.tenantId);
  }

  @Get('unread-count')
  unreadCount(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.unreadTotal(req.user.tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.getConversation(id, req.user.tenantId);
  }

  @Get(':id/messages')
  messages(
    @Param('id') id: string,
    @Request() req: AuthReq,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.listMessages(id, req.user.tenantId, {
      before,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post(':id/messages')
  send(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    if (!dto.text?.trim() && !dto.mediaUrl)
      throw new BadRequestException('El mensaje está vacío');
    return this.service.sendManual(id, req.user.tenantId, req.user.userId, dto);
  }

  /** Guarda a quien escribe como contacto del CRM (y opcionalmente crea lead). */
  @Post(':id/contact')
  saveContact(
    @Param('id') id: string,
    @Body() dto: SaveContactDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.saveContact(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto,
    );
  }

  /** Clasifica el chat: fija las etiquetas de su contacto (lo crea si hace falta). */
  @Patch(':id/tags')
  setTags(
    @Param('id') id: string,
    @Body() dto: SetTagsDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.setTags(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto.tags,
    );
  }

  /** Manda el chat al embudo: crea la oportunidad enlazada a la conversación. */
  @Post(':id/lead')
  sendToPipeline(
    @Param('id') id: string,
    @Body() dto: SendToPipelineDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.sendToPipeline(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto,
    );
  }

  /** Contacto vinculado y sus oportunidades, para el panel del chat. */
  @Get(':id/contact')
  crmCard(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.crmCard(id, req.user.tenantId);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.markRead(id, req.user.tenantId);
  }

  /** Enciende/apaga la respuesta automática del agente en esta conversación. */
  @Patch(':id/auto-reply')
  autoReply(
    @Param('id') id: string,
    @Body() dto: AutoReplyDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    if (typeof dto.enabled !== 'boolean')
      throw new BadRequestException('Falta el valor de "enabled"');
    return this.service.setAutoReply(
      id,
      req.user.tenantId,
      dto.enabled,
      req.user.userId,
    );
  }

  @Patch(':id/status')
  status(
    @Param('id') id: string,
    @Body() dto: StatusDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    if (dto.status !== 'open' && dto.status !== 'closed')
      throw new BadRequestException('Estado inválido');
    return this.service.setStatus(id, req.user.tenantId, dto.status);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.remove(id, req.user.tenantId);
  }
}
