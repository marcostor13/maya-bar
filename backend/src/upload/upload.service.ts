import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const ALLOWED_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/3gpp',
];
const ALLOWED_AUDIO = [
  'audio/mpeg',
  'audio/mp4',
  'audio/mp3',
  'audio/aac',
  'audio/amr',
  'audio/ogg',
  'audio/opus',
  'audio/webm',
  'audio/wav',
  'audio/x-wav',
];
const ALLOWED_DOC = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
];
const ALL_ALLOWED = [
  ...ALLOWED_IMAGE,
  ...ALLOWED_VIDEO,
  ...ALLOWED_AUDIO,
  ...ALLOWED_DOC,
];

const MAX_SIZE_IMAGE = 10 * 1024 * 1024; // 10 MB
const MAX_SIZE_VIDEO = 200 * 1024 * 1024; // 200 MB
const MAX_SIZE_AUDIO = 30 * 1024 * 1024; // 30 MB
const MAX_SIZE_DOC = 20 * 1024 * 1024; // 20 MB

/** Tope para media entrante de WhatsApp/Instagram (no pasa por la allowlist). */
const MAX_SIZE_INBOUND = 100 * 1024 * 1024; // 100 MB

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/3gpp': '3gp',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/webm': 'weba',
  'audio/wav': 'wav',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

export interface UploadResult {
  url: string;
  key: string;
  contentType: string;
  size: number;
}

@Injectable()
export class UploadService {
  private s3: S3Client;
  private bucket: string;
  private region: string;

  constructor(private configService: ConfigService) {
    this.region = configService.get<string>('S3_REGION') ?? 'us-east-1';
    this.bucket = configService.get<string>('S3_BUCKET') ?? '';
    this.s3 = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: configService.get<string>('AWS_ACCESS_KEY_ID') ?? '',
        secretAccessKey:
          configService.get<string>('AWS_SECRET_ACCESS_KEY') ?? '',
      },
    });
  }

  async upload(
    file: Express.Multer.File,
    folder = 'uploads',
  ): Promise<UploadResult> {
    if (!ALL_ALLOWED.includes(file.mimetype)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido: ${file.mimetype}`,
      );
    }

    const maxSize = ALLOWED_IMAGE.includes(file.mimetype)
      ? MAX_SIZE_IMAGE
      : ALLOWED_VIDEO.includes(file.mimetype)
        ? MAX_SIZE_VIDEO
        : ALLOWED_AUDIO.includes(file.mimetype)
          ? MAX_SIZE_AUDIO
          : MAX_SIZE_DOC;

    if (file.size > maxSize) {
      throw new BadRequestException(
        `Archivo demasiado grande (máx ${maxSize / 1024 / 1024} MB)`,
      );
    }

    return this.uploadBuffer(
      file.buffer,
      file.mimetype,
      folder,
      file.originalname,
    );
  }

  /**
   * Sube un buffer arbitrario (sin allowlist de tipos) — usado para re-hospedar la
   * media entrante de WhatsApp/Instagram, cuyas URLs originales expiran o exigen token.
   */
  async uploadBuffer(
    buffer: Buffer,
    contentType: string,
    folder = 'uploads',
    originalName?: string,
  ): Promise<UploadResult> {
    if (buffer.length > MAX_SIZE_INBOUND) {
      throw new BadRequestException(
        `Archivo demasiado grande (máx ${MAX_SIZE_INBOUND / 1024 / 1024} MB)`,
      );
    }

    const mime = contentType || 'application/octet-stream';
    const nameExt = originalName?.includes('.')
      ? originalName.split('.').pop()?.toLowerCase()
      : undefined;
    const ext = nameExt ?? EXT_BY_MIME[mime.split(';')[0]] ?? 'bin';
    const key = `${folder}/${randomUUID()}.${ext}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mime,
        CacheControl: 'max-age=31536000',
      }),
    );

    const url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    return { url, key, contentType: mime, size: buffer.length };
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
