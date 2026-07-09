import {
  Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request, BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertRole, MANAGE_ROLES, type AuthReq } from '../auth/permissions';
import { InstagramAccountsService } from './instagram-accounts.service';
import { InstagramOAuthService } from '../instagram/instagram-oauth.service';
import { CreateInstagramAccountDto, UpdateInstagramAccountDto } from './dto/instagram-account.dto';

@Controller('instagram-accounts')
@UseGuards(JwtAuthGuard)
export class InstagramAccountsController {
  constructor(private service: InstagramAccountsService, private oauth: InstagramOAuthService) {}

  @Get()
  findAll(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.findAll(req.user.tenantId);
  }

  /** Genera la URL de autorización de Meta para que el usuario conecte su propia cuenta. */
  @Get('oauth/start')
  oauthStart(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    const state = this.oauth.signState(req.user.tenantId);
    return { url: this.oauth.buildAuthorizeUrl(state) };
  }

  @Post(':id/oauth/refresh')
  refreshOAuthToken(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.refreshOAuthToken(id, req.user.tenantId);
  }

  @Post()
  create(@Body() dto: CreateInstagramAccountDto, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    if (!dto.label) throw new BadRequestException('Falta el label');
    return this.service.create(req.user.tenantId, dto);
  }

  @Get('webhook-url')
  webhookUrl() {
    return { url: this.service.globalWebhookUrl() };
  }

  @Get(':id/status')
  status(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.status(id, req.user.tenantId);
  }

  @Post(':id/subscribe')
  subscribeWebhook(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.subscribeWebhook(id, req.user.tenantId);
  }

  @Post(':id/test')
  test(@Param('id') id: string, @Body() dto: { recipientId: string }, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    if (!dto.recipientId) throw new BadRequestException('Falta el IGSID del destinatario');
    return this.service.test(id, req.user.tenantId, dto.recipientId);
  }

  @Patch(':id/default')
  setDefault(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.setDefault(id, req.user.tenantId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInstagramAccountDto, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.update(id, req.user.tenantId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.remove(id, req.user.tenantId);
  }
}
