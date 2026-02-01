import type { NostrEvent, NostrTag } from './types';
import type { EventSigner } from './signer';
import type { NostrClient } from './client';

export class MediaRelayListService {
  private readonly listId = 'media-relays';
  private readonly listTitle = 'Media Relays';

  constructor(
    private nostr: NostrClient,
    private signer: EventSigner
  ) {}

  async publish(urls: string[]): Promise<NostrEvent> {
    const tags: NostrTag[] = [
      ['d', this.listId],
      ['title', this.listTitle],
      ['type', this.listId]
    ];
    urls.forEach((url) => tags.push(['u', url]));
    const event = await this.signer.signEvent({
      kind: 30000,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: ''
    });
    await this.nostr.publishEvent(event);
    return event;
  }
}
