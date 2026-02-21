import { LRUCache } from 'lru-cache';

interface MemoryCacheOptions<T extends {}> {
  maxEntries?: number;
  ttlMs?: number;
  onEvict?: (value: T) => void;
}

export class MemoryCache<T extends {}> {
  private entries: LRUCache<string, T>;
  private onEvict?: (value: T) => void;

  constructor(options: MemoryCacheOptions<T> = {}) {
    this.onEvict = options.onEvict;
    this.entries = new LRUCache<string, T>({
      max: options.maxEntries ?? 200,
      ttl: options.ttlMs ?? 15 * 60 * 1000,
      updateAgeOnGet: true,
      dispose: (value) => {
        this.onEvict?.(value);
      }
    });
  }

  get(key: string): T | undefined {
    return this.entries.get(key);
  }

  set(key: string, value: T): void {
    this.entries.set(key, value);
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  purgeExpired(): void {
    this.entries.purgeStale();
  }

  size(): number {
    return this.entries.size;
  }
}
