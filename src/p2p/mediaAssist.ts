import type { AssistSource } from './types';
import { WebTorrentAssist } from './webtorrent';
import type { TorrentRegistry } from './registry';
import type { WebTorrentHub } from './webtorrentHub';
import type { P2PSettings } from '../storage/types';
import type { MediaAssistApi } from '../nostr/contracts';

export interface MediaAssistResult {
  url: string;
  source: 'p2p' | 'http';
}

export class MediaAssist implements MediaAssistApi {
  private p2p: WebTorrentAssist;
  private cache = new Map<string, Promise<MediaAssistResult>>();

  constructor(private settings: P2PSettings, registry?: TorrentRegistry, hub?: WebTorrentHub) {
    this.p2p = new WebTorrentAssist(settings, registry, hub);
  }

  updateSettings(settings: P2PSettings) {
    this.settings = settings;
    this.p2p.updateSettings(settings);
  }

  async load(source: AssistSource, allowP2P: boolean, timeoutMs: number): Promise<MediaAssistResult> {
    const key = cacheKey(source);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const task = this.fetch(source, allowP2P, timeoutMs).catch((err) => {
      this.cache.delete(key);
      throw err;
    });
    this.cache.set(key, task);
    return task;
  }

  ensureWebSeed(source: AssistSource, allowP2P: boolean) {
    this.p2p.ensureWebSeed(source, allowP2P);
  }

  private async fetch(source: AssistSource, allowP2P: boolean, timeoutMs: number): Promise<MediaAssistResult> {
    const isP2POnly = source.url.startsWith('p2p://');
    const canAssist = this.settings.enabled && allowP2P && (isP2POnly || this.settings.preferMedia);
    if (isP2POnly && !this.settings.enabled) {
      throw new Error('P2P assist disabled');
    }
    if (!canAssist && !source.sha256 && !isP2POnly) {
      this.p2p.ensureWebSeed(source, allowP2P);
      return { url: source.url, source: 'http' };
    }
    const result = await this.p2p.fetchWithAssist(source, timeoutMs, canAssist);
    if (result.source === 'http') {
      this.p2p.ensureWebSeed(source, allowP2P);
    }
    const blob = new Blob([result.data]);
    const url = URL.createObjectURL(blob);
    return { url, source: result.source };
  }
}

function cacheKey(source: AssistSource) {
  return `${source.url}|${source.magnet ?? ''}|${source.sha256 ?? ''}`;
}
