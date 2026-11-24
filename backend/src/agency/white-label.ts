import { Types, type Model } from 'mongoose';
import type { Tenant } from '../tenants/tenant.schema';

/**
 * Marca blanca de agencias (HU72): registro en memoria de los dominios de
 * panel, para que CORS acepte `crm.agencia.com` sin reiniciar. Lo llena el
 * servicio de agencias al arrancar y cada vez que una agencia cambia el suyo.
 */
const panelOrigins = new Set<string>();

export function setPanelDomains(domains: string[]): void {
  panelOrigins.clear();
  for (const d of domains) if (d) panelOrigins.add(`https://${d}`);
}

export function addPanelDomain(domain: string | undefined): void {
  if (domain) panelOrigins.add(`https://${domain}`);
}

export function isPanelOrigin(origin: string | undefined): boolean {
  return !!origin && panelOrigins.has(origin.toLowerCase());
}

export interface Brand {
  appName: string;
  logo?: string;
  favicon?: string;
  primaryColor?: string;
}

export const MAYA_BRAND: Brand = { appName: 'Maya CRM' };

/** Marca con la que se ve una empresa: la de su agencia si es una sub-cuenta. */
export async function brandForTenant(
  tenants: Model<Tenant>,
  tenantId: string,
): Promise<Brand> {
  if (!Types.ObjectId.isValid(tenantId)) return MAYA_BRAND;
  const t = await tenants
    .findById(tenantId)
    .select('whiteLabel name agency parentTenantId')
    .lean<Tenant>()
    .exec();
  if (!t) return MAYA_BRAND;
  if (t.agency && t.whiteLabel?.appName) return brandOf(t);
  if (!t.parentTenantId) return MAYA_BRAND;
  const parent = await tenants
    .findById(t.parentTenantId)
    .select('whiteLabel name agency')
    .lean<Tenant>()
    .exec();
  return parent?.agency && parent.whiteLabel?.appName
    ? brandOf(parent)
    : MAYA_BRAND;
}

export function brandOf(t: Tenant): Brand {
  const wl = t.whiteLabel ?? {};
  return {
    appName: wl.appName || t.name,
    ...(wl.logo ? { logo: wl.logo } : {}),
    ...(wl.favicon ? { favicon: wl.favicon } : {}),
    ...(wl.primaryColor ? { primaryColor: wl.primaryColor } : {}),
  };
}
