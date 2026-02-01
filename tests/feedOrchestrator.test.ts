import { describe, it, expect, vi } from 'vitest';
import type { NostrEvent } from '../src/nostr/types';
import { FeedOrchestrator } from '../src/nostr/feed';

class FakeService {
  onEvent?: (event: NostrEvent) => void;
  subscribeTimeline({ onEvent }: { onEvent: (event: NostrEvent) => void }) {
    this.onEvent = onEvent;
  }
  stop() {}
}

class FakeClient {}

function makeEvent(id: string, pubkey: string): NostrEvent {
  return {
    id,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [],
    content: 'hi',
    sig: 'sig'
  };
}

describe('FeedOrchestrator filtering', () => {
  it('ignores events outside the author filter', () => {
    const service = new FakeService();
    const client = new FakeClient();
    const orchestrator = new FeedOrchestrator(client as any, service as any);
    const updates: NostrEvent[][] = [];

    orchestrator.subscribe(
      { follows: ['alice'], followers: [], feedMode: 'follows' },
      () => [],
      (next) => updates.push(next),
      () => null
    );

    service.onEvent?.(makeEvent('1', 'bob'));

    expect(updates.length).toBe(0);
  });

  it('invokes event assist for accepted events', () => {
    (globalThis as any).window = {
      setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms)
    };
    const service = new FakeService();
    const client = new FakeClient();
    const assist = vi.fn();
    const orchestrator = new FeedOrchestrator(client as any, service as any, undefined, undefined, assist);
    const updates: NostrEvent[][] = [];

    orchestrator.subscribe(
      { follows: ['alice'], followers: [], feedMode: 'follows' },
      () => [],
      (next) => updates.push(next),
      () => null
    );

    service.onEvent?.(makeEvent('1', 'alice'));

    expect(assist).toHaveBeenCalledTimes(1);
  });
});
