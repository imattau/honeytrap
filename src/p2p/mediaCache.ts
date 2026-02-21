import { LRUCache } from 'lru-cache';
import type { MediaAssistResult } from './types';

interface MediaCacheOptions {
  maxEntries?: number;
  ttlMs?: number;
}

export class MediaCache {
  private cache: LRUCache<string, MediaAssistResult>;

  constructor(options: MediaCacheOptions = {}) {
    this.cache = new LRUCache<string, MediaAssistResult>({
      max: options.maxEntries ?? 160,
      ttl: options.ttlMs ?? 20 * 60 * 1000,
      // Keep hot media object URLs alive while they're actively requested.
      updateAgeOnGet: true,
      dispose: (value) => {
        if (value.url.startsWith('blob:')) {
          URL.revokeObjectURL(value.url);
        }
      }
    });
  }

  get(key: string): MediaAssistResult | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: MediaAssistResult) {
    this.cache.set(key, value);
  }

  purgeExpired() {
    this.cache.purgeStale();
  }

  size() {
    return this.cache.size;
  }
}
