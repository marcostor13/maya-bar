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
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ModuleGuard, RouteAction } from '../roles/module.guard';
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
  DoNotContactDto,
  BlockContactDto,
  BulkDeleteDto,
  ManualBlockDto,
  ComposeEmailDto,
  ScheduleMessageDto,
  ConversationTaskDto,
  CompleteTaskDto,
  TakeConversationDto,
  AssignConversationDto,
} from './dto/conversation.dto';
import { ConversationAssignmentService } from './conversation-assignment.service';
import { InboxToolsService } from './inbox-tools.service';
import { ConversationTrashService } from './conversation-trash.service';
import { BlockedContactsService } from './blocked-contacts.service';

@Controller('conversations')
@UseGuards(JwtAuthGuard, ModuleGuard('inbox'))
export class ConversationsController {
  constructor(
    private service: ConversationsService,
    private tools: InboxToolsService,
    private assignment: ConversationAssignmentService,
    private trash: ConversationTrashService,
    private blocks: BlockedContactsService,
  ) {}

  /** Quién actúa, con su nombre para la papelera y los bloqueos. */
  private async actor(req: AuthReq) {
    return {
      userId: req.user.userId,
      name: await this.assignment.nameOf(req.user.userId),
    };
  }

  // ── Permisos para la interfaz ──

  @Get('permissions')
  async permissions(@Request() req: AuthReq) {
    return {
      canDelete: await this.trash.canDelete(req.user.tenantId, req.user.role),
    };
  }

  // ── Papelera (rutas fijas antes de `:id`) ──

  @Get('trash')
  async trashList(@Request() req: AuthReq) {
    await this.trash.assertCanDelete(req.user.tenantId, req.user.role);
    return this.trash.list(req.user.tenantId);
  }

  @Post('trash/:id/restore')
  async restore(@Param('id') id: string, @Request() req: AuthReq) {
    await this.trash.assertCanDelete(req.user.tenantId, req.user.role);
    return this.trash.restore(req.user.tenantId, id, await this.actor(req));
  }

  @Delete('trash/:id')
  async purge(@Param('id') id: string, @Request() req: AuthReq) {
    await this.trash.assertCanDelete(req.user.tenantId, req.user.role);
    return this.trash.purge(req.user.tenantId, id, await this.actor(req));
  }

  @Delete('trash')
  async emptyTrash(@Request() req: AuthReq) {
    await this.trash.assertCanDelete(req.user.tenantId, req.user.role);
    return this.trash.empty(req.user.tenantId, await this.actor(req));
  }

  /**
   * Elimina (a la papelera) una o varias conversaciones. Con `block`, antes
   * bloquea a cada contacto ("Eliminar y bloquear").
   */
  @Post('bulk-delete')
  async bulkDelete(@Body() dto: BulkDeleteDto, @Request() req: AuthReq) {
    await this.trash.assertCanDelete(req.user.tenantId, req.user.role);
    const actor = await this.actor(req);
    let blocked = 0;
    const channelErrors: string[] = [];
    if (dto.block) {
      assertRole(req.user.role, CRM_ROLES);
      for (const id of dto.ids) {
        const res = await this.service
          .setBlocked(
            id,
            req.user.tenantId,
            req.user.userId,
            true,
            dto.reason,
            {
              allChannels: dto.allChannels,
              userName: actor.name,
            },
          )
          .catch((err: unknown) => {
            if (err instanceof NotFoundException) return null;
            throw err;
          });
        if (!res) continue;
        blocked++;
        if (res.channelError) channelErrors.push(res.channelError);
      }
    }
    const res = await this.trash.trash(req.user.tenantId, dto.ids, actor);
    return {
      ...res,
      blocked,
      // Quedaron bloqueados en la plataforma, pero WhatsApp no lo aceptó.
      ...(channelErrors.length ? { channelErrors } : {}),
    };
  }

  // ── Contactos bloqueados ──

  @Get('blocked')
  blockedList(@Request() req: AuthReq, @Query('q') q?: string) {
    assertRole(req.user.role, CRM_ROLES);
    return this.blocks.list(req.user.tenantId, q);
  }

  @Post('blocked')
  async blockManual(@Body() dto: ManualBlockDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    const actor = await this.actor(req);
    return this.service.blockManual(req.user.tenantId, req.user.userId, {
      ...dto,
      userName: actor.name,
    });
  }

  // Desbloquear y cancelar un programado son editar, no eliminar conversaciones.
  @RouteAction('edit')
  @Delete('blocked/:id')
  unblockEntry(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.unblockEntry(req.user.tenantId, id);
  }

