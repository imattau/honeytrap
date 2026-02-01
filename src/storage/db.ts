import { openDB, DBSchema } from 'idb';
import type { AppSettings, CachedEvent, CachedCacheEntry, KeyRecord } from './types';

interface HoneytrapDB extends DBSchema {
  settings: {
    key: string;
    value: AppSettings;
  };
  keys: {
    key: string;
    value: KeyRecord;
  };
  events: {
    key: string;
    value: CachedEvent;
    indexes: { 'by-received': number };
  };
  cache: {
    key: string;
    value: CachedCacheEntry;
    indexes: { 'by-expires': number };
  };
}

const DB_NAME = 'honeytrap';
const DB_VERSION = 2;

export const dbPromise = openDB<HoneytrapDB>(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('settings')) {
      db.createObjectStore('settings');
    }
    if (!db.objectStoreNames.contains('keys')) {
      db.createObjectStore('keys');
    }
    if (!db.objectStoreNames.contains('events')) {
      const store = db.createObjectStore('events');
      store.createIndex('by-received', 'receivedAt');
    }
    if (!db.objectStoreNames.contains('cache')) {
      const store = db.createObjectStore('cache');
      store.createIndex('by-expires', 'expiresAt');
    }
  }
});

export async function loadSettings(defaults: AppSettings): Promise<AppSettings> {
  const db = await dbPromise;
  const stored = await db.get('settings', 'app');
  return stored ?? defaults;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await dbPromise;
  await db.put('settings', settings, 'app');
}

export async function loadKeys(): Promise<KeyRecord | undefined> {
  const db = await dbPromise;
  return db.get('keys', 'default');
}

export async function saveKeys(keys: KeyRecord): Promise<void> {
  const db = await dbPromise;
  await db.put('keys', keys, 'default');
}

export async function cacheEvent(event: CachedEvent): Promise<void> {
  const db = await dbPromise;
  await db.put('events', event, event.id);
}

export async function loadCachedEvents(limit = 150): Promise<CachedEvent[]> {
  const db = await dbPromise;
  const index = db.transaction('events').store.index('by-received');
  const results = await index.getAll(undefined, limit);
  return results.sort((a, b) => b.receivedAt - a.receivedAt);
}

export async function loadCacheEntry(key: string): Promise<CachedCacheEntry | undefined> {
  const db = await dbPromise;
  return db.get('cache', key);
}

export async function saveCacheEntry(entry: CachedCacheEntry): Promise<void> {
  const db = await dbPromise;
  await db.put('cache', entry, entry.key);
}

export async function deleteCacheEntry(key: string): Promise<void> {
  const db = await dbPromise;
  await db.delete('cache', key);
}

export async function purgeExpiredCacheEntries(now = Date.now()): Promise<number> {
  const db = await dbPromise;
  const tx = db.transaction('cache', 'readwrite');
  const index = tx.store.index('by-expires');
  const keys = await index.getAllKeys(IDBKeyRange.upperBound(now));
  await Promise.all(keys.map((key) => tx.store.delete(key)));
  await tx.done;
  return keys.length;
}
