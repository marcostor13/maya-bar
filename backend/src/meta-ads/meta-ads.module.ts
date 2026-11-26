import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MetaCapiService } from './meta-capi.service';
import { MetaCapiEvent, MetaCapiEventSchema } from './meta-capi-event.schema';
import { Tenant, TenantSchema } from '../tenants/tenant.schema';
import { Payment, PaymentSchema } from '../billing/payment.schema';

/**
 * Medición de la publicidad propia de Maya CRM en Meta (HU84). Solo lee
 * empresas y pagos: no importa sus módulos para no crear ciclos con auth.
 */
@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: MetaCapiEvent.name, schema: MetaCapiEventSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: Payment.name, schema: PaymentSchema },
    ]),
  ],
  providers: [MetaCapiService],
  exports: [MetaCapiService],
})
export class MetaAdsModule {}
