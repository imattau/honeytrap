import WebTorrent from 'webtorrent/dist/webtorrent.min.js';
import type { Torrent } from 'webtorrent';
import { verifySha256 } from './verify';
import type { AssistResult, AssistSource } from './types';

export interface TorrentSettings {
  enabled: boolean;
  maxConcurrent: number;
  maxFileSizeMb: number;
  seedWhileOpen: boolean;
  trackers: string[];
}

export class WebTorrentAssist {
  private client?: WebTorrent;
  private active = 0;

  constructor(private settings: TorrentSettings) {
    if (settings.enabled) {
      this.client = new WebTorrent({
        tracker: {
          announce: settings.trackers
        }
      });
    }
  }

  updateSettings(settings: TorrentSettings) {
    this.settings = settings;
    if (!settings.enabled) {
      this.client?.destroy();
      this.client = undefined;
      return;
    }
    if (!this.client) {
      this.client = new WebTorrent({
        tracker: { announce: settings.trackers }
      });
    }
  }

  async fetchWithAssist(source: AssistSource, timeoutMs: number, allowP2P: boolean): Promise<AssistResult> {
    if (allowP2P && source.magnet && this.client && this.active < this.settings.maxConcurrent) {
      try {
        const result = await this.fetchViaTorrent(source.magnet, timeoutMs, source.sha256);
        if (result) return { source: 'p2p', data: result };
      } catch {
        // fall back to HTTP
      }
    }
    if (!source.url) throw new Error('No HTTP fallback available');
    const response = await fetch(source.url);
    const data = await response.arrayBuffer();
    const verified = await verifySha256(data, source.sha256);
    if (!verified) throw new Error('HTTP sha256 mismatch');
    return { source: 'http', data };
  }

  private async fetchViaTorrent(magnet: string, timeoutMs: number, sha256?: string): Promise<ArrayBuffer | undefined> {
    if (!this.client) return undefined;
    this.active += 1;
    try {
      const torrent = await this.addTorrent(magnet, timeoutMs);
      if (!torrent) return undefined;
      const file = torrent.files[0];
      if (!file) return undefined;
      if (file.length / 1024 / 1024 > this.settings.maxFileSizeMb) return undefined;
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        file.getBuffer((err: Error | null, data?: Uint8Array) => {
          if (err || !data) return reject(err ?? new Error('No data'));
          resolve(data.slice().buffer);
        });
      });
      const verified = await verifySha256(buffer, sha256);
      if (!verified) return undefined;
      if (!this.settings.seedWhileOpen) {
        torrent.destroy();
      }
      return buffer;
    } finally {
      this.active = Math.max(0, this.active - 1);
    }
  }

  private addTorrent(magnet: string, timeoutMs: number): Promise<Torrent | undefined> {
    if (!this.client) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve(undefined);
      }, timeoutMs);

      this.client!.add(magnet, (torrent: Torrent) => {
        const onReady = () => {
          clearTimeout(timer);
          resolve(torrent);
        };
        if (torrent.ready) onReady();
        else torrent.once('ready', onReady);
      });
    });
  }
}
