import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NostrEvent } from '../src/nostr/types';
import { WorkerFeedService } from '../src/nostr/workerFeedService';

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

describe('WorkerFeedService', () => {
  const originalWorker = globalThis.Worker;
  let instance: MockWorker;

  beforeEach(() => {
    instance = new MockWorker();
    (globalThis as any).Worker = vi.fn(() => instance);
  });

  afterEach(() => {
    (globalThis as any).Worker = originalWorker;
    vi.restoreAllMocks();
  });

  it('subscribes via worker and forwards events', () => {
    const service = new WorkerFeedService({} as any);
    const onEvent = vi.fn();

    service.setRelays(['wss://relay.example']);
    service.subscribeTimeline({ authors: ['alice'], onEvent });

    const subscribe = instance.messages.find((message) => message.type === 'subscribe');
    expect(subscribe).toBeTruthy();
    expect(subscribe.relays).toEqual(['wss://relay.example']);
    expect(subscribe.authors).toEqual(['alice']);

    instance.emit({
      type: 'event',
      reqId: subscribe.reqId,
      event: makeEvent('e1')
    });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));
  });

  it('posts stop for active subscription', () => {
    const service = new WorkerFeedService({} as any);
    service.subscribeTimeline({ onEvent: () => null });
    const subscribe = instance.messages.find((message) => message.type === 'subscribe');
    service.stop();
    const stop = instance.messages.find((message) => message.type === 'stop');
    expect(stop).toBeTruthy();
    expect(stop.reqId).toBe(subscribe.reqId);
  });
});
