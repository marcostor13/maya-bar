import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ImpulsadorController } from './impulsador.controller';
import { ImpulsadorService } from './impulsador.service';
import { Event, EventSchema } from '../events/event.schema';
import {
  EventRegistration,
  EventRegistrationSchema,
} from '../events/event-registration.schema';
import { SettingsModule } from '../settings/settings.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Event.name, schema: EventSchema },
      { name: EventRegistration.name, schema: EventRegistrationSchema },
    ]),
    SettingsModule,
    MailModule,
  ],
  controllers: [ImpulsadorController],
  providers: [ImpulsadorService],
})
export class ImpulsadorModule {}
