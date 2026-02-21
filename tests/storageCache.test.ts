import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  loadCacheEntry: vi.fn(),
  saveCacheEntry: vi.fn(),
  deleteCacheEntry: vi.fn(),
  purgeExpiredCacheEntries: vi.fn()
}));

vi.mock('../src/storage/db', () => db);

const { CacheStore } = await import('../src/storage/cache');

beforeEach(() => {
  vi.useRealTimers();
  db.loadCacheEntry.mockReset();
  db.saveCacheEntry.mockReset();
  db.deleteCacheEntry.mockReset();
  db.purgeExpiredCacheEntries.mockReset();
  db.loadCacheEntry.mockResolvedValue(undefined);
  db.saveCacheEntry.mockResolvedValue(undefined);
  db.deleteCacheEntry.mockResolvedValue(undefined);
  db.purgeExpiredCacheEntries.mockResolvedValue(0);
});

describe('CacheStore', () => {
  it('evicts least recently used entry when evictionPolicy is lru', async () => {
    const cache = new CacheStore<string>({ maxEntries: 2, evictionPolicy: 'lru' });
    await cache.set('a', 'A', 60_000);
    await cache.set('b', 'B', 60_000);

    expect(await cache.get('a')).toBe('A');
    await cache.set('c', 'C', 60_000);

    expect(await cache.get('a')).toBe('A');
    expect(await cache.get('b')).toBeUndefined();
    expect(await cache.get('c')).toBe('C');
    expect(db.deleteCacheEntry).toHaveBeenCalledWith('b');
  });

  it('keeps FIFO eviction stable even after reads', async () => {
    const cache = new CacheStore<string>({ maxEntries: 2, evictionPolicy: 'fifo' });
    await cache.set('a', 'A', 60_000);
    await cache.set('b', 'B', 60_000);

    expect(await cache.get('a')).toBe('A');
    await cache.set('c', 'C', 60_000);

    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('b')).toBe('B');
    expect(await cache.get('c')).toBe('C');
    expect(db.deleteCacheEntry).toHaveBeenCalledWith('a');
  });

  it('flushes access updates on timer when persistAccessMs is set', async () => {
    vi.useFakeTimers();
    const cache = new CacheStore<string>({ persistAccessMs: 10, evictionPolicy: 'lru' });

    await cache.set('a', 'A', 60_000);
    db.saveCacheEntry.mockClear();

    await cache.get('a');
    expect(db.saveCacheEntry).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10);
    expect(db.saveCacheEntry).toHaveBeenCalledTimes(1);
    expect(db.saveCacheEntry.mock.calls[0]?.[0]).toMatchObject({ key: 'a' });
  });

  it('deletes expired persisted entries on read', async () => {
    const now = Date.now();
    db.loadCacheEntry.mockResolvedValue({
      key: 'expired',
      value: 'x',
      expiresAt: now - 1,
      storedAt: now - 1_000,
      accessAt: now - 1_000
    });
    const cache = new CacheStore<string>();

    expect(await cache.get('expired')).toBeUndefined();
    expect(db.deleteCacheEntry).toHaveBeenCalledWith('expired');
  });
});
