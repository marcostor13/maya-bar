import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import {
  PushSubscription,
  PushSubscriptionSchema,
} from './push-subscription.schema';
import { PushAudienceService } from './push-audience.service';
import { User, UserSchema } from '../users/user.schema';

/**
 * Global: cualquier módulo que genere un evento relevante (mensajes, pedidos,
 * derivaciones…) debe poder avisar al móvil sin encadenar imports.
 */
@Global()
@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: PushSubscription.name, schema: PushSubscriptionSchema },
      // Para elegir destinatarios: usuario activo, rol actual y preferencias.
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [PushController],
  providers: [PushService, PushAudienceService],
  exports: [PushService, PushAudienceService],
})
export class PushModule {}
