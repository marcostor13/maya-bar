import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  LinkBatch,
  LinkBatchSchema,
  LinkClick,
  LinkClickSchema,
  ShortDomain,
  ShortDomainSchema,
  ShortLink,
  ShortLinkSchema,
} from './link.schemas';
import { LinksController } from './links.controller';
import {
  RedirectController,
  ShortDomainMiddleware,
} from './redirect.controller';
import { LinksService } from './links.service';
import { LinkTrackingService } from './link-tracking.service';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { Tenant, TenantSchema } from '../tenants/tenant.schema';
import { ListsModule } from '../lists/lists.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ShortLink.name, schema: ShortLinkSchema },
      { name: ShortDomain.name, schema: ShortDomainSchema },
      { name: LinkClick.name, schema: LinkClickSchema },
      { name: LinkBatch.name, schema: LinkBatchSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Tenant.name, schema: TenantSchema },
    ]),
    ListsModule,
  ],
  controllers: [LinksController, RedirectController],
  providers: [LinksService, LinkTrackingService, ShortDomainMiddleware],
  // El middleware se exporta para registrarlo en `main.ts` a nivel de Express:
  // montado con `forRoutes('*')` solo corre en rutas que existen, y un link de
  // dominio corto (`/abc1234`) es justo una ruta que no existe en la API.
  exports: [LinksService, ShortDomainMiddleware],
})
export class LinksModule {}
