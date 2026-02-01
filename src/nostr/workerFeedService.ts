import type { NostrEvent } from './types';
import { FeedService } from './service';
import type { FeedServiceApi } from './contracts';
import type { NostrClient } from './client';
import type { FeedWorkerRequest, FeedWorkerResponse } from './worker/feedFetchProtocol';

interface SubscriptionState {
  authors?: string[];
  tags?: string[];
  onEvent: (event: NostrEvent) => void;
  onClose?: (reasons: string[]) => void;
}

export class WorkerFeedService implements FeedServiceApi {
  private worker?: Worker;
  private fallback: FeedService;
  private relays: string[] = [];
  private reqId?: string;
  private state?: SubscriptionState;
  private backoffMs = 600;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private deliveryTimer?: ReturnType<typeof setTimeout>;
  private deliveryQueue: NostrEvent[] = [];
  private delivering = false;
  private active = false;

  constructor(nostr: NostrClient) {
    this.fallback = new FeedService(nostr);
    this.worker = createWorker();
    if (this.worker) {
      this.worker.onmessage = (event: MessageEvent<FeedWorkerResponse>) => this.handleMessage(event.data);
    }
  }

  setRelays(relays: string[]) {
    this.relays = relays;
    this.fallback.setRelays(relays);
  }

  subscribeTimeline(input: { authors?: string[]; tags?: string[]; onEvent: (event: NostrEvent) => void; onClose?: (reasons: string[]) => void }): void {
    if (!this.worker) {
      this.fallback.subscribeTimeline(input);
      return;
    }
    this.active = true;
    this.state = {
      authors: input.authors,
      tags: input.tags,
      onEvent: input.onEvent,
      onClose: input.onClose
    };
    this.backoffMs = 600;
    this.reqId = `feed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.post({
      type: 'subscribe',
      reqId: this.reqId,
      relays: this.relays,
      authors: input.authors,
      tags: input.tags
    });
  }

  stop() {
    this.active = false;
    if (this.retryTimer) globalThis.clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    if (this.deliveryTimer) globalThis.clearTimeout(this.deliveryTimer);
    this.deliveryTimer = undefined;
    this.deliveryQueue = [];
    this.delivering = false;
    if (!this.worker) {
      this.fallback.stop();
      return;
    }
    if (!this.reqId) return;
    this.post({ type: 'stop', reqId: this.reqId });
    this.reqId = undefined;
  }

  destroy() {
    this.stop();
    if (this.worker) {
      this.post({ type: 'shutdown' });
      this.worker.terminate();
      this.worker = undefined;
    }
  }

  private handleMessage(message: FeedWorkerResponse) {
    if (!this.reqId || !this.state || message.reqId !== this.reqId) return;
    if (message.type === 'event') {
      this.enqueueEvents([message.event]);
      return;
    }
    if (message.type === 'event-batch') {
      this.enqueueEvents(message.events);
      return;
    }
    if (message.type === 'close') {
      this.state.onClose?.(message.reasons);
      if (!this.active) return;
      const jitter = Math.floor(Math.random() * 250);
      const delay = Math.min(this.backoffMs + jitter, 30_000);
      this.retryTimer = globalThis.setTimeout(() => {
        if (!this.active || !this.reqId || !this.state) return;
        this.post({
          type: 'subscribe',
          reqId: this.reqId,
          relays: this.relays,
          authors: this.state.authors,
          tags: this.state.tags
        });
      }, delay);
      this.backoffMs = Math.min(this.backoffMs * 1.7, 30_000);
      return;
    }
    this.state.onClose?.([message.message]);
  }

  private post(message: FeedWorkerRequest) {
    this.worker?.postMessage(message);
  }

  private enqueueEvents(events: NostrEvent[]) {
    if (!this.active || !this.state) return;
    this.deliveryQueue.push(...events);
    if (this.delivering) return;
    this.delivering = true;
    this.deliveryTimer = globalThis.setTimeout(() => this.flushEvents(), 0);
  }

  private flushEvents() {
    this.deliveryTimer = undefined;
    if (!this.active || !this.state) {
      this.deliveryQueue = [];
      this.delivering = false;
      return;
    }
    const start = Date.now();
    let processed = 0;
    while (this.deliveryQueue.length > 0 && processed < 80 && (Date.now() - start) < 8) {
      const event = this.deliveryQueue.shift();
      if (!event) break;
      this.state.onEvent(event);
      processed += 1;
    }
    if (this.deliveryQueue.length > 0) {
      this.deliveryTimer = globalThis.setTimeout(() => this.flushEvents(), 0);
      return;
    }
    this.delivering = false;
  }
}

function createWorker(): Worker | undefined {
  if (typeof Worker === 'undefined') return undefined;
  return new Worker(new URL('./worker/feedFetch.worker.ts', import.meta.url), { type: 'module' });
}
