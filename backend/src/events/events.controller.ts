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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertRole, EVENT_ROLES, MANAGE_ROLES, type AuthReq } from '../auth/permissions';
import { EventsService } from './events.service';
import {
  CreateEventDto,
  UpdateEventDto,
  RegisterEventDto,
  ShareEventDto,
  GenerateFromPromptDto,
  GenerateDesignDto,
  SaveTemplateDto,
  CheckInByCodeDto,
  CreateExternalImpulsadorDto,
} from './dto/event.dto';

@Controller()
export class EventsController {
  constructor(private eventsService: EventsService) {}

  // ─── Public ───────────────────────────────────────────────────────────────

  @Get('public/events/:slug')
  getPublicEvent(@Param('slug') slug: string) {
    return this.eventsService.findPublicEvent(slug);
  }

  @Post('public/events/:id/register')
  registerForEvent(@Param('id') id: string, @Body() dto: RegisterEventDto) {
    return this.eventsService.registerForEvent(id, dto);
  }

  // ─── Staff CRUD ───────────────────────────────────────────────────────────

  @Get('events')
  @UseGuards(JwtAuthGuard)
  findEvents(@Query('localId') localId: string, @Request() req: AuthReq) {
    assertRole(req.user.role, EVENT_ROLES);
    return this.eventsService.findEvents(req.user.tenantId, req.user.userId, req.user.role, localId);
  }

  @Get('events/:id')
  @UseGuards(JwtAuthGuard)
  findOneEvent(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, EVENT_ROLES);
    return this.eventsService.findOneEvent(id, req.user.tenantId, req.user.userId, req.user.role);
  }

  @Post('events')
  @UseGuards(JwtAuthGuard)
  createEvent(@Body() dto: CreateEventDto, @Request() req: AuthReq) {
    assertRole(req.user.role, EVENT_ROLES);
    return this.eventsService.createEvent(req.user.tenantId, req.user.userId, dto);
  }

  @Patch('events/:id')
  @UseGuards(JwtAuthGuard)
  updateEvent(
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, EVENT_ROLES);
    return this.eventsService.updateEvent(id, req.user.tenantId, req.user.userId, req.user.role, dto);
  }

  @Delete('events/:id')
  @UseGuards(JwtAuthGuard)
  deleteEvent(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, EVENT_ROLES);
    return this.eventsService.deleteEvent(id, req.user.tenantId, req.user.userId, req.user.role);
  }

  @Patch('events/:id/share')
  @UseGuards(JwtAuthGuard)
  shareEvent(@Param('id') id: string, @Body() dto: ShareEventDto, @Request() req: AuthReq) {
    assertRole(req.user.role, EVENT_ROLES);
    return this.eventsService.shareEvent(id, req.user.tenantId, req.user.userId, req.user.role, dto);
  }

  @Get('events/:id/registrations')
  @UseGuards(JwtAuthGuard)
  findRegistrations(
    @Param('id') id: string,
    @Request() req: AuthReq,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.eventsService.findRegistrations(id, req.user.tenantId, { search, status, sortBy, sortOrder });
  }

  @Patch('events/:id/registrations/:regId/check-in')
  @UseGuards(JwtAuthGuard)
  checkIn(
    @Param('id') id: string,
    @Param('regId') regId: string,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.eventsService.checkIn(id, regId, req.user.tenantId);
  }

  @Patch('events/:id/registrations/check-in/by-code')
  @UseGuards(JwtAuthGuard)
  checkInByCode(
    @Param('id') id: string,
    @Body() dto: CheckInByCodeDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.eventsService.checkInByCode(id, req.user.tenantId, dto.code);
  }

  @Get('events/:id/impulsadores')
  @UseGuards(JwtAuthGuard)
  findImpulsadores(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.eventsService.findImpulsadores(id, req.user.tenantId);
  }

  @Post('impulsadores/external')
  @UseGuards(JwtAuthGuard)
  createExternalImpulsador(@Body() dto: CreateExternalImpulsadorDto, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.eventsService.createExternalImpulsador(req.user.tenantId, req.user.userId, dto);
  }

  @Delete('impulsadores/external/:extId')
  @UseGuards(JwtAuthGuard)
  async deactivateExternalImpulsador(@Param('extId') extId: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    await this.eventsService.deactivateExternalImpulsador(extId, req.user.tenantId);
    return { ok: true };
  }

  // ─── AI Endpoints ─────────────────────────────────────────────────────────

  @Post('events/ai-generate')
  @UseGuards(JwtAuthGuard)
  generateFromPrompt(@Body() dto: GenerateFromPromptDto, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.eventsService.generateFromPrompt(dto);
  }

  @Post('events/ai-design')
  @UseGuards(JwtAuthGuard)
  generateDesign(@Body() dto: GenerateDesignDto, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.eventsService.generateDesign(dto);
  }

  @Get('event-templates')
  @UseGuards(JwtAuthGuard)
  findTemplates(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.eventsService.findTemplates(req.user.tenantId);
  }

  @Post('event-templates')
  @UseGuards(JwtAuthGuard)
  saveTemplate(@Body() dto: SaveTemplateDto, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.eventsService.saveTemplate(req.user.tenantId, dto);
  }

  @Delete('event-templates/:id')
  @UseGuards(JwtAuthGuard)
  deleteTemplate(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.eventsService.deleteTemplate(id, req.user.tenantId);
  }

  @Post('events/:id/generate-copy')
  @UseGuards(JwtAuthGuard)
  generateCopy(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.eventsService.generateCopy(id, req.user.tenantId);
  }

  @Post('events/:id/generate-social')
  @UseGuards(JwtAuthGuard)
  generateSocial(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.eventsService.generateSocial(id, req.user.tenantId);
  }

  @Post('events/:id/generate-hashtags')
  @UseGuards(JwtAuthGuard)
  generateHashtags(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.eventsService.generateHashtags(id, req.user.tenantId);
  }

  @Post('events/:id/generate-email')
  @UseGuards(JwtAuthGuard)
  generateEmail(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.eventsService.generateEmail(id, req.user.tenantId);
  }
}
