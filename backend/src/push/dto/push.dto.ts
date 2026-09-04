import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Suscripción tal como la serializa `PushSubscription.toJSON()` del navegador. */
export class SavePushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint: string;

  @IsString()
  @IsNotEmpty()
  p256dh: string;

  @IsString()
  @IsNotEmpty()
  auth: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}

export class RemovePushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint: string;
}
