import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { Role, RoleSchema } from './role.schema';
import { User, UserSchema } from '../users/user.schema';

/**
 * Global porque en la fase final cualquier controlador necesitará preguntar
 * por los módulos de un rol, y encadenar el import por todos los módulos sería
 * ruido sin ninguna ventaja.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Role.name, schema: RoleSchema },
      // El controlador cuenta usuarios por rol para avisar antes de borrar uno.
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
