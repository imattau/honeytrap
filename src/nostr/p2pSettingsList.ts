import type { NostrEvent, NostrTag } from './types';
import type { NostrClient } from './client';
import type { EventSigner } from './signer';
import type { P2PSettings } from '../storage/types';
import type { Nip44Cipher } from './nip44';

export class P2PSettingsListService {
  private readonly listId = 'p2p-settings';
  private readonly listTitle = 'P2P Settings';

  constructor(
    private nostr: NostrClient,
    private signer: EventSigner,
    private cipher: Nip44Cipher
  ) {}

  async publish(settings: P2PSettings, updatedAt = Date.now()): Promise<NostrEvent | undefined> {
    const payload = JSON.stringify({
      version: 1,
      updatedAt,
      settings
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

  async load(pubkey: string): Promise<{ settings: P2PSettings; updatedAt: number } | undefined> {
    const event = await this.nostr.fetchListEvent(pubkey, this.listId, 30000);
    if (!event?.content) return undefined;
    const decrypted = await this.cipher.decryptSelf(event.content);
    if (!decrypted) return undefined;
    try {
      const parsed = JSON.parse(decrypted) as { settings?: P2PSettings; updatedAt?: number };
      if (!parsed.settings) return undefined;
      return {
        settings: parsed.settings,
        updatedAt: parsed.updatedAt ?? 0
      };
    } catch {
      return undefined;
    }
  }
}
