import { LRUCache } from 'lru-cache';
import type { NostrEvent } from '../nostr/types';

const MAX_PREVIEWS = 32;
const previews = new LRUCache<string, NostrEvent>({
  max: MAX_PREVIEWS
});

export function stashThreadPreview(event: NostrEvent) {
  previews.set(event.id, event);
}

export function getThreadPreview(id: string): NostrEvent | undefined {
  return previews.get(id);
}
