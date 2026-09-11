import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ModuleGuard } from '../roles/module.guard';
import { assertRole, CRM_ROLES, type AuthReq } from '../auth/permissions';
import { LeadsService } from './leads.service';
import {
  CreateActivityDto,
  CreateLeadDto,
  MoveLeadDto,
  UpdateActivityDto,
  UpdateLeadDto,
} from './dto/lead.dto';

@Controller('leads')
@UseGuards(JwtAuthGuard, ModuleGuard('leads'))
export class LeadsController {
  constructor(private service: LeadsService) {}

  /** Catálogo de etapas: lo consume el tablero para pintar las columnas. */
  @Get('stages')
  stages(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.stages();
  }

  @Get('board')
  board(
    @Request() req: AuthReq,
    @Query('ownerId') ownerId?: string,
    @Query('q') q?: string,
    @Query('tag') tag?: string,
    @Query('overdue') overdue?: string,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.board(
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      {
        ownerId,
        q,
        tag,
        overdue: overdue === 'true',
      },
    );
  }

  @Get('stats')
  stats(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.stats(
      req.user.tenantId,
      req.user.userId,
      req.user.role,
    );
  }

  /** Tareas pendientes con vencimiento, ordenadas por fecha. */
  @Get('agenda')
  agenda(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.agenda(
      req.user.tenantId,
      req.user.userId,
      req.user.role,
    );
  }

  /** Usuarios del tenant que pueden llevar el seguimiento. */
  @Get('owners')
  owners(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.owners(req.user.tenantId);
  }

  /** Contactos del tenant para el selector del alta rápida. */
  @Get('customers')
  customers(@Request() req: AuthReq, @Query('q') q?: string) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.searchCustomers(req.user.tenantId, q ?? '');
  }

  @Get()
  list(
    @Request() req: AuthReq,
    @Query('stage') stage?: string,
    @Query('status') status?: string,
    @Query('ownerId') ownerId?: string,
    @Query('q') q?: string,
    @Query('tag') tag?: string,
    @Query('overdue') overdue?: string,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.list(
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      {
        stage,
        status,
        ownerId,
        q,
        tag,
        overdue: overdue === 'true',
      },
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.findOne(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
    );
  }

  @Get(':id/activities')
  activities(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.listActivities(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
    );
  }

  @Post()
  create(@Body() dto: CreateLeadDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.create(
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto,
    );
  }

  @Post(':id/activities')
  addActivity(
    @Param('id') id: string,
    @Body() dto: CreateActivityDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.addActivity(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto,
    );
  }

  @Patch(':id/move')
  move(
    @Param('id') id: string,
    @Body() dto: MoveLeadDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.move(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto,
    );
  }

  @Patch(':id/activities/:activityId')
  updateActivity(
    @Param('id') id: string,
    @Param('activityId') activityId: string,
    @Body() dto: UpdateActivityDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.updateActivity(
      id,
      activityId,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto,
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.update(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto,
    );
  }

  @Delete(':id/activities/:activityId')
  removeActivity(
    @Param('id') id: string,
    @Param('activityId') activityId: string,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.removeActivity(
      id,
      activityId,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.remove(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
    );
  }
}
