import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MediaAssist } from '../src/p2p/mediaAssist';
import { WebTorrentAssist } from '../src/p2p/webtorrent';
import type { AssistSource } from '../src/p2p/types';

const blobCacheGetSpy = vi.fn(async () => undefined);
const blobCacheSetSpy = vi.fn(async () => undefined);

vi.mock('../src/p2p/mediaBlobCache', () => {
  class MediaBlobCache {
    async get(...args: unknown[]) {
      return blobCacheGetSpy(...args);
    }
    async set(...args: unknown[]) {
      return blobCacheSetSpy(...args);
    }
  }
  return { MediaBlobCache };
});

const fetchSpy = vi.fn(async () => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => new TextEncoder().encode('data').buffer
}));
const originalURL = globalThis.URL;

beforeEach(() => {
  (globalThis as any).fetch = fetchSpy;
  const baseURL = originalURL ?? ({ } as typeof globalThis.URL);
  (globalThis as any).URL = {
    ...baseURL,
    createObjectURL: vi.fn(() => 'blob:mock')
  };
  fetchSpy.mockClear();
  blobCacheGetSpy.mockClear();
  blobCacheSetSpy.mockClear();
  blobCacheGetSpy.mockResolvedValue(undefined);
});

afterEach(() => {
  (globalThis as any).URL = originalURL as any;
  vi.restoreAllMocks();
});

function makeSettings(patch: Partial<ReturnType<typeof defaultSettings>> = {}) {
  return { ...defaultSettings(), ...patch };
}

function defaultSettings() {
  return {
    enabled: true,
    scope: 'everyone' as const,
    preferMedia: true,
    preferEvents: true,
    maxConcurrent: 5,
    maxFileSizeMb: 50,
    seedWhileOpen: true,
    trackers: ['wss://tracker.example']
  };
}

function makeSource(patch: Partial<AssistSource> = {}): AssistSource {
  return {
    url: 'https://example.com/media.jpg',
    magnet: 'magnet:?xt=urn:btih:abc',
    sha256: undefined,
    type: 'media',
    ...patch
  };
}

describe('MediaAssist reseed after HTTP', () => {
  it('triggers reseed when HTTP short-circuit happens', async () => {
    const ensureSpy = vi.spyOn(WebTorrentAssist.prototype, 'ensureWebSeed').mockImplementation(() => {});
    const assist = new MediaAssist(makeSettings({ preferMedia: false }));
    const source = makeSource({ sha256: undefined });

    const result = await assist.load(source, true, 1000);

    expect(result.source).toBe('http');
    expect(ensureSpy).toHaveBeenCalledTimes(1);
  });

  it('triggers reseed after HTTP fallback from assist', async () => {
    const ensureSpy = vi.spyOn(WebTorrentAssist.prototype, 'ensureWebSeed').mockImplementation(() => {});
    const assist = new MediaAssist(makeSettings({ preferMedia: true }));
    const source = makeSource({ sha256: undefined });

    const result = await assist.load(source, true, 1000);

    expect(result.source).toBe('http');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(ensureSpy).toHaveBeenCalledTimes(1);
  });

  it('triggers reseed from cached blob result without refetching HTTP', async () => {
    const ensureSpy = vi.spyOn(WebTorrentAssist.prototype, 'ensureWebSeed').mockImplementation(() => {});
    blobCacheGetSpy.mockResolvedValueOnce({ url: 'blob:cached-media', source: 'http' });
    const assist = new MediaAssist(makeSettings({ preferMedia: true }));
    const source = makeSource({ sha256: undefined });

    const result = await assist.load(source, true, 1000);

    expect(result.source).toBe('http');
    expect(result.url).toBe('blob:cached-media');
    expect(fetchSpy).toHaveBeenCalledTimes(0);
    expect(ensureSpy).toHaveBeenCalledTimes(1);
    expect(ensureSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'blob:cached-media',
        magnet: source.magnet,
        type: 'media'
      }),
      true
    );
  });
});
