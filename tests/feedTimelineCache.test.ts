import { describe, it, expect, vi } from 'vitest';
import type { NostrEvent } from '../src/nostr/types';
import { FeedTimelineCache } from '../src/nostr/feedTimelineCache';

function makeEvent(id: string): NostrEvent {
  return {
    id,
    pubkey: 'pub',
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [],
    content: 'hi',
    sig: 'sig'
  };
}

describe('FeedTimelineCache', () => {
  it('stores snapshots and notifies listeners', () => {
    const cache = new FeedTimelineCache();
    const listener = vi.fn();
    const unsubscribe = cache.subscribe(listener);
    cache.set([makeEvent('a')]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(cache.snapshot().map((event) => event.id)).toEqual(['a']);
    unsubscribe();
  });

  it('resets timeline', () => {
    const cache = new FeedTimelineCache();
    cache.set([makeEvent('a')]);
    cache.reset();
    expect(cache.snapshot()).toEqual([]);
  });
});
