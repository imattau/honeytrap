import type { CachedCacheEntry } from './types';
import { deleteCacheEntry, loadCacheEntry, purgeExpiredCacheEntries, saveCacheEntry } from './db';

interface CacheStoreOptions {
  maxEntries?: number;
  evictionPolicy?: 'fifo' | 'lru';
  persistAccessMs?: number | null;
}

export class CacheStore<T> {
  private memory = new Map<string, CachedCacheEntry>();
  private maxEntries: number;
  private evictionPolicy: 'fifo' | 'lru';
  private persistAccessMs: number | null;
  private dirtyKeys = new Set<string>();
  private flushTimer?: number;

  constructor(options: CacheStoreOptions = {}) {
    this.maxEntries = options.maxEntries ?? 500;
    this.evictionPolicy = options.evictionPolicy ?? 'fifo';
    this.persistAccessMs = options.persistAccessMs ?? null;
  }

  async get(key: string): Promise<T | undefined> {
    const now = Date.now();
    const mem = this.memory.get(key);
    if (mem) {
      if (mem.expiresAt > now) {
        mem.accessAt = now;
        this.memory.set(key, mem);
        this.markAccess(key);
        return mem.value as T;
      }
      this.memory.delete(key);
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
    this.memory.set(key, entry);
    await saveCacheEntry(entry);
    this.markAccess(key);
    await this.evictIfNeeded();
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

  private markAccess(key: string) {
    if (this.persistAccessMs === null) return;
    this.dirtyKeys.add(key);
    if (this.flushTimer) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = undefined;
      this.flushAccessUpdates().catch(() => null);
    }, this.persistAccessMs);
  }

  private async flushAccessUpdates() {
    if (this.dirtyKeys.size === 0) return;
    const keys = Array.from(this.dirtyKeys);
    this.dirtyKeys.clear();
    await Promise.all(keys.map((key) => {
      const entry = this.memory.get(key);
      if (!entry) return Promise.resolve();
      return saveCacheEntry(entry);
    }));
  }

  private async evictIfNeeded() {
    if (this.memory.size <= this.maxEntries) return;
    const entries = Array.from(this.memory.values())
      .sort((a, b) => {
        if (this.evictionPolicy === 'lru') {
          const aTime = a.accessAt ?? a.storedAt;
          const bTime = b.accessAt ?? b.storedAt;
          return aTime - bTime;
        }
        return a.storedAt - b.storedAt;
      });
    const toRemove = entries.length - this.maxEntries;
    for (let i = 0; i < toRemove; i += 1) {
      const entry = entries[i];
      if (!entry) continue;
      this.memory.delete(entry.key);
      await deleteCacheEntry(entry.key);
    }
  }
}
