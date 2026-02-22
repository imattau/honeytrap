import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NostrEvent } from '../src/nostr/types';
import { FeedOrchestrator } from '../src/nostr/feed';

class FakeService {
  onEvent?: (event: NostrEvent) => void;
  subscribeCalls = 0;
  stopCalls = 0;
  subscribeTimeline({ onEvent }: { onEvent: (event: NostrEvent) => void }) {
    this.subscribeCalls += 1;
    this.onEvent = onEvent;
  }
  stop() {
    this.stopCalls += 1;
  }
}

class FakeClient {
  async fetchProfile() {
    return undefined;
  }

  async fetchProfiles() {
    return {};
  }
}

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
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

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
    vi.runAllTimers();

    expect(updates.length).toBe(0);
  });

  it('ignores events matched by muted callback', () => {
    const service = new FakeService();
    const client = new FakeClient();
    const isMuted = vi.fn((event: NostrEvent) => event.content.toLowerCase().includes('spoiler'));
    const orchestrator = new FeedOrchestrator(
      client as any,
      service as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      isMuted
    );
    const updates: NostrEvent[][] = [];

    orchestrator.subscribe(
      { follows: ['alice'], followers: [], feedMode: 'follows' },
      () => [],
      (next) => updates.push(next),
      () => null
    );

    service.onEvent?.(makeEvent('1', 'alice', { content: 'spoiler text' }));
    vi.runAllTimers();

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
    vi.runAllTimers();

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
    vi.runAllTimers();

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
    vi.runAllTimers();

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
    vi.runAllTimers();

    expect(onPending).toHaveBeenCalledTimes(2);
    expect(onPending).toHaveBeenNthCalledWith(1, 1);
    expect(onPending).toHaveBeenNthCalledWith(2, 0);
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
    vi.runAllTimers();

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
    vi.runAllTimers();
    expect(updates.length).toBe(1);

    orchestrator.setPaused(true);
    service.onEvent?.(makeEvent('buffered', 'alice'));
    expect(updates.length).toBe(1);

    orchestrator.setPaused(false);
    expect(updates.length).toBe(2);
    expect(updates[1]?.some((event) => event.id === 'buffered')).toBe(true);
  });

  it('keeps live subscription active while paused and avoids resubscribe churn', () => {
    const service = new FakeService();
    const client = new FakeClient();
    const orchestrator = new FeedOrchestrator(client as any, service as any);

    orchestrator.subscribe(
      { follows: ['alice'], followers: [], feedMode: 'follows' },
      () => [],
      () => null,
      () => null
    );
    expect(service.subscribeCalls).toBe(1);

    orchestrator.setPaused(true);
    expect(service.stopCalls).toBe(0);

    orchestrator.setPaused(false);
    expect(service.subscribeCalls).toBe(1);
  });

  it('loads profiles for cached timeline events', async () => {
    const service = new FakeService();
    const fetchProfiles = vi.fn(async () => ({
      alice: { name: 'Alice' }
    }));
    const client = {
      fetchProfile: vi.fn(async () => undefined),
      fetchProfiles
    };
    const cache = {
      getRecentEvents: vi.fn(async () => [makeEvent('cached-1', 'alice')]),
      setRecentEvents: vi.fn(async () => undefined),
      setEvents: vi.fn(async () => undefined),
      setProfile: vi.fn(async () => undefined)
    };
    const orchestrator = new FeedOrchestrator(client as any, service as any, undefined, undefined, undefined, cache as any);
    const onProfiles = vi.fn();
    let current: NostrEvent[] = [];

    orchestrator.subscribe(
      { follows: [], followers: [], feedMode: 'all' },
      () => current,
      (next) => {
        current = next;
      },
      onProfiles
    );

    await vi.runAllTimersAsync();

    expect(fetchProfiles).toHaveBeenCalledWith(['alice']);
    expect(onProfiles).toHaveBeenCalledWith(expect.objectContaining({
      alice: expect.objectContaining({ name: 'Alice' })
    }));
  });

  it('batches live updates across burst events', () => {
    const service = new FakeService();
    const client = new FakeClient();
    const orchestrator = new FeedOrchestrator(client as any, service as any);
    const updates: NostrEvent[][] = [];
    let current: NostrEvent[] = [];

    orchestrator.subscribe(
      { follows: ['alice'], followers: [], feedMode: 'follows' },
      () => current,
      (next) => {
        current = next;
        updates.push(next);
      },
      () => null
    );

    service.onEvent?.(makeEvent('1', 'alice'));
    service.onEvent?.(makeEvent('2', 'alice'));
    service.onEvent?.(makeEvent('3', 'alice'));
    vi.runAllTimers();

    expect(updates.length).toBe(1);
    expect(updates[0]?.map((event) => event.id)).toEqual(['3', '2', '1']);
  });

  it('keeps newest buffered events when pending exceeds cap', () => {
    const service = new FakeService();
    const client = new FakeClient();
    const orchestrator = new FeedOrchestrator(client as any, service as any);
    const updates: NostrEvent[][] = [];
    let current: NostrEvent[] = [];

    orchestrator.subscribe(
      { follows: ['alice'], followers: [], feedMode: 'follows' },
      () => current,
      (next) => {
        current = next;
        updates.push(next);
      },
      () => null
    );

    service.onEvent?.(makeEvent('hydrated', 'alice', { created_at: 1_000 }));
    vi.runAllTimers();

    orchestrator.setPaused(true);
    for (let i = 1; i <= 405; i += 1) {
      service.onEvent?.(makeEvent(`e${i}`, 'alice', { created_at: 2_000 + i }));
    }

    orchestrator.setPaused(false);
    vi.runAllTimers();

    const latest = updates[updates.length - 1] ?? [];
    expect(latest.some((event) => event.id === 'e405')).toBe(true);
  });
});
