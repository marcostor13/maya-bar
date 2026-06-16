import { SegmentRule } from '../contact-list.schema';

export class CreateListDto {
  name: string;
  description?: string;
  type: 'static' | 'dynamic';
  rules?: SegmentRule[];
  color?: string;
}

export class UpdateListDto {
  name?: string;
  description?: string;
  rules?: SegmentRule[];
  color?: string;
}

export class AddMembersDto {
  customerIds: string[];
}
