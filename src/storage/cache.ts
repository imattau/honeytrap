import { LRUCache } from 'lru-cache';
import type { CachedCacheEntry } from './types';
import { deleteCacheEntry, loadCacheEntry, purgeExpiredCacheEntries, saveCacheEntry } from './db';

interface CacheStoreOptions {
  maxEntries?: number;
  evictionPolicy?: 'fifo' | 'lru';
  persistAccessMs?: number | null;
}

export class CacheStore<T> {
  private memory: LRUCache<string, CachedCacheEntry>;
  private maxEntries: number;
  private evictionPolicy: 'fifo' | 'lru';
  private persistAccessMs: number | null;
  private dirtyKeys = new Set<string>();
  private flushTimer?: ReturnType<typeof setTimeout>;
  private pendingEvictions = new Set<string>();
  private trackEvictions = false;

  constructor(options: CacheStoreOptions = {}) {
    this.maxEntries = options.maxEntries ?? 500;
    this.evictionPolicy = options.evictionPolicy ?? 'fifo';
    this.persistAccessMs = options.persistAccessMs ?? null;
    this.memory = new LRUCache<string, CachedCacheEntry>({
      max: this.maxEntries,
      disposeAfter: (_value, key, reason) => {
        if (!this.trackEvictions || reason !== 'evict') return;
        this.pendingEvictions.add(key);
        this.dirtyKeys.delete(key);
      }
    });
  }

  async get(key: string): Promise<T | undefined> {
    const now = Date.now();
    const mem = this.readFromMemory(key);
    if (mem) {
      if (mem.expiresAt > now) {
        mem.accessAt = now;
        this.markAccess(key);
        return mem.value as T;
      }
      this.memory.delete(key);
      this.dirtyKeys.delete(key);
    }
    const stored = await loadCacheEntry(key);
    if (!stored) return undefined;
    if (stored.expiresAt <= now) {
      await deleteCacheEntry(key);
      return undefined;
    }
    stored.accessAt = now;
    this.memory.set(key, stored);
    this.markAccess(key);
    return stored.value as T;
  }

  async set(key: string, value: T, ttlMs: number): Promise<void> {
    const now = Date.now();
    const entry: CachedCacheEntry = {
      key,
      value,
      expiresAt: now + ttlMs,
      storedAt: now,
      accessAt: now
    };
    this.trackEvictions = true;
    try {
      this.memory.set(key, entry);
    } finally {
      this.trackEvictions = false;
    }
    await saveCacheEntry(entry);
    this.markAccess(key);
    await this.flushEvictedEntries();
  }

  async delete(key: string): Promise<void> {
    this.memory.delete(key);
    this.dirtyKeys.delete(key);
    await deleteCacheEntry(key);
  }

  async purgeExpired(): Promise<number> {
    const now = Date.now();
    this.memory.forEach((entry, key) => {
      if (entry.expiresAt <= now) {
        this.memory.delete(key);
        this.dirtyKeys.delete(key);
      }
    });
    return purgeExpiredCacheEntries(now);
  }

  async getAgeMs(key: string): Promise<number | undefined> {
    const now = Date.now();
    const mem = this.readFromMemory(key);
    if (mem) {
      if (mem.expiresAt > now) {
        return Math.max(0, now - mem.storedAt);
      }
      this.memory.delete(key);
      this.dirtyKeys.delete(key);
    }
    const stored = await loadCacheEntry(key);
    if (!stored) return undefined;
    if (stored.expiresAt <= now) {
      await deleteCacheEntry(key);
      return undefined;
    }
    this.memory.set(key, stored);
    return Math.max(0, now - stored.storedAt);
  }

  private markAccess(key: string) {
    if (this.persistAccessMs === null) return;
    this.dirtyKeys.add(key);
    if (this.flushTimer) return;
    this.flushTimer = globalThis.setTimeout(() => {
      this.flushTimer = undefined;
      this.flushAccessUpdates().catch(() => null);
    }, this.persistAccessMs);
  }

  private async flushAccessUpdates() {
    if (this.dirtyKeys.size === 0) return;
    const keys = Array.from(this.dirtyKeys);
    this.dirtyKeys.clear();
    await Promise.all(keys.map((key) => {
      const entry = this.memory.peek(key);
      if (!entry) return Promise.resolve();
      return saveCacheEntry(entry);
    }));
  }

  private async flushEvictedEntries() {
    if (this.pendingEvictions.size === 0) return;
    const keys = Array.from(this.pendingEvictions);
    this.pendingEvictions.clear();
    await Promise.all(keys.map((key) => deleteCacheEntry(key)));
  }

  private readFromMemory(key: string): CachedCacheEntry | undefined {
    if (this.evictionPolicy === 'lru') {
      return this.memory.get(key);
    }
    return this.memory.peek(key);
  }
}
