interface MemoryCacheOptions<T> {
  maxEntries?: number;
  ttlMs?: number;
  onEvict?: (value: T) => void;
}

interface MemoryCacheEntry<T> {
  value: T;
  expiresAt: number;
  accessAt: number;
}

export class MemoryCache<T> {
  private entries = new Map<string, MemoryCacheEntry<T>>();
  private maxEntries: number;
  private ttlMs: number;
  private onEvict?: (value: T) => void;

  constructor(options: MemoryCacheOptions<T> = {}) {
    this.maxEntries = options.maxEntries ?? 200;
    this.ttlMs = options.ttlMs ?? 15 * 60 * 1000;
    this.onEvict = options.onEvict;
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    const now = Date.now();
    if (entry.expiresAt <= now) {
      this.evictKey(key, entry);
      return undefined;
    }
    entry.accessAt = now;
    return entry.value;
  }

  set(key: string, value: T): void {
    const now = Date.now();
    const existing = this.entries.get(key);
    if (existing) {
      this.evictKey(key, existing);
    }
    this.entries.set(key, {
      value,
      expiresAt: now + this.ttlMs,
      accessAt: now
    });
    this.evictIfNeeded();
  }

  delete(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.evictKey(key, entry);
  }

  purgeExpired(): void {
    const now = Date.now();
    this.entries.forEach((entry, key) => {
      if (entry.expiresAt <= now) {
        this.evictKey(key, entry);
      }
    });
  }

  size(): number {
    return this.entries.size;
  }

  private evictKey(key: string, entry: MemoryCacheEntry<T>) {
    this.entries.delete(key);
    this.onEvict?.(entry.value);
  }

  private evictIfNeeded() {
    if (this.entries.size <= this.maxEntries) return;
    const entries = Array.from(this.entries.entries())
      .sort((a, b) => a[1].accessAt - b[1].accessAt);
    const toRemove = entries.length - this.maxEntries;
    for (let i = 0; i < toRemove; i += 1) {
      const [key, entry] = entries[i] ?? [];
      if (!key || !entry) continue;
      this.evictKey(key, entry);
    }
  }
}
