import { describe, it, expect, vi } from 'vitest';

vi.mock('nostr-tools', () => ({
  verifyEvent: vi.fn(() => true)
}));

import { AsyncEventVerifier } from '../src/nostr/eventVerifier';
import type { NostrEvent } from '../src/nostr/types';

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

describe('AsyncEventVerifier', () => {
  it('deduplicates queued verifications per event id', async () => {
    vi.useFakeTimers();
    const verifier = new AsyncEventVerifier(10, 10);
    const fnA = vi.fn();
    const fnB = vi.fn();
    const event = makeEvent('a');
    verifier.verify(event, fnA);
    verifier.verify(event, fnB);
    vi.runAllTimers();
    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
