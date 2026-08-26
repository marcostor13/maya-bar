import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertRole, CRM_ROLES, MANAGE_ROLES, type AuthReq } from '../auth/permissions';
import { ContactImportService } from './contact-import.service';
import {
  AnalyzeMongoDto,
  ImportMongoDto,
  ImportOptionsDto,
} from './dto/contact-import.dto';

/**
 * 60 MB: una hoja de contactos no se acerca, pero el volcado JSON de una
 * colección entera de Compass sí, porque repite los nombres de campo en cada
 * documento. El número de filas procesadas lo sigue acotando MAX_ROWS.
 */
const MAX_FILE_SIZE = 60 * 1024 * 1024;

@Controller('customers/import')
@UseGuards(JwtAuthGuard)
export class ContactImportController {
  constructor(private service: ContactImportService) {}

  /** Paso 1: lee el archivo y devuelve columnas, ejemplos y mapeo sugerido. */
  @Post('file/analyze')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  analyzeFile(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    return this.service.analyzeFile(file);
  }

  /**
   * Paso 2: importa con el mapeo confirmado. Las opciones llegan como JSON en
   * un campo del multipart, porque el resto del cuerpo es el archivo.
   */
  @Post('file')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  importFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('options') rawOptions: string,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    return this.service.importFile(
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      file,
      this.parseOptions(rawOptions),
    );
  }

  @Post('mongo/analyze')
  analyzeMongo(@Body() dto: AnalyzeMongoDto, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.analyzeMongo(dto);
  }

  @Post('mongo')
  importMongo(@Body() dto: ImportMongoDto, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.importMongo(
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto,
    );
  }

  /** Conexiones guardadas (sin la URI: lleva credenciales). */
  @Get('sources')
  listSources(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.listSources(req.user.tenantId);
  }

  @Post('sources/:id/run')
  runSource(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.runSource(
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      id,
    );
  }

  @Delete('sources/:id')
  deleteSource(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.deleteSource(req.user.tenantId, id);
  }

  /**
   * El ValidationPipe global no toca los campos de un multipart, así que las
   * opciones se validan a mano con el mismo DTO.
   */
  private parseOptions(raw: string): ImportOptionsDto {
    if (!raw) throw new BadRequestException('Falta el mapeo de campos');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException('El mapeo de campos no es un JSON válido');
    }
    const dto = plainToInstance(ImportOptionsDto, parsed);
    const errors = validateSync(dto, { whitelist: true });
    if (errors.length)
      throw new BadRequestException(
        `Mapeo inválido: ${errors.map((e) => e.property).join(', ')}`,
      );
    return dto;
  }
}
