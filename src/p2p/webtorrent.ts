import type { Torrent } from 'webtorrent';
import { verifySha256 } from './verify';
import { fetchWithTimeout, isAbortError } from './fetchTimeout';
import type { AssistResult, AssistSource } from './types';
import type { TorrentRegistry } from './registry';
import type { WebTorrentHub } from './webtorrentHub';

export interface TorrentSettings {
  enabled: boolean;
  maxConcurrent: number;
  maxFileSizeMb: number;
  seedWhileOpen: boolean;
  trackers: string[];
}

export class WebTorrentAssist {
  private hub?: WebTorrentHub;
  private active = 0;
  private tracked = new WeakSet<Torrent>();

  constructor(private settings: TorrentSettings, private registry?: TorrentRegistry, hub?: WebTorrentHub) {
    this.hub = hub;
  }

  updateSettings(settings: TorrentSettings) {
    this.settings = settings;
    // hub owns client lifecycle
  }

  async fetchWithAssist(source: AssistSource, timeoutMs: number, allowP2P: boolean): Promise<AssistResult> {
    const isHttp = source.url.startsWith('http://') || source.url.startsWith('https://');
    if (allowP2P && source.magnet && this.hub?.getClient() && this.active < this.settings.maxConcurrent) {
      try {
        const result = await this.fetchViaTorrent(source, timeoutMs);
        if (result) return { source: 'p2p', data: result };
      } catch {
        // fall back to HTTP
      }
    }
    if (!isHttp) throw new Error('No HTTP fallback available');
    let response: Response;
    try {
      response = await fetchWithTimeout(source.url, timeoutMs);
    } catch (error) {
      if (isAbortError(error)) {
        throw new Error('HTTP assist timed out');
      }
      throw error;
    }
    if (!response.ok) {
      throw new Error(`HTTP assist failed with status ${response.status}`);
    }
    const data = await response.arrayBuffer();
    const verified = await verifySha256(data, source.sha256);
    if (!verified) throw new Error('HTTP sha256 mismatch');
    return { source: 'http', data };
  }

  ensureWebSeed(source: AssistSource, allowP2P: boolean) {
    if (!allowP2P || !this.settings.enabled) return;
    if (!source.magnet || source.type !== 'media') return;
    if (!source.url.startsWith('http')) return;
    if (!this.hub?.getClient()) return;
    const magnet = source.magnet;
    const urlList = [source.url];
    this.registry?.start({
      magnet,
      mode: 'fetch',
      name: undefined,
      eventId: source.eventId,
      authorPubkey: source.authorPubkey,
      url: source.url,
      availableUntil: source.availableUntil
    });
    this.hub.ensure(magnet, (torrent: Torrent) => {
      this.registry?.update(magnet, { name: torrent.name });
      this.trackTorrent(magnet, torrent);
    }, { urlList });
  }

  private async fetchViaTorrent(source: AssistSource, timeoutMs: number): Promise<ArrayBuffer | undefined> {
    if (!this.hub?.getClient()) return undefined;
    this.active += 1;
    try {
      const fetched = await this.addTorrent(source.magnet!, timeoutMs, source);
      if (!fetched) return undefined;
      const { torrent } = fetched;
      let success = false;
      try {
        const file = torrent.files[0];
        if (!file) return undefined;
        if (file.length / 1024 / 1024 > this.settings.maxFileSizeMb) return undefined;
        const buffer = await file.arrayBuffer();
        const verified = await verifySha256(buffer, source.sha256);
        if (!verified) return undefined;
        success = true;
        if (!this.settings.seedWhileOpen) {
          torrent.destroy();
        }
        return buffer;
      } finally {
        if (!success) {
          torrent.destroy();
        }
      }
    } finally {
      this.active = Math.max(0, this.active - 1);
    }
  }

  private addTorrent(magnet: string, timeoutMs: number, source: AssistSource): Promise<{ torrent: Torrent } | undefined> {
    if (!this.hub?.getClient()) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      let timedOut = false;
      let settled = false;
      let trackedTorrent: Torrent | undefined;
      const settle = (value: { torrent: Torrent } | undefined) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const timer = globalThis.setTimeout(() => {
        timedOut = true;
        trackedTorrent?.destroy();
        this.registry?.finish(magnet);
        settle(undefined);
      }, timeoutMs);

      const urlList = source.type === 'media' && source.url.startsWith('http')
        ? [source.url]
        : undefined;
      this.hub!.ensure(magnet, (torrent: Torrent) => {
        trackedTorrent = torrent;
        if (timedOut) {
          torrent.destroy();
          return;
        }
        this.registry?.start({
          magnet,
          mode: 'fetch',
          name: torrent.name,
          eventId: source.eventId,
          authorPubkey: source.authorPubkey,
          url: source.url,
          availableUntil: source.availableUntil
        });
        this.trackTorrent(magnet, torrent);
        const onReady = () => {
          if (timedOut) {
            torrent.destroy();
            return;
          }
          globalThis.clearTimeout(timer);
          settle({ torrent });
        };
        if (torrent.ready) onReady();
        else torrent.once('ready', onReady);
      }, urlList ? { urlList } : undefined);
    });
  }

  private trackTorrent(magnet: string, torrent: Torrent) {
    if (this.tracked.has(torrent)) return;
    this.tracked.add(torrent);
    const update = () => {
      this.registry?.update(magnet, {
        peers: torrent.numPeers,
        progress: torrent.progress,
        downloaded: torrent.downloaded,
        uploaded: torrent.uploaded
      });
    };
    update();
    torrent.on('download', update);
    torrent.on('upload', update);
    torrent.on('wire', update);
    torrent.on('noPeers', update);
    torrent.on('done', update);
    torrent.on('error', () => this.registry?.finish(magnet));
    torrent.on('close', () => this.registry?.finish(magnet));
  }
}
