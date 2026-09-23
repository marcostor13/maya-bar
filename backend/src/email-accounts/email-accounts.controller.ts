import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertRole, MANAGE_ROLES, type AuthReq } from '../auth/permissions';
import { EmailAccountsService } from './email-accounts.service';
import { EmailOAuthService, type OAuthProvider } from './email-oauth.service';
import {
  CreateEmailAccountDto,
  UpdateEmailAccountDto,
} from './dto/email-account.dto';

function provider(p: string): OAuthProvider {
  if (p !== 'gmail' && p !== 'outlook')
    throw new BadRequestException('Proveedor no soportado');
  return p;
}

@Controller('email-accounts')
@UseGuards(JwtAuthGuard)
export class EmailAccountsController {
  constructor(
    private service: EmailAccountsService,
    private oauth: EmailOAuthService,
  ) {}

  @Get()
  findAll(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.findAll(req.user.tenantId);
  }

  /** Qué conexiones en vivo (OAuth) están disponibles en este servidor. */
  @Get('oauth/providers')
  providers(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.oauth.available();
  }

  @Get('oauth/:provider/start')
  start(@Param('provider') p: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return {
      url: this.oauth.buildAuthorizeUrl(provider(p), req.user.tenantId),
    };
  }

  @Post()
  create(@Body() dto: CreateEmailAccountDto, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.createCustom(req.user.tenantId, dto);
  }

  @Post(':id/test')
  test(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.test(id, req.user.tenantId);
  }

  @Patch(':id/default')
  setDefault(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.setDefault(id, req.user.tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEmailAccountDto,
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

/**
 * Callback PÚBLICO al que Google o Microsoft redirigen tras autorizar. El
 * tenant viaja en `state`, firmado al iniciar el flujo.
 */
@Controller('email-accounts/oauth')
export class EmailOAuthCallbackController {
  private readonly logger = new Logger(EmailOAuthCallbackController.name);

  constructor(
    private service: EmailAccountsService,
    private oauth: EmailOAuthService,
    private config: ConfigService,
  ) {}

  @Get(':provider/callback')
  async callback(
    @Param('provider') p: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Res() res: Response,
  ) {
    const frontend = (this.config.get<string>('FRONTEND_URL') || '').replace(
      /\/$/,
      '',
    );
    const redirect = (params: Record<string, string>) =>
      res.redirect(
        `${frontend}/settings?${new URLSearchParams(params).toString()}`,
      );

    if (p !== 'gmail' && p !== 'outlook')
      return redirect({
        email_oauth: 'error',
        reason: 'Proveedor no soportado',
      });
    if (error || errorDescription)
      return redirect({
        email_oauth: 'error',
        reason: errorDescription || 'Autorización cancelada',
      });
    const decoded = code && state ? this.oauth.verifyState(state, p) : null;
    if (!decoded)
      return redirect({
        email_oauth: 'error',
        reason: 'Estado inválido o expirado, intenta de nuevo',
      });

    try {
      const tokens = await this.oauth.exchangeCode(p, code);
      const account = await this.service.upsertFromOAuth(
        decoded.tenantId,
        p,
        tokens,
      );
      return redirect({ email_oauth: 'success', email: account.email });
    } catch (err) {
      this.logger.error(`OAuth de correo (${p}) falló: ${String(err)}`);
      return redirect({
        email_oauth: 'error',
        reason: 'No se pudo completar la conexión del correo',
      });
    }
  }
}
