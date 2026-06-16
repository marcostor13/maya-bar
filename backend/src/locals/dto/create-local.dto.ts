import { LocalType, BusinessHours } from '../local.schema';

export class CreateLocalDto {
  name: string;
  type?: LocalType;
  address?: string;
  phone?: string;
  email?: string;
  timezone?: string;
  hours?: BusinessHours[];
  tableCount?: number;
  tenantId?: string; // usado por SUPERADMIN para asignar tenant
}

export class UpdateLocalDto {
  name?: string;
  type?: LocalType;
  address?: string;
  phone?: string;
  email?: string;
  timezone?: string;
  hours?: BusinessHours[];
  tableCount?: number;
  isActive?: boolean;
}
