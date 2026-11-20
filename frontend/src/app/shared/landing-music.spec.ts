import {
  SPOTIFY_IFRAME_API_SRC,
  loadSpotifyIframeApi,
  resetSpotifyIframeApiForTests,
  spotifyUri,
  type SpotifyIframeApi,
} from './landing-music';

describe('landing-music (HU22)', () => {
  describe('spotifyUri', () => {
    it('C4: saca la URI de un código embed', () => {
      expect(
        spotifyUri(
          '<iframe style="border-radius:12px" src="https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC?utm_source=generator" width="100%" height="352"></iframe>',
        ),
      ).toBe('spotify:track:4uLU6hMCjMI75M1A2tKUQC');
    });

    it('C4: acepta enlaces de compartir, con o sin intl', () => {
      expect(spotifyUri('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc')).toBe(
        'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M',
      );
      expect(spotifyUri('https://open.spotify.com/intl-es/album/1A2B3c')).toBe('spotify:album:1A2B3c');
      expect(spotifyUri('https://open.spotify.com/embed/episode/7x')).toBe('spotify:episode:7x');
      expect(spotifyUri('https://open.spotify.com/show/9z')).toBe('spotify:show:9z');
      expect(spotifyUri('spotify:track:abc123')).toBe('spotify:track:abc123');
    });

    it('C4: lo que no es de Spotify devuelve null', () => {
      expect(spotifyUri('<iframe src="https://www.youtube.com/embed/xyz"></iframe>')).toBeNull();
      expect(spotifyUri('https://open.spotify.com/user/abc')).toBeNull();
      expect(spotifyUri('')).toBeNull();
    });
  });

  describe('loadSpotifyIframeApi', () => {
    afterEach(() => {
      resetSpotifyIframeApiForTests();
      document.querySelectorAll(`script[src="${SPOTIFY_IFRAME_API_SRC}"]`).forEach((s) => s.remove());
      const w = window as unknown as Record<string, unknown>;
      delete w['SpotifyIframeApi'];
      delete w['onSpotifyIframeApiReady'];
    });

    it('inserta el script una sola vez y resuelve con la API', async () => {
      const a = loadSpotifyIframeApi();
      const b = loadSpotifyIframeApi();
      expect(document.querySelectorAll(`script[src="${SPOTIFY_IFRAME_API_SRC}"]`)).toHaveLength(1);
      const api = { createController: vi.fn() } as unknown as SpotifyIframeApi;
      (window as unknown as { onSpotifyIframeApiReady: (x: SpotifyIframeApi) => void }).onSpotifyIframeApiReady(api);
      await expect(a).resolves.toBe(api);
      await expect(b).resolves.toBe(api);
      // Ya cargada, no vuelve a insertar el script.
      await expect(loadSpotifyIframeApi()).resolves.toBe(api);
    });

    it('si Spotify no avisa a tiempo, rechaza y permite reintentar', async () => {
      vi.useFakeTimers();
      try {
        const p = loadSpotifyIframeApi(document, 100);
        vi.advanceTimersByTime(101);
        await expect(p).rejects.toThrow('Spotify no respondió');
        expect(document.querySelectorAll(`script[src="${SPOTIFY_IFRAME_API_SRC}"]`)).toHaveLength(0);
        void loadSpotifyIframeApi(document, 100).catch(() => undefined);
        expect(document.querySelectorAll(`script[src="${SPOTIFY_IFRAME_API_SRC}"]`)).toHaveLength(1);
        vi.advanceTimersByTime(101);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
