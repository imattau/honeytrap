import type { AssistSource, MediaAssistResult } from './types';
import { WebTorrentAssist } from './webtorrent';
import type { TorrentRegistry } from './registry';
import type { WebTorrentHub } from './webtorrentHub';
import type { P2PSettings } from '../storage/types';
import type { MediaAssistApi } from '../nostr/contracts';
import { MediaCache } from './mediaCache';
import { MediaBlobCache } from './mediaBlobCache';

export class MediaAssist implements MediaAssistApi {
  private p2p: WebTorrentAssist;
  private inflight = new Map<string, Promise<MediaAssistResult>>();
  private cache = new MediaCache();
  private blobCache = new MediaBlobCache();

  constructor(private settings: P2PSettings, registry?: TorrentRegistry, hub?: WebTorrentHub) {
    this.p2p = new WebTorrentAssist(settings, registry, hub);
  }

  updateSettings(settings: P2PSettings) {
    this.settings = settings;
    this.p2p.updateSettings(settings);
  }

  async load(source: AssistSource, allowP2P: boolean, timeoutMs: number): Promise<MediaAssistResult> {
    const key = cacheKey(source);
    this.cache.purgeExpired();
    const cached = this.cache.get(key);
    if (cached) return cached;
    const inflight = this.inflight.get(key);
    if (inflight) return inflight;
    const task = this.loadWithCache(key, source, allowP2P, timeoutMs)
      .catch((err) => {
        this.cache.purgeExpired();
        throw err;
      })
      .finally(() => {
        this.inflight.delete(key);
      });
    this.inflight.set(key, task);
    return task;
  }

  ensureWebSeed(source: AssistSource, allowP2P: boolean) {
    this.p2p.ensureWebSeed(source, allowP2P);
  }

  private async loadWithCache(
    key: string,
    source: AssistSource,
    allowP2P: boolean,
    timeoutMs: number
  ): Promise<MediaAssistResult> {
    const persisted = await this.blobCache.get(key);
    if (persisted) {
      this.cache.set(key, persisted);
      return persisted;
    }
    const fetched = await this.fetch(source, allowP2P, timeoutMs);
    if (fetched.blob) {
      await this.blobCache.set(key, fetched.blob, fetched.result.source);
    }
    this.cache.set(key, fetched.result);
    return fetched.result;
  }

  private async fetch(
    source: AssistSource,
    allowP2P: boolean,
    timeoutMs: number
  ): Promise<{ result: MediaAssistResult; blob?: Blob }> {
    const isP2POnly = source.url.startsWith('p2p://');
    const canAssist = this.settings.enabled && allowP2P && (isP2POnly || this.settings.preferMedia);
    if (isP2POnly && !this.settings.enabled) {
      throw new Error('P2P assist disabled');
    }
    if (!canAssist && !source.sha256 && !isP2POnly) {
      this.p2p.ensureWebSeed(source, allowP2P);
      return { result: { url: source.url, source: 'http' } };
    }
    const result = await this.p2p.fetchWithAssist(source, timeoutMs, canAssist);
    if (result.source === 'http') {
      this.p2p.ensureWebSeed(source, allowP2P);
    }
    const blob = new Blob([result.data]);
    const url = URL.createObjectURL(blob);
    return { result: { url, source: result.source }, blob };
  }
}

function cacheKey(source: AssistSource) {
  return `${source.url}|${source.magnet ?? ''}|${source.sha256 ?? ''}`;
}
