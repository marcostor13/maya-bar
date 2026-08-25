import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { RegistrationsService } from './registrations.service';
import { ImpulsadoresService } from './impulsadores.service';
import { Event, EventSchema } from './event.schema';
import {
  EventRegistration,
  EventRegistrationSchema,
} from './event-registration.schema';
import { EventTemplate, EventTemplateSchema } from './event-template.schema';
import {
  ExternalImpulsador,
  ExternalImpulsadorSchema,
} from './external-impulsador.schema';
import { User, UserSchema } from '../users/user.schema';
import { AiModule } from '../ai/ai.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Event.name, schema: EventSchema },
      { name: EventRegistration.name, schema: EventRegistrationSchema },
      { name: EventTemplate.name, schema: EventTemplateSchema },
      { name: ExternalImpulsador.name, schema: ExternalImpulsadorSchema },
      { name: User.name, schema: UserSchema },
    ]),
    AiModule,
    MailModule,
  ],
  controllers: [EventsController],
  providers: [EventsService, RegistrationsService, ImpulsadoresService],
  exports: [EventsService, RegistrationsService, ImpulsadoresService],
})
export class EventsModule {}
