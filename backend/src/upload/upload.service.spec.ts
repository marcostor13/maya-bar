import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { UploadService } from './upload.service';

describe('UploadService: tipos de audio (HU22)', () => {
  let service: UploadService;
  let send: jest.Mock;

  beforeEach(() => {
    const config = {
      get: (k: string) => ({ S3_BUCKET: 'bucket', S3_REGION: 'us-east-1' })[k],
    } as unknown as ConfigService;
    service = new UploadService(config);
    send = jest.fn().mockResolvedValue({});
    (service as unknown as { s3: { send: jest.Mock } }).s3 = { send };
  });

  const file = (mimetype: string, originalname: string) =>
    ({
      mimetype,
      originalname,
      size: 1024,
      buffer: Buffer.from('x'),
    }) as Express.Multer.File;

  it('C5: acepta un .m4a subido como audio/x-m4a', async () => {
    const res = await service.upload(
      file('audio/x-m4a', 'cancion.m4a'),
      'events',
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(res.key).toMatch(/^events\/.+\.m4a$/);
    expect(res.contentType).toBe('audio/x-m4a');
  });

  it('sigue rechazando tipos fuera de la lista', async () => {
    await expect(
      service.upload(file('audio/flac', 'a.flac'), 'events'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(send).not.toHaveBeenCalled();
  });
});
