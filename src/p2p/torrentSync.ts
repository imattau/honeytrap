import type { TorrentSnapshot } from './registry';
import type { TorrentListService } from '../nostr/torrentList';

export class TorrentSyncService {
  private hydrateDone = false;
  private publishTimer: number | null = null;

  constructor(private listService: TorrentListService) {}

  async hydrate(pubkey: string, onItems: (snapshot: TorrentSnapshot) => void) {
    if (this.hydrateDone) return;
    const items = await this.listService.load(pubkey);
    if (items.length > 0) {
      const snapshot: TorrentSnapshot = {};
      items.forEach((item) => {
        snapshot[item.magnet] = item;
      });
      onItems(snapshot);
    }
    this.hydrateDone = true;
  }

  schedulePublish(pubkey: string, snapshot: TorrentSnapshot) {
    const items = Object.values(snapshot)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 100);
    if (items.length === 0) return;
    if (this.publishTimer) window.clearTimeout(this.publishTimer);
    this.publishTimer = window.setTimeout(() => {
      this.listService.publish(items).catch(() => null);
    }, 10_000);
  }

  reset() {
    this.hydrateDone = false;
    if (this.publishTimer) window.clearTimeout(this.publishTimer);
    this.publishTimer = null;
  }
}
