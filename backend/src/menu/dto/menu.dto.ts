export class CreateCategoryDto {
  localId: string;
  name: string;
  description?: string;
  sortOrder?: number;
}

export class UpdateCategoryDto {
  name?: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export class ReorderDto {
  localId: string;
  ids: string[];
}

export class CreateItemDto {
  localId: string;
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  photos?: string[];
  variants?: any[];
  modifiers?: any[];
  allergens?: string[];
  dietaryTags?: string[];
  stations?: string[];
  sortOrder?: number;
}

export class UpdateItemDto {
  categoryId?: string;
  name?: string;
  description?: string;
  price?: number;
  photos?: string[];
  variants?: any[];
  modifiers?: any[];
  allergens?: string[];
  dietaryTags?: string[];
  stations?: string[];
  isAvailable?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}
