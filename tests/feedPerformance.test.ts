import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '../src/nostr/types';
import { FeedOrchestrator } from '../src/nostr/feed';
import { FeedTimelineCache } from '../src/nostr/feedTimelineCache';

class FakeService {
  onEvent?: (event: NostrEvent) => void;
  subscribeTimeline({ onEvent }: { onEvent: (event: NostrEvent) => void }) {
    this.onEvent = onEvent;
  }
  stop() {}
}

class FakeClient {
  async fetchProfile() {
    return undefined;
  }
}

function makeEvent(i: number): NostrEvent {
  return {
    id: `evt-${i}`,
    pubkey: `pub-${i % 250}`,
    created_at: 1_700_000_000 + i,
    kind: 1,
    tags: [],
    content: `post-${i}`,
    sig: `sig-${i}`
  };
}

describe('Feed stress', () => {
  it('handles burst ingestion and cache snapshot updates', () => {
    (globalThis as any).window = {
      setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
      clearTimeout: (id: number) => clearTimeout(id)
    };
    const service = new FakeService();
    const client = new FakeClient();
    const timeline = new FeedTimelineCache();
    const verifier = {
      verify: (_event: NostrEvent, onResult: (id: string, verified: boolean) => void) => onResult(_event.id, true)
    };
    const orchestrator = new FeedOrchestrator(
      client as any,
      service as any,
      undefined,
      undefined,
      undefined,
      undefined,
      verifier as any
    );

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

    // Prime hydration so subsequent events can be buffered while paused.
    service.onEvent?.(makeEvent(0));
    orchestrator.setPaused(true);

    const total = 8000;
    const start = Date.now();
    for (let i = 1; i <= total; i += 1) {
      service.onEvent?.(makeEvent(i));
    }
    orchestrator.setPaused(false);
    const elapsedMs = Date.now() - start;

    expect(snapshot.length).toBeGreaterThan(0);
    expect(snapshot.length).toBeLessThanOrEqual(300);
    // Broad upper bound to catch severe regressions without being flaky on slower machines.
    expect(elapsedMs).toBeLessThan(4000);
    orchestrator.stop();
  });

  it('simulates view changes under load (pause/resume) and still flushes quickly', () => {
    (globalThis as any).window = {
      setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
      clearTimeout: (id: number) => clearTimeout(id)
    };
    const service = new FakeService();
    const client = new FakeClient();
    const timeline = new FeedTimelineCache();
    const verifier = {
      verify: (event: NostrEvent, onResult: (id: string, verified: boolean) => void) => onResult(event.id, true)
    };
    const orchestrator = new FeedOrchestrator(
      client as any,
      service as any,
      undefined,
      undefined,
      undefined,
      undefined,
      verifier as any
    );

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

    // Initial hydration event
    service.onEvent?.(makeEvent(0));

    const start = Date.now();
    for (let i = 1; i <= 5000; i += 1) {
      if (i % 250 === 0) orchestrator.setPaused(true);   // simulate leaving feed route
      service.onEvent?.(makeEvent(i));
      if (i % 250 === 125) orchestrator.setPaused(false); // simulate returning to feed route
    }
    orchestrator.setPaused(false);
    const elapsedMs = Date.now() - start;

    expect(snapshot.length).toBeGreaterThan(0);
    expect(snapshot.length).toBeLessThanOrEqual(300);
    expect(elapsedMs).toBeLessThan(4000);
    orchestrator.stop();
  });
});
