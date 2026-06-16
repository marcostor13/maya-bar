export class CreateVisitDto {
  reference!: string;
  location!: { lat: number; lng: number; accuracy?: number };
  address?: string;
}
