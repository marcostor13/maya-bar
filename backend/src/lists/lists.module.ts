import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ListsController } from './lists.controller';
import { ListsService } from './lists.service';
import { ContactList, ContactListSchema } from './contact-list.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ContactList.name, schema: ContactListSchema },
      { name: Customer.name, schema: CustomerSchema },
    ]),
  ],
  controllers: [ListsController],
  providers: [ListsService],
  exports: [ListsService],
})
export class ListsModule {}