  @Get()
  async list(
    @Request() req: AuthReq,
    @Query('channel') channel?: string,
    @Query('accountId') accountId?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('unread') unread?: string,
    @Query('agentId') agentId?: string,
    @Query('tags') tags?: string,
    @Query('blocked') blocked?: string,
    @Query('assigned') assigned?: string,
    @Query('campaign') campaign?: string,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    const tenantId = req.user.tenantId;
    const tagList = (tags ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const [agent, customerIds] = await Promise.all([
      agentId && Types.ObjectId.isValid(agentId)
        ? this.tools.agentScope(tenantId, agentId)
        : undefined,
      tagList.length
        ? this.tools.customerIdsByTags(tenantId, tagList)
        : undefined,
    ]);
    return this.service.listConversations(tenantId, {
      channel,
      accountId,
      status,
      q,
      unread: unread === 'true',
      agent,
      customerIds,
      blocked: blocked === 'true',
      assigned:
        assigned && ['me', 'unassigned', 'ai', 'others'].includes(assigned)
          ? { mode: assigned, userId: req.user.userId }
          : undefined,
      campaign,
    });
  }

  /** Agentes IA del tenant, para filtrar la bandeja por agente. */
  @Get('agents')
  agents(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.tools.listAgents(req.user.tenantId);
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

  /** Campañas (anuncios de Meta y campañas de Maya) de las que vienen los chats. */
  @Get('campaigns')
  campaigns(@Request() req: AuthReq, @Query('channel') channel?: string) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.listCampaigns(req.user.tenantId, channel);
  }

  /** Vendedores con acceso a la bandeja, para asignar chats. */
  @Get('team')
  team(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.assignment.team(req.user.tenantId);
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

  /** Correo nuevo a un destinatario (crea la conversación si no existe). */
  @Post('email/compose')
  compose(@Body() dto: ComposeEmailDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.composeEmail(req.user.tenantId, req.user.userId, dto);
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
    return this.service.sendManual(
      id,
      req.user.tenantId,
      req.user.userId,
      dto,
      { background: true },
    );
  }

  /** Mensajes programados pendientes (o fallidos) del chat. */
  @Get(':id/scheduled')
  scheduled(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.tools.listScheduled(id, req.user.tenantId);
  }

  @Post(':id/scheduled')
  schedule(
    @Param('id') id: string,
    @Body() dto: ScheduleMessageDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.tools.schedule(id, req.user.tenantId, req.user.userId, dto);
  }

  // Desbloquear y cancelar un programado son editar, no eliminar conversaciones.
  @RouteAction('edit')
  @Delete(':id/scheduled/:scheduledId')
  cancelScheduled(
    @Param('id') id: string,
    @Param('scheduledId') scheduledId: string,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.tools.cancelScheduled(id, scheduledId, req.user.tenantId);
  }

  /** Tareas pendientes del contacto del chat (en sus oportunidades abiertas). */
  @Get(':id/tasks')
  tasks(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.tools.listTasks(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
    );
  }

  /** Acceso directo del chat: volver a llamar, reunión, enviar correo… */
  @Post(':id/tasks')
  createTask(
    @Param('id') id: string,
    @Body() dto: ConversationTaskDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.tools.createTask(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto,
    );
  }

  @Patch(':id/tasks/:leadId/:taskId')
  completeTask(
    @Param('id') id: string,
    @Param('leadId') leadId: string,
    @Param('taskId') taskId: string,
    @Body() dto: CompleteTaskDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.tools.completeTask(
      id,
      leadId,
      taskId,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto.done,
    );
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

  /**
   * Da de baja (o reactiva) al contacto en la lista de no contactar. Deja de
   * entrar en campañas y el agente IA deja de responderle.
   */
  @Patch(':id/do-not-contact')
  doNotContact(
    @Param('id') id: string,
    @Body() dto: DoNotContactDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.setDoNotContact(
      id,
      req.user.tenantId,
      req.user.userId,
      dto.blocked,
      dto.reason,
    );
  }

  /**
   * Bloquea (o desbloquea) el contacto del chat: sus mensajes se descartan, no
   * se le puede escribir y, en WhatsApp, queda bloqueado también en el canal.
   */
  @Patch(':id/block')
  async block(
    @Param('id') id: string,
    @Body() dto: BlockContactDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.setBlocked(
      id,
      req.user.tenantId,
      req.user.userId,
      dto.blocked,
      dto.reason,
      {
        allChannels: dto.allChannels,
        userName: await this.assignment.nameOf(req.user.userId),
      },
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

  /** Tomar el chat. `force` (supervisores) se lo quita a quien lo tenga. */
  @Post(':id/take')
  take(
    @Param('id') id: string,
    @Body() dto: TakeConversationDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.assignment.take(
      id,
      req.user.tenantId,
      { userId: req.user.userId, role: req.user.role },
      dto.force === true,
    );
  }

  /** Devolver el chat a la cola sin asignar. */
  @Post(':id/release')
  release(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.assignment.release(id, req.user.tenantId, {
      userId: req.user.userId,
      role: req.user.role,
    });
  }

  /** Asignar o transferir el chat a otra persona del equipo. */
  @Post(':id/assign')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignConversationDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.assignment.assign(
      id,
      req.user.tenantId,
      { userId: req.user.userId, role: req.user.role },
      dto.userId,
    );
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
    return this.service.setAutoReply(id, req.user.tenantId, dto.enabled, {
      userId: req.user.userId,
      role: req.user.role,
    });
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

  /** Manda la conversación a la papelera (se puede restaurar 30 días). */
  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: AuthReq) {
    await this.trash.assertCanDelete(req.user.tenantId, req.user.role);
    const res = await this.trash.trash(
      req.user.tenantId,
      [id],
      await this.actor(req),
    );
    if (!res.trashed) throw new NotFoundException('Conversación no encontrada');
    return { deleted: true, trashed: true };
  }
}
