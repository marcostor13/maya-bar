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

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: Reservation.name, schema: ReservationSchema },
      { name: EventRegistration.name, schema: EventRegistrationSchema },
      { name: ContactForm.name, schema: ContactFormSchema },
    ]),
  ],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
