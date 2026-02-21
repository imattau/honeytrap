import { describe, expect, it, vi, afterEach } from 'vitest';
import { MemoryCache } from '../src/storage/memoryCache';

afterEach(() => {
  vi.useRealTimers();
});

describe('MemoryCache', () => {
  it('stores and retrieves values', () => {
    const cache = new MemoryCache<string>({ maxEntries: 2, ttlMs: 60_000 });
    cache.set('a', 'A');
    expect(cache.get('a')).toBe('A');
    expect(cache.size()).toBe(1);
  });

  it('evicts least recently used values when over capacity', () => {
    const cache = new MemoryCache<string>({ maxEntries: 2, ttlMs: 60_000 });
    cache.set('a', 'A');
    cache.set('b', 'B');
    expect(cache.get('a')).toBe('A');
    cache.set('c', 'C');

    expect(cache.get('a')).toBe('A');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe('C');
  });

  it('expires entries by TTL and supports stale purge', async () => {
    const cache = new MemoryCache<string>({ maxEntries: 2, ttlMs: 10 });
    cache.set('a', 'A');

    await new Promise((resolve) => {
      setTimeout(resolve, 15);
    });

    expect(cache.get('a')).toBeUndefined();
    cache.purgeExpired();
    expect(cache.size()).toBe(0);
  });

  it('calls onEvict for replacement and explicit delete', () => {
    const onEvict = vi.fn();
    const cache = new MemoryCache<string>({ maxEntries: 2, ttlMs: 60_000, onEvict });

    cache.set('a', 'A');
    cache.set('a', 'A2');
    cache.delete('a');

    expect(onEvict).toHaveBeenCalledWith('A');
    expect(onEvict).toHaveBeenCalledWith('A2');
  });
});
