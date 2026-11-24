import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  RoutingAssignment,
  RoutingAssignmentSchema,
  RoutingRule,
  RoutingRuleSchema,
} from './routing.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import {
  LeadActivity,
  LeadActivitySchema,
} from '../leads/lead-activity.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import {
  ContactActivity,
  ContactActivitySchema,
} from '../customers/contact-activity.schema';
import { User, UserSchema } from '../users/user.schema';
import { RoutingService } from './routing.service';
import { RoutingController } from './routing.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RoutingRule.name, schema: RoutingRuleSchema },
      { name: RoutingAssignment.name, schema: RoutingAssignmentSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: LeadActivity.name, schema: LeadActivitySchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: ContactActivity.name, schema: ContactActivitySchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [RoutingController],
  providers: [RoutingService],
  exports: [RoutingService],
})
export class RoutingModule {}
