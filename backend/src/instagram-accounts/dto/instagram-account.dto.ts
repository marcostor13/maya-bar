export class CreateInstagramAccountDto {
  label: string;
  username?: string;
  igBusinessAccountId?: string;
  pageId?: string;
  pageAccessToken?: string;
  verifyToken?: string;
  active?: boolean;
}

export class UpdateInstagramAccountDto {
  label?: string;
  username?: string;
  igBusinessAccountId?: string;
  pageId?: string;
  pageAccessToken?: string;
  verifyToken?: string;
  active?: boolean;
}
