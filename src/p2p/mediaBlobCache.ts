import { CacheStore } from '../storage/cache';
import type { MediaAssistResult } from './types';

interface MediaBlobEntry {
  blob: Blob;
  source: MediaAssistResult['source'];
}

interface MediaBlobCacheOptions {
  maxEntries?: number;
  maxBytes?: number;
  ttlMs?: number;
}

export class MediaBlobCache {
  private store: CacheStore<MediaBlobEntry>;
  private maxBytes: number;

  constructor(options: MediaBlobCacheOptions = {}) {
    this.store = new CacheStore<MediaBlobEntry>({
      maxEntries: options.maxEntries ?? 80,
      evictionPolicy: 'lru',
      persistAccessMs: 30_000
    });
    this.maxBytes = options.maxBytes ?? 25 * 1024 * 1024;
    this.ttlMs = options.ttlMs ?? 12 * 60 * 60 * 1000;
  }

  private ttlMs: number;

  async get(key: string): Promise<MediaAssistResult | undefined> {
    const entry = await this.store.get(key);
    if (!entry) return undefined;
    const url = URL.createObjectURL(entry.blob);
    return { url, source: entry.source };
  }

  async set(key: string, blob: Blob, source: MediaAssistResult['source']) {
    if (blob.size > this.maxBytes) return;
    await this.store.set(key, { blob, source }, this.ttlMs);
  }
}
