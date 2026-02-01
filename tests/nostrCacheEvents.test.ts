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

vi.mock('../src/storage/eventStore', () => {
  class EventStore {
    async saveRecent() {
      return;
    }
    async loadRecent() {
      return [];
    }
  }
  return { EventStore };
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

describe('NostrCache batch event caching', () => {
  it('stores events via setEvents', async () => {
    const cache = new NostrCache();
    const events = [makeEvent('a'), makeEvent('b')];
    await cache.setEvents(events);
    const fetched = await Promise.all(events.map((event) => cache.getEvent(event.id)));
    expect(fetched.map((event) => event?.id)).toEqual(['a', 'b']);
  });
});
