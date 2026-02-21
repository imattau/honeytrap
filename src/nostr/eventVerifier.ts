import { verifyEvent } from 'nostr-tools';
import Denque from 'denque';
import type { NostrEvent } from './types';

export interface EventVerifier {
  verify(event: NostrEvent, onResult: (id: string, verified: boolean) => void): void;
}

interface QueueItem {
  event: NostrEvent;
  listeners: Array<(id: string, verified: boolean) => void>;
}

export class AsyncEventVerifier implements EventVerifier {
  private pending = new Map<string, QueueItem>();
  private queue = new Denque<string>();
  private running = false;

  constructor(private maxPerTick = 12, private maxTickMs = 8) {}

  verify(event: NostrEvent, onResult: (id: string, verified: boolean) => void) {
    const existing = this.pending.get(event.id);
    if (existing) {
      existing.listeners.push(onResult);
      return;
    }
    this.pending.set(event.id, { event, listeners: [onResult] });
    this.queue.push(event.id);
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
    while (!this.queue.isEmpty() && processed < this.maxPerTick && (Date.now() - start) < this.maxTickMs) {
      const id = this.queue.shift();
      if (!id) continue;
      const item = this.pending.get(id);
      if (!item) continue;
      this.pending.delete(id);
      let verified = false;
      try {
        verified = verifyEvent(item.event as any);
      } catch {
        verified = false;
      }
      item.listeners.forEach((listener) => listener(id, verified));
      processed += 1;
    }
    if (!this.queue.isEmpty()) {
      globalThis.setTimeout(() => this.runTick(), 0);
      return;
    }
    this.running = false;
  }
}
