import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterDeviceDto {
  /** Token de registro de FCM. Es largo (~160 chars) pero no ilimitado. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token: string;

  @IsOptional()
  @IsIn(['android', 'ios', 'web'])
  platform?: 'android' | 'ios' | 'web';

  @IsOptional()
  @IsString()
  @MaxLength(32)
  appVersion?: string;
}
