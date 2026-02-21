import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MediaCache } from '../src/p2p/mediaCache';

const originalURL = globalThis.URL;

beforeEach(() => {
  const baseURL = originalURL ?? ({} as typeof globalThis.URL);
  (globalThis as any).URL = {
    ...baseURL,
    revokeObjectURL: vi.fn()
  };
});

afterEach(() => {
  (globalThis as any).URL = originalURL as any;
  vi.restoreAllMocks();
});

describe('MediaCache', () => {
  it('evicts least recently used entries and revokes blob urls', () => {
    const cache = new MediaCache({ maxEntries: 1, ttlMs: 60_000 });
    cache.set('a', { url: 'blob:a', source: 'p2p' });
    cache.set('b', { url: 'blob:b', source: 'p2p' });
    expect((URL.revokeObjectURL as any).mock.calls[0][0]).toBe('blob:a');
  });

  it('expires entries by ttl', async () => {
    const cache = new MediaCache({ maxEntries: 2, ttlMs: 10 });
    cache.set('a', { url: 'blob:a', source: 'p2p' });
    await new Promise((resolve) => setTimeout(resolve, 25));
    cache.purgeExpired();
    expect(cache.get('a')).toBeUndefined();
  });
});
