import { MediaUnderstandingService } from './media-understanding.service';

function mockResponse(body: unknown, ok = true) {
  return {
    ok,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue('boom'),
  } as unknown as Response;
}

const openAiText = (text: string) => ({
  choices: [{ message: { content: text } }],
});
const geminiText = (text: string) => ({
  candidates: [{ content: { parts: [{ text }] } }],
});

describe('MediaUnderstandingService', () => {
  let service: MediaUnderstandingService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new MediaUnderstandingService();
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => fetchSpy.mockRestore());

  // ─── audio ────────────────────────────────────────────────────────────────

  it('transcribes a voice note with OpenAI and names the file by its mime type', async () => {
    fetchSpy.mockResolvedValue(mockResponse({ text: 'quiero reservar mesa' }));

    const result = await service.interpret(
      {
        kind: 'voice',
        buffer: Buffer.from('audio'),
        mimeType: 'audio/ogg; codecs=opus',
      },
      { openai: 'sk-test' },
    );

    expect(result).toEqual({ text: 'quiero reservar mesa', source: 'openai' });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('https://api.openai.com/v1/audio/transcriptions');
    const form = (init as RequestInit).body as FormData;
    expect((form.get('file') as File).name).toBe('audio.ogg');
    // El parámetro `codecs` se descarta: los proveedores rechazan el mime completo.
    expect((form.get('file') as File).type).toBe('audio/ogg');
  });

  it('falls back to Gemini when there is no OpenAI key', async () => {
    fetchSpy.mockResolvedValue(mockResponse(geminiText('hola, ¿abren hoy?')));

    const result = await service.interpret(
      { kind: 'voice', buffer: Buffer.from('audio'), mimeType: 'audio/ogg' },
      { gemini: 'g-key' },
    );

    expect(result?.source).toBe('gemini');
    expect(String(fetchSpy.mock.calls[0][0])).toContain(
      'generativelanguage.googleapis.com',
    );
  });

  it('falls back to the next provider when the first one fails', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockResponse({}, false))
      .mockResolvedValueOnce(mockResponse(geminiText('lo dicho en el audio')));

    const result = await service.interpret(
      { kind: 'audio', buffer: Buffer.from('audio'), mimeType: 'audio/mpeg' },
      { openai: 'sk-test', gemini: 'g-key' },
    );

    expect(result).toEqual({ text: 'lo dicho en el audio', source: 'gemini' });
  });

  it('returns null when no key can read the audio', async () => {
    const result = await service.interpret(
      { kind: 'voice', buffer: Buffer.from('audio'), mimeType: 'audio/ogg' },
      { deepseek: 'ds-key' },
    );

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ─── imagen y video ───────────────────────────────────────────────────────

  it('describes an image with OpenAI vision', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(openAiText('Comprobante de pago por S/ 120')),
    );

    const result = await service.interpret(
      { kind: 'image', buffer: Buffer.from('img'), mimeType: 'image/jpeg' },
      { openai: 'sk-test' },
    );

    expect(result?.text).toBe('Comprobante de pago por S/ 120');
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    ) as { messages: { content: { type: string }[] }[] };
    expect(body.messages[0].content[1].type).toBe('image_url');
  });

  it('only reads video with Gemini and skips it when that key is missing', async () => {
    const result = await service.interpret(
      { kind: 'video', buffer: Buffer.from('vid'), mimeType: 'video/mp4' },
      { openai: 'sk-test', claude: 'cl-key' },
    );

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ─── documentos ───────────────────────────────────────────────────────────

  it('reads a text document locally, without calling any provider', async () => {
    const result = await service.interpret(
      {
        kind: 'document',
        buffer: Buffer.from('Lista de precios: menú del día S/ 25'),
        mimeType: 'text/plain',
        filename: 'precios.txt',
      },
      { openai: 'sk-test' },
    );

    expect(result).toEqual({
      text: 'Lista de precios: menú del día S/ 25',
      source: 'local',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('skips files that are too big for the provider', async () => {
    const result = await service.interpret(
      {
        kind: 'image',
        buffer: Buffer.alloc(6 * 1024 * 1024),
        mimeType: 'image/png',
      },
      { openai: 'sk-test' },
    );

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
