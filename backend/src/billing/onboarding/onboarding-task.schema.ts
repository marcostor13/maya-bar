import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OnboardingTaskDocument = HydratedDocument<OnboardingTask>;

export type OnboardingStatus = 'pending' | 'scheduled' | 'in_progress' | 'done';

/** Implementación pagada que el equipo de Maya debe hacer (HU55). */
@Schema({ collection: 'onboarding_tasks', timestamps: true })
export class OnboardingTask {
  /** Compra de la que sale: una tarea por compra. */
  @Prop({ required: true, unique: true })
  sessionPublicId: string;

  @Prop({ type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId?: Types.ObjectId;

  @Prop({ required: true })
  package: string;

  @Prop({ required: true })
  packageName: string;

  @Prop({ required: true })
  plan: string;

  @Prop({ required: true })
  period: string;

  @Prop({ type: Object, required: true })
  contact: { company: string; name: string; email: string; phone?: string };

  @Prop({ type: [{ label: String, done: Boolean }], default: [] })
  checklist: { label: string; done: boolean }[];

  @Prop({ type: String, default: 'pending', index: true })
  status: OnboardingStatus;

  @Prop()
  notes?: string;

  @Prop()
  paidAt?: Date;

  /** Correos enviados (cliente y equipo), para no repetirlos. */
  @Prop()
  notifiedAt?: Date;
}

export const OnboardingTaskSchema =
  SchemaFactory.createForClass(OnboardingTask);
