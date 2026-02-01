import type { NostrEvent, NostrTag } from './types';
import type { NostrClient } from './client';
import type { EventSigner } from './signer';
import type { TorrentStatus } from '../p2p/registry';
import type { Nip44Cipher } from './nip44';

export class TorrentListService {
  private readonly listId = 'active-torrents';
  private readonly listTitle = 'Active Torrents';

  constructor(
    private nostr: NostrClient,
    private signer: EventSigner,
    private cipher: Nip44Cipher
  ) {}

  async publish(items: TorrentStatus[]): Promise<NostrEvent | undefined> {
    const payload = JSON.stringify({
      version: 1,
      updatedAt: Date.now(),
      items
    });
    const encrypted = await this.cipher.encryptSelf(payload);
    if (!encrypted) return undefined;
    const tags: NostrTag[] = [
      ['d', this.listId],
      ['title', this.listTitle],
      ['type', this.listId],
      ['encrypted', 'nip44']
    ];
    const event = await this.signer.signEvent({
      kind: 30000,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: encrypted.content
    });
    await this.nostr.publishEvent(event);
    return event;
  }

  async load(pubkey: string): Promise<TorrentStatus[]> {
    const event = await this.nostr.fetchListEvent(pubkey, this.listId, 30000);
    if (!event?.content) return [];
    const decrypted = await this.cipher.decryptSelf(event.content);
    if (!decrypted) return [];
    try {
      const parsed = JSON.parse(decrypted) as { items?: TorrentStatus[] };
      return parsed.items ?? [];
    } catch {
      return [];
    }
  }
}
