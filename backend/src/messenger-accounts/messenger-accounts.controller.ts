import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertRole, MANAGE_ROLES, type AuthReq } from '../auth/permissions';
import { MessengerAccountsService } from './messenger-accounts.service';
import { MessengerOAuthService } from '../messenger/messenger-oauth.service';
import {
  CreateMessengerAccountDto,
  UpdateMessengerAccountDto,
} from './dto/messenger-account.dto';

@Controller('messenger-accounts')
@UseGuards(JwtAuthGuard)
export class MessengerAccountsController {
  constructor(
    private service: MessengerAccountsService,
    private oauth: MessengerOAuthService,
  ) {}

  @Get()
  findAll(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.findAll(req.user.tenantId);
  }

  /** Genera la URL de autorización de Meta para que el usuario conecte sus Páginas. */
  @Get('oauth/start')
  oauthStart(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    const state = this.oauth.signState(req.user.tenantId);
    return { url: this.oauth.buildAuthorizeUrl(state) };
  }

  @Post()
  create(@Body() dto: CreateMessengerAccountDto, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    if (!dto.label) throw new BadRequestException('Falta el label');
    return this.service.create(req.user.tenantId, dto);
  }

  @Get('webhook-url')
  webhookUrl() {
    return {
      url: this.service.globalWebhookUrl(),
      verifyToken: this.service.globalVerifyToken(),
    };
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
  test(
    @Param('id') id: string,
    @Body() dto: { recipientId: string },
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, MANAGE_ROLES);
    if (!dto.recipientId)
      throw new BadRequestException('Falta el PSID del destinatario');
    return this.service.test(id, req.user.tenantId, dto.recipientId);
  }

  @Patch(':id/default')
  setDefault(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.setDefault(id, req.user.tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMessengerAccountDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.update(id, req.user.tenantId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.remove(id, req.user.tenantId);
  }
}
