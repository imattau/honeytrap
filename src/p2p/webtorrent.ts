import WebTorrent from 'webtorrent/dist/webtorrent.min.js';
import type { Torrent } from 'webtorrent';
import { verifySha256 } from './verify';
import type { AssistResult, AssistSource } from './types';
import type { TorrentRegistry } from './registry';

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

  constructor(private settings: TorrentSettings, private registry?: TorrentRegistry) {
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
        const result = await this.fetchViaTorrent(source, timeoutMs);
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

  private async fetchViaTorrent(source: AssistSource, timeoutMs: number): Promise<ArrayBuffer | undefined> {
    if (!this.client) return undefined;
    this.active += 1;
    try {
      const torrent = await this.addTorrent(source.magnet!, timeoutMs, source);
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
      const verified = await verifySha256(buffer, source.sha256);
      if (!verified) return undefined;
      if (!this.settings.seedWhileOpen) {
        torrent.destroy();
      }
      return buffer;
    } finally {
      this.active = Math.max(0, this.active - 1);
    }
  }

  private addTorrent(magnet: string, timeoutMs: number, source: AssistSource): Promise<Torrent | undefined> {
    if (!this.client) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve(undefined);
      }, timeoutMs);

      this.client!.add(magnet, (torrent: Torrent) => {
        this.registry?.start({
          magnet,
          mode: 'fetch',
          name: torrent.name,
          url: source.url
        });
        const update = () => {
          this.registry?.update(magnet, {
            peers: torrent.numPeers,
            progress: torrent.progress,
            downloaded: torrent.downloaded,
            uploaded: torrent.uploaded
          });
        };
        torrent.on('download', update);
        torrent.on('upload', update);
        torrent.on('wire', update);
        torrent.on('noPeers', update);
        torrent.on('done', update);
        torrent.on('error', () => this.registry?.finish(magnet));
        torrent.on('close', () => this.registry?.finish(magnet));
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
