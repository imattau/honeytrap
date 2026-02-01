import type { NostrEvent } from '../nostr/types';
import { cacheEvent, loadCachedEvents } from './db';

interface EventStoreOptions {
  recentLimit?: number;
}

export class EventStore {
  private recentLimit: number;

  constructor(options: EventStoreOptions = {}) {
    this.recentLimit = options.recentLimit ?? 150;
  }

  async saveRecent(events: NostrEvent[]): Promise<void> {
    const receivedAt = Date.now();
    await Promise.all(events.map((event) => cacheEvent({ id: event.id, event, receivedAt })));
  }

  async loadRecent(): Promise<NostrEvent[]> {
    const cached = await loadCachedEvents(this.recentLimit);
    return cached.map((item) => item.event as NostrEvent);
  }
}
