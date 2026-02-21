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

export class RelayListService {
  constructor(
    private nostr: NostrClient,
    private signer: EventSigner
  ) {}

  async publish(relays: string[]): Promise<NostrEvent> {
    const tags: NostrTag[] = relays.map((relay) => ['r', relay]);
    const event = await this.signer.signEvent({
      kind: 10002,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: ''
    });
    await this.nostr.publishEvent(event);
    return event;
  }
}

export class PeopleListService {
  constructor(
    private nostr: NostrClient,
    private signer: EventSigner
  ) {}

  async publish({
    title,
    description,
    pubkeys,
    kind = 30000
  }: {
    title: string;
    description?: string;
    pubkeys: string[];
    kind?: number;
  }): Promise<NostrEvent> {
    const normalizedTitle = title.trim();
    const identifier = normalizedTitle.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'list';
    const tags: NostrTag[] = [
      ['d', identifier],
      ['title', normalizedTitle]
    ];
    if (description?.trim()) tags.push(['description', description.trim()]);
    pubkeys.forEach((pubkey) => tags.push(['p', pubkey]));
    const event = await this.signer.signEvent({
      kind,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: ''
    });
    await this.nostr.publishEvent(event);
    return event;
  }
}
