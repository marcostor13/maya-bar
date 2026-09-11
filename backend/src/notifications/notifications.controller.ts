import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthReq } from '../auth/permissions';
import { NativePushService } from './push.service';
import { RegisterDeviceDto } from './dto/register-device.dto';

/**
 * Alta y baja de dispositivos para push. No lleva `ModuleGuard`: recibir
 * notificaciones no es un módulo contratable, lo puede hacer cualquier usuario
 * autenticado que instale la app.
 */
@Controller('devices')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private push: NativePushService) {}

  /** Le dice al frontend si merece la pena pedir el permiso al usuario. */
  @Get('status')
  status() {
    return { enabled: this.push.enabled };
  }

  @Post()
  async register(@Request() req: AuthReq, @Body() dto: RegisterDeviceDto) {
    await this.push.registerDevice({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      token: dto.token,
      platform: dto.platform,
      appVersion: dto.appVersion,
    });
    return { ok: true };
  }

  @Delete(':token')
  async unregister(@Param('token') token: string) {
    await this.push.unregisterDevice(token);
    return { ok: true };
  }
}
