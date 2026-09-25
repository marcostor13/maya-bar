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
import {
  assertRole,
  CRM_ROLES,
  MANAGE_ROLES,
  type AuthReq,
} from '../auth/permissions';
import { ModuleGuard } from '../roles/module.guard';
import { CalendarService } from './calendar.service';
import { CalendarOAuthService } from './calendar-oauth.service';
import type { CalendarProvider } from './calendar-connection.schema';
import { CreateCalendarEventDto } from './dto/calendar.dto';

function isProvider(p: string): p is CalendarProvider {
  return p === 'google' || p === 'microsoft';
}

function provider(p: string): CalendarProvider {
  if (!isProvider(p)) throw new BadRequestException('Proveedor no soportado');
  return p;
}

/**
 * Calendarios conectados (Google Meet / Microsoft Teams). Ver y agendar es
 * para quien atiende conversaciones; conectar y desconectar, para quien
 * administra.
 */
@Controller('calendar')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(
    private service: CalendarService,
    private oauth: CalendarOAuthService,
  ) {}

  @Get('connections')
  list(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.list(req.user.tenantId);
  }

  @Get('oauth/:provider/start')
  start(@Param('provider') p: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return {
      url: this.oauth.buildAuthorizeUrl(
        provider(p),
        req.user.tenantId,
        req.user.userId,
      ),
    };
  }

  @Patch('connections/:id/default')
  setDefault(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.setDefault(id, req.user.tenantId);
  }

  @Delete('connections/:id')
  remove(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.remove(id, req.user.tenantId);
  }

  /** Agendar desde Conversaciones: exige el módulo de la bandeja. */
  @Post('events')
  @UseGuards(ModuleGuard('inbox'))
  createEvent(@Body() dto: CreateCalendarEventDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.createEvent(req.user.tenantId, dto);
  }
}

/**
 * Callback PÚBLICO al que Google o Microsoft redirigen tras autorizar. El
 * tenant viaja en `state`, firmado al iniciar el flujo.
 */
@Controller('calendar/oauth')
export class CalendarOAuthCallbackController {
  private readonly logger = new Logger(CalendarOAuthCallbackController.name);

  constructor(
    private service: CalendarService,
    private oauth: CalendarOAuthService,
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
    const fail = (reason: string) => redirect({ calendar: 'error', reason });

    if (!isProvider(p)) return fail('Proveedor no soportado');
    if (error || errorDescription)
      return fail(errorDescription || 'Autorización cancelada');
    const decoded = code && state ? this.oauth.verifyState(state, p) : null;
    if (!decoded) return fail('Estado inválido o expirado, intenta de nuevo');

    try {
      const tokens = await this.oauth.exchangeCode(p, code);
      const conn = await this.service.upsertFromOAuth(
        decoded.tenantId,
        p,
        tokens,
        decoded.userId,
      );
      return redirect({ calendar: 'connected', email: conn.email });
    } catch (err) {
      this.logger.error(`OAuth de calendario (${p}) falló: ${String(err)}`);
      return fail('No se pudo completar la conexión del calendario');
    }
  }
}
