export class OrderLineItemDto {
  itemId!: string;
  name!: string;
  price!: number;
  quantity!: number;
  notes?: string;
  stations!: string[];
}

export class CreateOrderDto {
  localId!: string;
  tableNumber!: string;
  type?: string;
  items!: OrderLineItemDto[];
  notes?: string;
  guestName?: string;
}

export class UpdateOrderStatusDto {
  status!: string;
}
