import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FormsController } from './forms.controller';
import { FormsService } from './forms.service';
import { ContactForm, ContactFormSchema } from './form.schema';
import { FormSubmission, FormSubmissionSchema } from './form-submission.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { ContactList, ContactListSchema } from '../lists/contact-list.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ContactForm.name, schema: ContactFormSchema },
      { name: FormSubmission.name, schema: FormSubmissionSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: ContactList.name, schema: ContactListSchema },
    ]),
  ],
  controllers: [FormsController],
  providers: [FormsService],
  exports: [FormsService],
})
export class FormsModule {}
