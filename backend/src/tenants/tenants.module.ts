import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Tenant, TenantSchema } from './tenant.schema';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { AdminTenantsController } from './admin-tenants.controller';
import { TenantAudit, TenantAuditSchema } from './tenant-audit.schema';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Tenant.name, schema: TenantSchema },
      { name: TenantAudit.name, schema: TenantAuditSchema },
    ]),
    UsersModule,
  ],
  providers: [TenantsService],
  controllers: [TenantsController, AdminTenantsController],
  exports: [TenantsService],
})
export class TenantsModule {}
