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
  private lastTags?: string[];
  private lastHandler?: (event: NostrEvent) => void;
  private lastOnClose?: (reasons: string[]) => void;

  constructor(private client: NostrClient) {}

  setRelays(_relays: string[]) {
    // Relays are owned by NostrClient.
  }

  async subscribeTimeline({
    authors,
    tags,
    onEvent,
    onClose
  }: {
    authors?: string[];
    tags?: string[];
    onEvent: (event: NostrEvent) => void;
    onClose?: (reasons: string[]) => void;
  }) {
    this.active = true;
    this.lastAuthors = authors;
    this.lastTags = tags;
    this.lastHandler = onEvent;
    this.lastOnClose = onClose;
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
    if (this.lastTags && this.lastTags.length > 0) filters[0]['#t'] = normalizeTags(this.lastTags);
    this.unsub = await this.client.subscribe(filters, this.lastHandler, (reasons) => {
      this.lastOnClose?.(reasons);
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

function normalizeTags(tags: string[]) {
  return tags.map((tag) => tag.trim().replace(/^#/, '').toLowerCase()).filter(Boolean);
}
