import { verifyEvent } from 'nostr-tools';
import type { NostrEvent } from './types';

export interface EventVerifier {
  verify(event: NostrEvent, onResult: (id: string, verified: boolean) => void): void;
}

interface QueueItem {
  event: NostrEvent;
  listeners: Array<(id: string, verified: boolean) => void>;
}

export class AsyncEventVerifier implements EventVerifier {
  private queue = new Map<string, QueueItem>();
  private running = false;

  constructor(private maxPerTick = 12, private maxTickMs = 8) {}

  verify(event: NostrEvent, onResult: (id: string, verified: boolean) => void) {
    const existing = this.queue.get(event.id);
    if (existing) {
      existing.listeners.push(onResult);
      return;
    }
    this.queue.set(event.id, { event, listeners: [onResult] });
    this.schedule();
  }

  private schedule() {
    if (this.running) return;
    this.running = true;
    globalThis.setTimeout(() => this.runTick(), 0);
  }

  private runTick() {
    const start = Date.now();
    let processed = 0;
    while (this.queue.size > 0 && processed < this.maxPerTick && (Date.now() - start) < this.maxTickMs) {
      const next = this.queue.entries().next().value as [string, QueueItem] | undefined;
      if (!next) break;
      const [id, item] = next;
      this.queue.delete(id);
      let verified = false;
      try {
        verified = verifyEvent(item.event as any);
      } catch {
        verified = false;
      }
      item.listeners.forEach((listener) => listener(id, verified));
      processed += 1;
    }
    if (this.queue.size > 0) {
      globalThis.setTimeout(() => this.runTick(), 0);
      return;
    }
    this.running = false;
  }
}
