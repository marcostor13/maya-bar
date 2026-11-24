import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant } from '../tenants/tenant.schema';
import { LEGACY_PLAN_MAP, PLAN_IDS } from './plans.catalog';

/**
 * Lleva las empresas de los planes anteriores (`starter|pro|enterprise`) al
 * catálogo (HU40). Quedan `legacy: true` —sin límites— hasta que el
 * superadmin decida. Idempotente: solo toca valores fuera del catálogo.
 */
@Injectable()
export class BillingMigrationService implements OnModuleInit {
  private readonly logger = new Logger(BillingMigrationService.name);

  constructor(@InjectModel(Tenant.name) private tenants: Model<Tenant>) {}

  async onModuleInit(): Promise<void> {
    try {
      const n = await this.migrate();
      if (n) this.logger.log(`${n} empresa(s) migradas al catálogo de planes`);
    } catch (err) {
      this.logger.warn(`No se pudo migrar el plan: ${String(err)}`);
    }
  }

  async migrate(): Promise<number> {
    let total = 0;
    for (const [from, to] of Object.entries(LEGACY_PLAN_MAP)) {
      const r = await this.tenants.updateMany(
        { plan: from as never },
        { $set: { plan: to, legacy: true } },
      );
      total += r.modifiedCount ?? 0;
    }
    // Sin plan o con cualquier otro valor desconocido.
    const r = await this.tenants.updateMany(
      { plan: { $nin: [...PLAN_IDS] } },
      { $set: { plan: 'inicia', legacy: true } },
    );
    return total + (r.modifiedCount ?? 0);
  }
}
