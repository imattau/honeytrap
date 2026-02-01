import type { Filter } from 'nostr-tools';
import type { NostrEvent } from './types';
import { NostrClient } from './client';
import type { FeedServiceApi } from './contracts';

export class FeedService implements FeedServiceApi {
  private unsub?: () => void;
  private backoffMs = 600;
  private retryTimer?: number;
  private active = false;
  private lastAuthors?: string[];
  private lastHandler?: (event: NostrEvent) => void;

  constructor(private client: NostrClient) {}

  async subscribeTimeline({
    authors,
    onEvent
  }: {
    authors?: string[];
    onEvent: (event: NostrEvent) => void;
  }) {
    this.active = true;
    this.lastAuthors = authors;
    this.lastHandler = onEvent;
    this.backoffMs = 600;
    this.startSubscription();
  }

  stop() {
    this.active = false;
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
    this.unsub?.();
  }

  private async startSubscription() {
    if (!this.active || !this.lastHandler) return;
    this.unsub?.();
    const filters: Filter[] = [{ kinds: [1, 30023], limit: 100 }];
    if (this.lastAuthors && this.lastAuthors.length > 0) filters[0].authors = this.lastAuthors;
    this.unsub = await this.client.subscribe(filters, this.lastHandler, () => {
      if (!this.active) return;
      const jitter = Math.floor(Math.random() * 250);
      const delay = Math.min(this.backoffMs + jitter, 30_000);
      this.retryTimer = window.setTimeout(() => {
        this.startSubscription();
      }, delay);
      this.backoffMs = Math.min(this.backoffMs * 1.7, 30_000);
    });
  }
}
