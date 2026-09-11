import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsController } from './notifications.controller';
import { PushService } from './push.service';
import { DeviceToken, DeviceTokenSchema } from './device-token.schema';
import { User, UserSchema } from '../users/user.schema';

/**
 * Global: cualquier servicio que quiera avisar al usuario (conversaciones,
 * formularios, campañas…) inyecta `PushService` sin tener que importar el
 * módulo y arriesgarse a una dependencia circular.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DeviceToken.name, schema: DeviceTokenSchema },
      // Para filtrar destinatarios por el módulo al que su rol tiene acceso.
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [PushService],
  exports: [PushService],
})
export class NotificationsModule {}
