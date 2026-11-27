import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Tenant } from '../tenants/tenant.schema';
import {
  accessOf,
  canUse,
  type AccessState,
  type BillingSnapshot,
} from './subscription-access';

const TTL_MS = 30_000;

/**
 * Estado de cobro por empresa con caché corta: lo consultan el interceptor de
 * solo lectura en cada escritura y los procesos en segundo plano (agente IA,
 * campañas). El webhook de pago invalida al momento (`invalidate`).
 */
@Injectable()
export class BillingAccessService {
  private cache = new Map<
    string,
    { snap: BillingSnapshot | null; at: number }
  >();

  constructor(@InjectModel(Tenant.name) private tenants: Model<Tenant>) {}

  async snapshot(tenantId: string): Promise<BillingSnapshot | null> {
    const hit = this.cache.get(tenantId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.snap;
    const snap = Types.ObjectId.isValid(tenantId)
      ? await this.tenants
          .findById(tenantId)
          .select('plan legacy trialEndsAt subscription isActive demo')
          .lean<BillingSnapshot>()
          .exec()
      : null;
    this.cache.set(tenantId, { snap, at: Date.now() });
    return snap;
  }

  async access(tenantId: string, now = new Date()): Promise<AccessState> {
    const snap = await this.snapshot(tenantId);
    // Sin empresa (superadmin o borrada): otras capas deciden.
    if (!snap) return { status: 'legacy', readOnly: false };
    const state = accessOf(snap, now);
    return snap.demo ? { ...state, demo: true } : state;
  }

  /** ¿Pueden correr sus procesos automáticos (agente IA, campañas)? */
  async canOperate(tenantId: string | Types.ObjectId): Promise<boolean> {
    const snap = await this.snapshot(String(tenantId));
    // Suspensión manual (HU16) + estado de cobro, en una sola regla (HU48).
    return !snap || canUse(snap);
  }

  invalidate(tenantId: string): void {
    this.cache.delete(tenantId);
  }
}
