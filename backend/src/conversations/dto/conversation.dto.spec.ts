import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { SendMessageDto, AutoReplyDto, StatusDto } from './conversation.dto';

/**
 * El ValidationPipe global usa `whitelist: true` (main.ts): cualquier propiedad
 * sin decorador de class-validator se descarta antes de llegar al controlador.
 * Estos tests fijan que el body de la bandeja de entrada sobrevive al pipe.
 */
describe('DTOs de conversaciones bajo el ValidationPipe global', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  const run = <T>(value: unknown, metatype: new () => T) =>
    pipe.transform(value, { type: 'body', metatype }) as Promise<T>;

  it('conserva el texto del mensaje', async () => {
    const dto = await run({ text: 'hola', type: 'text' }, SendMessageDto);
    expect(dto.text).toBe('hola');
    expect(dto.type).toBe('text');
  });

  it('conserva los datos del adjunto', async () => {
    const dto = await run(
      {
        text: '',
        type: 'image',
        mediaUrl: 'https://s3/x.png',
        mediaKey: 'k',
        mimeType: 'image/png',
        filename: 'x.png',
        size: 120,
      },
      SendMessageDto,
    );
    expect(dto.mediaUrl).toBe('https://s3/x.png');
    expect(dto.size).toBe(120);
  });

  it('descarta propiedades ajenas al DTO', async () => {
    const dto = await run({ text: 'hola', hacker: 1 }, SendMessageDto);
    expect(dto).not.toHaveProperty('hacker');
  });

  it('conserva enabled al apagar el agente', async () => {
    const dto = await run({ enabled: false }, AutoReplyDto);
    expect(dto.enabled).toBe(false);
  });

  it('rechaza enabled ausente', async () => {
    await expect(run({}, AutoReplyDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('conserva el estado del chat', async () => {
    const dto = await run({ status: 'closed' }, StatusDto);
    expect(dto.status).toBe('closed');
  });

  it('rechaza un estado inválido', async () => {
    await expect(run({ status: 'archivado' }, StatusDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
