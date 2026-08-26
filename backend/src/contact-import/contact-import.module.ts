import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ContactImportController } from './contact-import.controller';
import { ContactImportService } from './contact-import.service';
import { ContactSource, ContactSourceSchema } from './contact-source.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: ContactSource.name, schema: ContactSourceSchema },
    ]),
  ],
  controllers: [ContactImportController],
  providers: [ContactImportService],
  exports: [ContactImportService],
})
export class ContactImportModule {}
