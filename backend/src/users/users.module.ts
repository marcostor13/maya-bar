import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User, UserSchema } from './user.schema';
import { AuthModule } from '../auth/auth.module';
import { RefreshToken, RefreshTokenSchema } from '../auth/refresh-token.schema';
import { UserSessionsService } from './user-sessions.service';
import { UserAudit, UserAuditSchema } from './user-audit.schema';
import { UserAuditService } from './user-audit.service';
import { UserAdminService } from './user-admin.service';
import { AdminUsersController } from './admin-users.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
      { name: UserAudit.name, schema: UserAuditSchema },
    ]),
    forwardRef(() => AuthModule),
    MailModule,
  ],
  controllers: [UsersController, AdminUsersController],
  providers: [
    UsersService,
    UserSessionsService,
    UserAuditService,
    UserAdminService,
  ],
  exports: [UsersService, UserSessionsService],
})
export class UsersModule {}
