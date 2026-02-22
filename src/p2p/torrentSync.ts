import type { TorrentSnapshot, TorrentStatus } from './registry';
import type { TorrentListService } from '../nostr/torrentList';

export class TorrentSyncService {
  private hydratedForPubkey?: string;
  private hydrateRequestId = 0;
  private publishTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private listService: TorrentListService,
    private publishPublic?: (items: TorrentStatus[]) => Promise<void>
  ) {}

  async hydrate(pubkey: string, onItems: (snapshot: TorrentSnapshot) => void) {
    if (this.hydratedForPubkey === pubkey) return;
    const requestId = ++this.hydrateRequestId;
    try {
      const items = await this.listService.load(pubkey);
      if (requestId !== this.hydrateRequestId) return;
      if (items === null) return;
      const snapshot: TorrentSnapshot = {};
      items.forEach((item) => {
        snapshot[item.magnet] = item;
      });
      onItems(snapshot);
    } finally {
      // Always mark as hydrated so schedulePublish is unblocked,
      // even when load() throws (network error, relay timeout, decrypt failure).
      // Skip if a newer hydrate request superseded this one.
      if (requestId === this.hydrateRequestId) {
        this.hydratedForPubkey = pubkey;
      }
    }
  }

  schedulePublish(pubkey: string, snapshot: TorrentSnapshot) {
    if (this.publishTimer) globalThis.clearTimeout(this.publishTimer);
    this.publishTimer = undefined;
    if (this.hydratedForPubkey !== pubkey) return;
    const now = Date.now();
    const items = Object.values(snapshot)
      .filter(item => item.availableUntil === undefined || now <= item.availableUntil)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 100);
    if (items.length === 0) return;
    this.publishTimer = globalThis.setTimeout(() => {
      this.publishTimer = undefined;
      if (this.hydratedForPubkey !== pubkey) return;
      this.listService.publish(items).catch(() => null);
      this.publishPublic?.(items).catch(() => null);
    }, 3_000);
  }

  reset() {
    this.hydratedForPubkey = undefined;
    this.hydrateRequestId += 1;
    if (this.publishTimer) globalThis.clearTimeout(this.publishTimer);
    this.publishTimer = undefined;
  }
}
