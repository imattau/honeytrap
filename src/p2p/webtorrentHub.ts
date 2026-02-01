import WebTorrent from 'webtorrent/dist/webtorrent.min.js';
import type { Torrent } from 'webtorrent';
import type { P2PSettings } from '../storage/types';

export class WebTorrentHub {
  private client?: WebTorrent;
  private settings: P2PSettings;

  constructor(settings: P2PSettings) {
    this.settings = settings;
    if (settings.enabled) {
      this.client = this.createClient(settings);
    }
  }

  updateSettings(settings: P2PSettings) {
    this.settings = settings;
    if (!settings.enabled) {
      this.client?.destroy();
      this.client = undefined;
      return;
    }
    if (!this.client) {
      this.client = this.createClient(settings);
      return;
    }
    this.client = this.createClient(settings, this.client);
  }

  getClient(): WebTorrent | undefined {
    return this.client;
  }

  seed(file: File, onSeed: (torrent: Torrent) => void): Torrent {
    if (!this.client) throw new Error('WebTorrent disabled');
    return this.client.seed(file, onSeed);
  }

  add(magnet: string, onAdd: (torrent: Torrent) => void): Torrent {
    if (!this.client) throw new Error('WebTorrent disabled');
    return this.client.add(magnet, onAdd);
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
