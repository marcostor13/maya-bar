import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Event, EventSchema } from '../events/event.schema';
import {
  EventRegistration,
  EventRegistrationSchema,
} from '../events/event-registration.schema';
import { MailModule } from '../mail/mail.module';
import {
  MpSellerConnection,
  MpSellerConnectionSchema,
} from './mp-seller-connection.schema';
import { EventTicketsService } from './event-tickets.service';
import { EventTicketsController } from './event-tickets.controller';

/** Entradas pagadas en línea con el Mercado Pago de cada empresa (HU67). */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Event.name, schema: EventSchema },
      { name: EventRegistration.name, schema: EventRegistrationSchema },
      { name: MpSellerConnection.name, schema: MpSellerConnectionSchema },
    ]),
    MailModule,
  ],
  controllers: [EventTicketsController],
  providers: [EventTicketsService],
  exports: [EventTicketsService],
})
export class EventTicketsModule {}
