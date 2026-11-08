import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthReq } from '../auth/permissions';
import { PushService } from './push.service';
import { PushAudienceService } from './push-audience.service';
import { NativePushService } from '../notifications/push.service';
import {
  PushPrefsDto,
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
  constructor(
    private service: PushService,
    private native: NativePushService,
    private audience: PushAudienceService,
  ) {}

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

  /** Alta del navegador. Devuelve solo el id: las claves ya las tiene el cliente. */
  @Post('subscribe')
  async subscribe(
    @Body() dto: SavePushSubscriptionDto,
    @Request() req: AuthReq,
  ) {
    const sub = await this.service.save(dto, {
      userId: req.user.userId,
      tenantId: req.user.tenantId,
      role: req.user.role,
    });
    return { id: String(sub._id) };
  }

  /** Dispositivos del usuario (navegadores y apps), sin endpoints ni tokens. */
  @Get('devices')
  async devices(@Request() req: AuthReq) {
    const [web, native] = await Promise.all([
      this.service.listForUser(req.user.userId),
      this.native.listForUser(req.user.userId),
    ]);
    return [...native, ...web];
  }

  /** Baja de uno de los dispositivos del usuario. */
  @Delete('devices/:kind/:id')
  removeDevice(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Request() req: AuthReq,
  ) {
    if (kind === 'web') return this.service.removeById(id, req.user.userId);
    if (kind === 'android' || kind === 'ios')
      return this.native.removeById(id, req.user.userId);
    throw new BadRequestException('Tipo de dispositivo no válido');
  }

  @Get('preferences')
  preferences(@Request() req: AuthReq) {
    return this.audience.getPrefs(req.user.userId);
  }

  @Put('preferences')
  savePreferences(@Body() dto: PushPrefsDto, @Request() req: AuthReq) {
    return this.audience.setPrefs(req.user.userId, dto);
  }

  @Delete('subscribe')
  unsubscribe(@Body() dto: RemovePushSubscriptionDto, @Request() req: AuthReq) {
    return this.service.remove(dto.endpoint, req.user.userId);
  }

  /**
   * Envía una notificación de prueba a todos los dispositivos del propio
   * usuario, por los dos canales. Ignora las preferencias a propósito.
   */
  @Post('test')
  async test(@Request() req: AuthReq) {
    const title = 'Notificaciones activadas';
    const body = 'Así te avisaremos de cada mensaje nuevo en Conversaciones.';
    const [web, native] = await Promise.all([
      this.service.sendToUser(req.user.userId, {
        title,
        body,
        url: '/inbox',
        tag: 'maya-test',
      }),
      this.native.sendToUser(req.user.userId, {
        title,
        body,
        tag: 'maya-test',
        data: { route: '/inbox' },
      }),
    ]);
    return { sent: web + native };
  }
}
