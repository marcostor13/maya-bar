import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { Customer, CustomerSchema } from './customer.schema';
import {
  Reservation,
  ReservationSchema,
} from '../reservations/reservation.schema';
import {
  EventRegistration,
  EventRegistrationSchema,
} from '../events/event-registration.schema';
import { ContactForm, ContactFormSchema } from '../forms/form.schema';
import {
  ContactActivity,
  ContactActivitySchema,
} from './contact-activity.schema';
import { ContactCareController } from './contact-care.controller';
import { ContactCareService } from './contact-care.service';
import { User, UserSchema } from '../users/user.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import {
  LeadActivity,
  LeadActivitySchema,
} from '../leads/lead-activity.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: Reservation.name, schema: ReservationSchema },
      { name: EventRegistration.name, schema: EventRegistrationSchema },
      { name: ContactForm.name, schema: ContactFormSchema },
      { name: ContactActivity.name, schema: ContactActivitySchema },
      { name: User.name, schema: UserSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: LeadActivity.name, schema: LeadActivitySchema },
    ]),
  ],
  // `ContactCareController` va primero: sus rutas fijas (`owners`, `bulk/*`)
  // no deben caer en los `:id` del CRUD.
  controllers: [ContactCareController, CustomersController],
  providers: [CustomersService, ContactCareService],
  exports: [ContactCareService],
})
export class CustomersModule {}
