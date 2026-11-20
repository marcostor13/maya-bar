/**
 * Música de la landing de un evento (HU22).
 *
 * Spotify ignora `autoplay=1` en su iframe y el navegador no deja que un iframe
 * ajeno arranque solo: hacía falta un segundo clic dentro del reproductor. Con
 * su iFrame API el botón de la página le ordena `play()` directamente.
 */

const SPOTIFY_TYPES = ['track', 'album', 'playlist', 'episode', 'show', 'artist'];

/**
 * URI de Spotify (`spotify:track:ID`) a partir de un código embed, un enlace
 * `open.spotify.com/...` o la propia URI. `null` si no es de Spotify.
 */
export function spotifyUri(code: string): string | null {
  const text = (code ?? '').trim();
  if (!text) return null;
  const direct = text.match(/^spotify:([a-z]+):([A-Za-z0-9]+)$/);
  if (direct && SPOTIFY_TYPES.includes(direct[1])) return text;
  const m = text.match(
    /open\.spotify\.com\/(?:embed\/)?(?:intl-[a-z-]+\/)?([a-z]+)\/([A-Za-z0-9]+)/i,
  );
  if (!m || !SPOTIFY_TYPES.includes(m[1].toLowerCase())) return null;
  return `spotify:${m[1].toLowerCase()}:${m[2]}`;
}

/** Controlador que entrega `IFrameAPI.createController`. */
export interface SpotifyController {
  play(): void;
  togglePlay(): void;
  pause(): void;
  destroy(): void;
  addListener(event: 'ready', cb: () => void): void;
  addListener(event: 'playback_update', cb: (e: { data: { isPaused: boolean } }) => void): void;
}

export interface SpotifyIframeApi {
  createController(
    el: HTMLElement,
    opts: { uri: string; width?: string | number; height?: string | number },
    cb: (controller: SpotifyController) => void,
  ): void;
}

type SpotifyWindow = Window & {
  onSpotifyIframeApiReady?: (api: SpotifyIframeApi) => void;
  SpotifyIframeApi?: SpotifyIframeApi;
};

export const SPOTIFY_IFRAME_API_SRC = 'https://open.spotify.com/embed/iframe-api/v1';
/** Si Spotify no responde en este tiempo, la landing vuelve al iframe. */
export const SPOTIFY_LOAD_TIMEOUT_MS = 8000;

let pending: Promise<SpotifyIframeApi> | null = null;

/** Carga el script una sola vez; las llamadas siguientes reciben la misma API. */
export function loadSpotifyIframeApi(
  doc: Document = document,
  timeoutMs = SPOTIFY_LOAD_TIMEOUT_MS,
): Promise<SpotifyIframeApi> {
  const win = doc.defaultView as SpotifyWindow | null;
  if (!win) return Promise.reject(new Error('Sin ventana'));
  if (win.SpotifyIframeApi) return Promise.resolve(win.SpotifyIframeApi);
  if (pending) return pending;
  pending = new Promise<SpotifyIframeApi>((resolve, reject) => {
    const script = doc.createElement('script');
    const fail = (msg: string) => {
      pending = null;
      script.remove();
      reject(new Error(msg));
    };
    // Un script que carga pero nunca avisa dejaría el botón colgado.
    const timer = setTimeout(() => fail('Spotify no respondió'), timeoutMs);
    win.onSpotifyIframeApiReady = (api) => {
      clearTimeout(timer);
      win.SpotifyIframeApi = api;
      resolve(api);
    };
    script.src = SPOTIFY_IFRAME_API_SRC;
    script.async = true;
    script.onerror = () => {
      clearTimeout(timer);
      fail('No se pudo cargar Spotify');
    };
    doc.body.appendChild(script);
  });
  return pending;
}

/** Solo para pruebas: olvida la carga en curso. */
export function resetSpotifyIframeApiForTests(): void {
  pending = null;
}
