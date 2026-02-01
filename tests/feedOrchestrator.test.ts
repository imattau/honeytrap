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

function makeEvent(id: string, pubkey: string, patch: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [],
    content: 'hi',
    sig: 'sig',
    ...patch
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
      setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
      clearTimeout: (id: number) => clearTimeout(id)
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

  it('caches incoming events when flushed', () => {
    (globalThis as any).window = {
      setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
      clearTimeout: (id: number) => clearTimeout(id)
    };
    const service = new FakeService();
    const client = new FakeClient();
    const cache = {
      getRecentEvents: vi.fn(async () => []),
      setRecentEvents: vi.fn(async () => undefined),
      setEvents: vi.fn(async () => undefined)
    };
    const orchestrator = new FeedOrchestrator(client as any, service as any, undefined, undefined, undefined, cache as any);
    const updates: NostrEvent[][] = [];

    orchestrator.subscribe(
      { follows: ['alice'], followers: [], feedMode: 'follows' },
      () => [],
      (next) => updates.push(next),
      () => null
    );

    const event = makeEvent('1', 'alice');
    service.onEvent?.(event);

    expect(cache.setEvents).toHaveBeenCalledWith([event]);
  });

  it('marks relay immediately and verification via verifier callback', () => {
    const service = new FakeService();
    const client = new FakeClient();
    const transport = { mark: vi.fn() };
    const verifier = {
      verify: (_event: NostrEvent, onResult: (id: string, verified: boolean) => void) => {
        onResult('1', true);
      }
    };
    const orchestrator = new FeedOrchestrator(client as any, service as any, transport as any, undefined, undefined, undefined, verifier as any);

    orchestrator.subscribe(
      { follows: ['alice'], followers: [], feedMode: 'follows' },
      () => [],
      () => null,
      () => null
    );

    service.onEvent?.(makeEvent('1', 'alice'));

    expect(transport.mark).toHaveBeenNthCalledWith(1, '1', { relay: true });
    expect(transport.mark).toHaveBeenNthCalledWith(2, '1', { verified: true });
  });

  it('notifies pending count once per accepted event', () => {
    const service = new FakeService();
    const client = new FakeClient();
    const orchestrator = new FeedOrchestrator(client as any, service as any);
    const onPending = vi.fn();

    orchestrator.subscribe(
      { follows: ['alice'], followers: [], feedMode: 'follows' },
      () => [],
      () => null,
      () => null,
      onPending
    );

    service.onEvent?.(makeEvent('1', 'alice'));

    expect(onPending).toHaveBeenCalledTimes(1);
    expect(onPending).toHaveBeenCalledWith(1);
  });

  it('keeps only latest version for addressable posts', () => {
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

    const older = makeEvent('old', 'alice', {
      kind: 30023,
      created_at: 100,
      tags: [['d', 'post-1']]
    });
    const newer = makeEvent('new', 'alice', {
      kind: 30023,
      created_at: 200,
      tags: [['d', 'post-1']]
    });

    service.onEvent?.(older);
    service.onEvent?.(newer);

    const last = updates[updates.length - 1] ?? [];
    expect(last.filter((event) => event.kind === 30023)).toHaveLength(1);
    expect(last[0]?.id).toBe('new');
  });

  it('buffers while paused and flushes on resume', () => {
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

    service.onEvent?.(makeEvent('hydration', 'alice'));
    expect(updates.length).toBe(1);

    orchestrator.setPaused(true);
    service.onEvent?.(makeEvent('buffered', 'alice'));
    expect(updates.length).toBe(1);

    orchestrator.setPaused(false);
    expect(updates.length).toBe(2);
    expect(updates[1]?.some((event) => event.id === 'buffered')).toBe(true);
  });
});
