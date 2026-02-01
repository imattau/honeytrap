import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NostrEvent } from '../src/nostr/types';
import { WorkerFeedService } from '../src/nostr/workerFeedService';
import { FeedOrchestrator } from '../src/nostr/feed';
import { FeedTimelineCache } from '../src/nostr/feedTimelineCache';

class MockWorker {
  onmessage: ((event: MessageEvent<any>) => void) | null = null;
  messages: any[] = [];

  postMessage(message: any) {
    this.messages.push(message);
  }

  terminate() {}

  emit(data: any) {
    this.onmessage?.({ data } as MessageEvent<any>);
  }
}

class FakeClient {
  async fetchProfile() {
    return undefined;
  }
}

function makeEvent(i: number): NostrEvent {
  const isAddressable = i % 30 === 0;
  return {
    id: `evt-${i}`,
    pubkey: 'stress-author',
    created_at: 1_700_000_000 + i,
    kind: isAddressable ? 30023 : 1,
    tags: isAddressable ? [['d', `doc-${Math.floor(i / 60)}`]] : [],
    content: `payload-${i}`,
    sig: `sig-${i}`
  };
}

function identityKey(event: NostrEvent) {
  if (event.kind >= 30000 && event.kind < 40000) {
    const d = event.tags.find((tag) => tag[0] === 'd' && tag[1])?.[1];
    if (d) return `a:${event.kind}:${event.pubkey}:${d}`;
  }
  return `id:${event.id}`;
}

describe('App E2E stress', () => {
  const originalWorker = globalThis.Worker;
  let worker: MockWorker;

  beforeEach(() => {
    worker = new MockWorker();
    (globalThis as any).Worker = vi.fn(() => worker);
    (globalThis as any).window = {
      setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
      clearTimeout: (id: number) => clearTimeout(id)
    };
  });

  afterEach(() => {
    (globalThis as any).Worker = originalWorker;
    vi.restoreAllMocks();
  });

  it('handles high-throughput ingest with pause/resume route changes', () => {
    const service = new WorkerFeedService(new FakeClient() as any);
    service.setRelays(['wss://relay.example']);
    const verifier = {
      verify: (event: NostrEvent, onResult: (id: string, verified: boolean) => void) => onResult(event.id, true)
    };
    const orchestrator = new FeedOrchestrator(
      new FakeClient() as any,
      service as any,
      undefined,
      undefined,
      undefined,
      undefined,
      verifier as any
    );
    const timeline = new FeedTimelineCache();
    let snapshot: NostrEvent[] = [];
    timeline.subscribe(() => {
      snapshot = timeline.snapshot();
    });

    orchestrator.subscribe(
      { follows: [], followers: [], feedMode: 'all' },
      () => snapshot,
      (next) => timeline.set(next),
      () => null
    );

    const subscribe = worker.messages.find((message) => message.type === 'subscribe');
    expect(subscribe).toBeTruthy();
    const reqId = subscribe.reqId as string;

    const total = 12000;
    const start = Date.now();
    for (let i = 0; i < total; i += 1) {
      if (i > 0 && i % 500 === 0) orchestrator.setPaused(true);
      worker.emit({ type: 'event', reqId, event: makeEvent(i) });
      if (i % 500 === 250) orchestrator.setPaused(false);
    }
    orchestrator.setPaused(false);
    const elapsedMs = Date.now() - start;

    const uniqueIdentityCount = new Set(snapshot.map(identityKey)).size;
    expect(snapshot.length).toBeGreaterThan(0);
    expect(snapshot.length).toBeLessThanOrEqual(300);
    expect(uniqueIdentityCount).toBe(snapshot.length);
    expect(elapsedMs).toBeLessThan(5000);

    orchestrator.stop();
    service.destroy();
  });
});
