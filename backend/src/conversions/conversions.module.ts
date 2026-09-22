import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ConversionsService } from './conversions.service';
import { ConversionsController } from './conversions.controller';
import {
  ConversionEvent,
  ConversionEventSchema,
} from './conversion-event.schema';
import {
  Conversation,
  ConversationSchema,
} from '../conversations/conversation.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';

/**
 * Se importan los esquemas de conversaciones y contactos, no sus módulos: aquí
 * solo se leen para resolver de qué anuncio salió el cliente, y traer los
 * módulos enteros crearía un ciclo (oportunidades → conversiones → …).
 */
@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: ConversionEvent.name, schema: ConversionEventSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Customer.name, schema: CustomerSchema },
    ]),
  ],
  controllers: [ConversionsController],
  providers: [ConversionsService],
  exports: [ConversionsService],
})
export class ConversionsModule {}
