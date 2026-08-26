import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Rol de una empresa con los módulos a los que accede. Se siembra a partir de
 * `DEFAULT_ROLE_MODULES` la primera vez que la empresa consulta sus roles, de
 * modo que los accesos de partida son idénticos a los que había cuando estaban
 * fijos en el código.
 */
@Schema({ timestamps: true })
export class Role extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  /** Coincide con `User.role` (TENANT_ADMIN, MANAGER…). */
  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  label: string;

  /** Claves de `MODULES`. Lo único que el administrador edita. */
  @Prop({ type: [String], default: [] })
  modules: string[];

  /**
   * Acciones permitidas dentro de cada módulo: `{ customers: ['create','edit'] }`.
   *
   * La ausencia de entrada significa "todas". Es lo que mantiene compatible la
   * configuración anterior: los roles sembrados sin este campo conservan los
   * permisos completos que tenían.
   */
  @Prop({ type: Object, default: () => ({}) })
  actions: Record<string, string[]>;

  /** Los roles del sistema no se pueden borrar ni renombrar su clave. */
  @Prop({ default: true })
  isSystem: boolean;
}

export const RoleSchema = SchemaFactory.createForClass(Role);
RoleSchema.index({ tenantId: 1, key: 1 }, { unique: true });
