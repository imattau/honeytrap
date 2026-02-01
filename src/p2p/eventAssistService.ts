import type { NostrEvent } from '../nostr/types';
import type { P2PSettings } from '../storage/types';
import type { TorrentRegistry } from './registry';
import type { WebTorrentHub } from './webtorrentHub';
import { WebTorrentAssist } from './webtorrent';
import { extractEventAssist, fetchEventPackage } from './eventAssist';

export class EventAssistService {
  private p2p: WebTorrentAssist;
  private inflight = new Set<string>();

  constructor(private settings: P2PSettings, registry?: TorrentRegistry, hub?: WebTorrentHub) {
    this.p2p = new WebTorrentAssist(settings, registry, hub);
  }

  updateSettings(settings: P2PSettings) {
    this.settings = settings;
    this.p2p.updateSettings(settings);
  }

  async maybeAssist(event: NostrEvent, allowP2P: boolean): Promise<boolean> {
    if (!this.settings.enabled || !this.settings.preferEvents || !allowP2P) return false;
    const assist = extractEventAssist(event);
    if (!assist.magnet) return false;
    if (this.inflight.has(assist.magnet)) return false;
    this.inflight.add(assist.magnet);
    try {
      const fetched = await fetchEventPackage({ event, p2p: this.p2p, allowP2P });
      return Boolean(fetched);
    } catch {
      return false;
    } finally {
      this.inflight.delete(assist.magnet);
    }
  }
}
