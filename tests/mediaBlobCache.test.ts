import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MediaBlobCache } from '../src/p2p/mediaBlobCache';

const originalURL = globalThis.URL;

vi.mock('../src/storage/cache', () => {
  class CacheStore<T> {
    private map = new Map<string, T>();
    async get(key: string) {
      return this.map.get(key);
    }
    async set(key: string, value: T) {
      this.map.set(key, value);
    }
  }
  return { CacheStore };
});

beforeEach(() => {
  const baseURL = originalURL ?? ({} as typeof globalThis.URL);
  (globalThis as any).URL = {
    ...baseURL,
    createObjectURL: vi.fn(() => 'blob:cached')
  };
});

afterEach(() => {
  (globalThis as any).URL = originalURL as any;
  vi.restoreAllMocks();
});

describe('MediaBlobCache', () => {
  it('stores and retrieves cached blobs as object URLs', async () => {
    const cache = new MediaBlobCache({ maxBytes: 1024 });
    const blob = new Blob(['hello']);
    await cache.set('key', blob, 'http');
    const result = await cache.get('key');
    expect(result?.url).toBe('blob:cached');
    expect(result?.source).toBe('http');
  });

  it('skips blobs larger than maxBytes', async () => {
    const cache = new MediaBlobCache({ maxBytes: 1 });
    const blob = new Blob(['hello']);
    await cache.set('key', blob, 'http');
    const result = await cache.get('key');
    expect(result).toBeUndefined();
  });
});
