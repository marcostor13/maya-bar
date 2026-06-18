export class CreateWhatsAppAccountDto {
  label: string;
  provider: 'waha' | 'cloudapi';
  phoneNumber?: string;
  wahaApiUrl?: string;
  wahaApiKey?: string;
  wahaSession?: string;
  waPhoneNumberId?: string;
  waAccessToken?: string;
  waBusinessAccountId?: string;
  waVerifyToken?: string;
  active?: boolean;
}

export class UpdateWhatsAppAccountDto {
  label?: string;
  provider?: 'waha' | 'cloudapi';
  phoneNumber?: string;
  wahaApiUrl?: string;
  wahaApiKey?: string;
  wahaSession?: string;
  waPhoneNumberId?: string;
  waAccessToken?: string;
  waBusinessAccountId?: string;
  waVerifyToken?: string;
  active?: boolean;
}
