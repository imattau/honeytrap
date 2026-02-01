import WebTorrent from 'webtorrent/dist/webtorrent.min.js';
import type { Torrent } from 'webtorrent';
import type { NostrEvent } from '../nostr/types';
import { canonicaliseEvent } from './canonical';
import { sha256Hex } from './verify';
import type { P2PSettings } from '../storage/types';
import type { TorrentRegistry } from './registry';

export interface MagnetResult {
  magnet?: string;
  sha256?: string;
}

export class MagnetBuilder {
  private client?: WebTorrent;

  constructor(private settings: P2PSettings, private registry?: TorrentRegistry) {
    if (settings.enabled) {
      this.client = new WebTorrent({
        tracker: { announce: settings.trackers }
      });
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
      this.client = new WebTorrent({
        tracker: { announce: settings.trackers }
      });
    }
  }

  async buildEventPackage(event: NostrEvent): Promise<MagnetResult> {
    if (!this.client || !this.settings.enabled) return {};
    const canonical = canonicaliseEvent(event);
    const sha256 = await sha256Hex(canonical);
    const magnet = await this.seedBytes('event.json', canonical);
    return { magnet, sha256 };
  }

  async buildMediaPackage(url: string): Promise<MagnetResult> {
    if (!this.client || !this.settings.enabled) return {};
    const response = await fetch(url);
    const data = await response.arrayBuffer();
    const sizeMb = data.byteLength / 1024 / 1024;
    if (sizeMb > this.settings.maxFileSizeMb) return {};
    const sha256 = await sha256Hex(data);
    const name = fileNameFromUrl(url);
    const magnet = await this.seedBytes(name, data);
    return { magnet, sha256 };
  }

  async buildMediaPackageFromBytes(name: string, data: ArrayBuffer): Promise<MagnetResult> {
    if (!this.client || !this.settings.enabled) return {};
    const sizeMb = data.byteLength / 1024 / 1024;
    if (sizeMb > this.settings.maxFileSizeMb) return {};
    const sha256 = await sha256Hex(data);
    const magnet = await this.seedBytes(name, data);
    return { magnet, sha256 };
  }

  private async seedBytes(name: string, data: ArrayBuffer | Uint8Array): Promise<string | undefined> {
    if (!this.client) return undefined;
    try {
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      const file = new File([bytes as BlobPart], name, { type: 'application/octet-stream' });
      const torrent = await new Promise<Torrent>((resolve, reject) => {
        this.client!.seed(file, (seeded) => resolve(seeded)).on('error', reject);
      });
      const magnet = torrent.magnetURI;
      if (magnet) {
        this.registry?.start({
          magnet,
          mode: 'seed',
          name: torrent.name
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
      }
      if (!this.settings.seedWhileOpen) torrent.destroy();
      return magnet;
    } catch {
      return undefined;
    }
  }
}

function fileNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const name = parsed.pathname.split('/').filter(Boolean).pop();
    return name && name.length > 0 ? name : 'media.bin';
  } catch {
    return 'media.bin';
  }
}
