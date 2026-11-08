import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

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
  @MaxLength(512)
  userAgent?: string;

  @IsOptional()
  @IsBoolean()
  installed?: boolean;
}

/** Preferencias de avisos; las claves que no vienen no se tocan. */
export class PushPrefsDto {
  @IsOptional()
  @IsBoolean()
  chats?: boolean;

  @IsOptional()
  @IsBoolean()
  forms?: boolean;

  @IsOptional()
  @IsBoolean()
  leads?: boolean;

  @IsOptional()
  @IsBoolean()
  recovery?: boolean;

  @IsOptional()
  @IsBoolean()
  muted?: boolean;
}

export class RemovePushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint: string;
}
