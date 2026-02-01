import { describe, it, expect, vi } from 'vitest';
import type { NostrEvent } from '../src/nostr/types';

vi.mock('../src/storage/cache', () => {
  class CacheStore<T> {
    private map = new Map<string, T>();
    async get(key: string) {
      return this.map.get(key);
    }
    async set(key: string, value: T) {
      this.map.set(key, value);
    }
    async purgeExpired() {
      return;
    }
  }
  return { CacheStore };
});

const { NostrCache } = await import('../src/nostr/cache');

function makeEvent(id: string): NostrEvent {
  return {
    id,
    pubkey: 'pub',
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [],
    content: 'hello',
    sig: 'sig'
  };
}

describe('NostrCache recent events', () => {
  it('stores and retrieves recent feed events', async () => {
    const cache = new NostrCache();
    const events = [makeEvent('a'), makeEvent('b')];
    await cache.setRecentEvents(events);
    const fetched = await cache.getRecentEvents();
    expect(fetched?.map((e) => e.id)).toEqual(['a', 'b']);
  });
});
