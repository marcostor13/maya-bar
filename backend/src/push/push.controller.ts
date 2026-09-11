import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthReq } from '../auth/permissions';
import { PushService } from './push.service';
import {
  RemovePushSubscriptionDto,
  SavePushSubscriptionDto,
} from './dto/push.dto';

/**
 * Alta/baja de dispositivos para las notificaciones push.
 *
 * Sin guard de módulo a propósito: cualquiera que tenga sesión puede querer
 * avisos en su móvil; el filtro por permisos se aplica al ENVIAR (ver
 * `PushService.sendToTenant`), que es donde importa.
 */
@Controller('push')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private service: PushService) {}

  /** Clave pública VAPID que el navegador necesita para suscribirse. */
  @Get('public-key')
  publicKey() {
    return this.service.vapidPublicKey();
  }

  /** Estado de las notificaciones para este usuario. */
  @Get('status')
  async status(@Request() req: AuthReq) {
    return {
      enabled: this.service.isEnabled(),
      devices: await this.service.countForUser(req.user.userId),
    };
  }

  @Post('subscribe')
  subscribe(@Body() dto: SavePushSubscriptionDto, @Request() req: AuthReq) {
    return this.service.save(dto, {
      userId: req.user.userId,
      tenantId: req.user.tenantId,
      role: req.user.role,
    });
  }

  @Delete('subscribe')
  unsubscribe(@Body() dto: RemovePushSubscriptionDto, @Request() req: AuthReq) {
    return this.service.remove(dto.endpoint, req.user.userId);
  }

  /** Envía una notificación de prueba a los dispositivos del propio usuario. */
  @Post('test')
  async test(@Request() req: AuthReq) {
    const sent = await this.service.sendToUser(req.user.userId, {
      title: 'Notificaciones activadas',
      body: 'Así te avisaremos de cada mensaje nuevo en Conversaciones.',
      url: '/inbox',
      tag: 'maya-test',
    });
    return { sent };
  }
}
