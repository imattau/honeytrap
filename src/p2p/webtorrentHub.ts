import WebTorrent from 'webtorrent/dist/webtorrent.min.js';
import type { Torrent } from 'webtorrent';
import type { P2PSettings } from '../storage/types';

export class WebTorrentHub {
  private client?: WebTorrent;
  private settings: P2PSettings;
  private trackerKey: string;

  constructor(settings: P2PSettings) {
    this.settings = settings;
    this.trackerKey = serializeTrackers(settings.trackers);
    if (settings.enabled) {
      this.client = this.createClient(settings);
    }
  }

  updateSettings(settings: P2PSettings) {
    this.settings = settings;
    const nextTrackerKey = serializeTrackers(settings.trackers);
    if (!settings.enabled) {
      this.client?.destroy();
      this.client = undefined;
      this.trackerKey = nextTrackerKey;
      return;
    }
    if (!this.client) {
      this.client = this.createClient(settings);
      this.trackerKey = nextTrackerKey;
      return;
    }
    if (nextTrackerKey !== this.trackerKey) {
      this.client = this.createClient(settings, this.client);
      this.trackerKey = nextTrackerKey;
    }
  }

  getClient(): WebTorrent | undefined {
    return this.client;
  }

  seed(file: File, onSeed: (torrent: Torrent) => void): Torrent {
    if (!this.client) throw new Error('WebTorrent disabled');
    return this.client.seed(file, onSeed);
  }

  add(magnet: string, onAdd: (torrent: Torrent) => void, opts?: Record<string, unknown>): Torrent {
    if (!this.client) throw new Error('WebTorrent disabled');
    return this.client.add(magnet, opts ?? {}, onAdd);
  }

  ensure(magnet: string, onAdd: (torrent: Torrent) => void, opts?: Record<string, unknown>): Torrent {
    if (!this.client) throw new Error('WebTorrent disabled');
    const existing = this.client.get(magnet);
    if (existing) {
      onAdd(existing);
      return existing;
    }
    return this.client.add(magnet, opts ?? {}, onAdd);
  }

  private createClient(settings: P2PSettings, existing?: WebTorrent) {
    existing?.destroy();
    return new WebTorrent({
      tracker: {
        announce: settings.trackers
      }
    });
  }
}

function serializeTrackers(trackers: string[]) {
  return trackers.map((item) => item.trim()).filter(Boolean).sort().join('|');
}
