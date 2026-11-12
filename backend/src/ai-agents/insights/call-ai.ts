import {
  HttpException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

/**
 * Llama a la IA y convierte un timeout o un corte de red en un mensaje que el
 * usuario entiende; los errores que ya traen su propio mensaje (sin key,
 * key inválida) pasan tal cual.
 */
export async function callAi<T>(
  logger: Logger,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof HttpException) throw err;
    logger.warn(`La IA no respondió: ${String(err)}`);
    throw new ServiceUnavailableException(
      'La IA tardó demasiado o no respondió. Inténtalo de nuevo en unos minutos.',
    );
  }
}
