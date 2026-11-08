import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsController } from './notifications.controller';
import { NativePushService } from './push.service';
import { DeviceToken, DeviceTokenSchema } from './device-token.schema';

/**
 * Global: cualquier servicio que quiera avisar al usuario (conversaciones,
 * formularios, campañas…) inyecta `NativePushService` sin tener que importar el
 * módulo y arriesgarse a una dependencia circular.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DeviceToken.name, schema: DeviceTokenSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NativePushService],
  exports: [NativePushService],
})
export class NotificationsModule {}
