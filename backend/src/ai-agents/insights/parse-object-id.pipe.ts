import { NotFoundException, PipeTransform } from '@nestjs/common';
import { Types } from 'mongoose';

/** Un id con formato inválido es un recurso que no existe: 404, no 500. */
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!Types.ObjectId.isValid(value))
      throw new NotFoundException('No encontrado');
    return value;
  }
}
