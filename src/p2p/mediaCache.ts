import { MemoryCache } from '../storage/memoryCache';
import type { MediaAssistResult } from './types';

interface MediaCacheOptions {
  maxEntries?: number;
  ttlMs?: number;
}

export class MediaCache {
  private cache: MemoryCache<MediaAssistResult>;

  constructor(options: MediaCacheOptions = {}) {
    this.cache = new MemoryCache<MediaAssistResult>({
      maxEntries: options.maxEntries ?? 160,
      ttlMs: options.ttlMs ?? 20 * 60 * 1000,
      onEvict: (value) => {
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
    this.cache.purgeExpired();
  }

  size() {
    return this.cache.size();
  }
}
