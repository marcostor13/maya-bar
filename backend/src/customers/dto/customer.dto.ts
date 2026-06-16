export class CreateCustomerDto {
  name: string;
  email: string;
  phone?: string;
  tags?: string[];
  notes?: string;
}

export class UpdateCustomerDto {
  name?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  notes?: string;
}
