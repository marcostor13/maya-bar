export class CreateTenantDto {
  name: string;
  ruc?: string;
  email: string;
  phone?: string;
  ownerName: string;
  ownerPassword: string;
}
