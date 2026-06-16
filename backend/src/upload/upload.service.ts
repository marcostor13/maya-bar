import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const ALLOWED_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO = ['video/mp4', 'video/quicktime', 'video/webm'];
const ALLOWED_DOC = ['application/pdf'];
const ALL_ALLOWED = [...ALLOWED_IMAGE, ...ALLOWED_VIDEO, ...ALLOWED_DOC];

const MAX_SIZE_IMAGE = 10 * 1024 * 1024; // 10 MB
const MAX_SIZE_VIDEO = 200 * 1024 * 1024; // 200 MB
const MAX_SIZE_DOC = 20 * 1024 * 1024; // 20 MB

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
        secretAccessKey: configService.get<string>('AWS_SECRET_ACCESS_KEY') ?? '',
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
        : MAX_SIZE_DOC;

    if (file.size > maxSize) {
      throw new BadRequestException(
        `Archivo demasiado grande (máx ${maxSize / 1024 / 1024} MB)`,
      );
    }

    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? 'bin';
    const key = `${folder}/${randomUUID()}.${ext}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        CacheControl: 'max-age=31536000',
      }),
    );

    const url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    return { url, key, contentType: file.mimetype, size: file.size };
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
