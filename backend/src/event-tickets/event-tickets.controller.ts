import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  Request,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertRole, MANAGE_ROLES, type AuthReq } from '../auth/permissions';
import { Audit } from '../audit/audit.decorator';
import { verifyMpSignature } from '../billing/mercadopago/mp-signature';
import { EventTicketsService } from './event-tickets.service';

export class TicketCheckoutDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  ticketType: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  quantity?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsEmail()
  @MaxLength(200)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, string>;
}

interface MpNotification {
  type?: string;
  topic?: string;
  user_id?: string | number;
  data?: { id?: string | number };
}

/** Venta de entradas en línea con el Mercado Pago de la empresa (HU67). */
@Controller()
export class EventTicketsController {
  private readonly logger = new Logger(EventTicketsController.name);

  constructor(
    private tickets: EventTicketsService,
    private config: ConfigService,
  ) {}

  // ── Conexión de la cuenta (administrador) ──────────────────────────────

  @Get('event-tickets/mp/status')
  @UseGuards(JwtAuthGuard)
  status(@Request() req: AuthReq) {
    assertRole(req.user.role, ['TENANT_ADMIN']);
    return this.tickets.status(req.user.tenantId);
  }

  @Post('event-tickets/mp/connect')
  @UseGuards(JwtAuthGuard)
  connect(@Request() req: AuthReq) {
    assertRole(req.user.role, ['TENANT_ADMIN']);
    return {
      url: this.tickets.authorizeUrl(req.user.tenantId, req.user.userId),
    };
  }

  @Audit({ action: 'event_payments.disconnected', resource: 'mercadopago' })
  @Delete('event-tickets/mp')
  @UseGuards(JwtAuthGuard)
  disconnect(@Request() req: AuthReq) {
    assertRole(req.user.role, ['TENANT_ADMIN']);
    return this.tickets.disconnect(req.user.tenantId);
  }

  /** Vuelta de Mercado Pago: la empresa viaja en el `state` firmado. */
  @Get('event-tickets/mp/callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const front = (this.config.get<string>('FRONTEND_URL') || '').replace(
      /\/$/,
      '',
    );
    const go = (q: Record<string, string>) =>
      res.redirect(
        `${front}/settings?${new URLSearchParams(q)}#cfg-event-payments`,
      );
    if (error || !code)
      return go({ mp: 'error', reason: 'Autorización cancelada' });
    try {
      await this.tickets.connect(code, state);
      return go({ mp: 'connected' });
    } catch (err) {
      this.logger.warn(
        `Conexión de Mercado Pago falló: ${(err as Error).message}`,
      );
      return go({ mp: 'error', reason: 'No se pudo conectar la cuenta' });
    }
  }

  // ── Público ────────────────────────────────────────────────────────────

  @Post('public/events/:id/checkout')
  checkout(@Param('id') id: string, @Body() dto: TicketCheckoutDto) {
    return this.tickets.checkout(id, dto);
  }

  /** Notificaciones de pago de las cuentas conectadas. Firma obligatoria. */
  @Post('public/event-payments/webhook')
  @HttpCode(200)
  async webhook(
    @Body() body: MpNotification,
    @Query() query: Record<string, string>,
    @Headers('x-signature') signature?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    const dataId =
      query['data.id'] ??
      (body?.data?.id != null ? String(body.data.id) : undefined);
    const valid = verifyMpSignature({
      signature,
      requestId,
      dataId,
      secret: this.config.get<string>('MP_WEBHOOK_SECRET'),
    });
    if (!valid) throw new UnauthorizedException('Firma no válida');
    const type = String(body?.type ?? query.type ?? query.topic ?? '');
    if (type !== 'payment' || !dataId) return { ok: true };
    await this.tickets.onPaymentNotification(
      body?.user_id != null ? String(body.user_id) : undefined,
      dataId,
    );
    return { ok: true };
  }

  // ── Reembolso (staff) ──────────────────────────────────────────────────

  @Audit({
    action: 'event_tickets.refunded',
    resource: 'event_registration',
    idParam: 'regId',
  })
  @Post('events/:id/registrations/:regId/refund')
  @UseGuards(JwtAuthGuard)
  refund(
    @Param('id') id: string,
    @Param('regId') regId: string,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.tickets.refund(req.user.tenantId, id, regId);
  }
}
