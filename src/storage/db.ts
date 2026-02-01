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
const KEYS_STORAGE_KEY = 'honeytrap:keys';

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
  try {
    const db = await dbPromise;
    const stored = await db.get('keys', 'default');
    if (stored && stored.npub) return stored;
  } catch {
    // fall back to localStorage
  }
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(KEYS_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as KeyRecord;
    if (parsed?.npub) return parsed;
  } catch {
    return undefined;
  }
  return undefined;
}

export async function saveKeys(keys: KeyRecord): Promise<void> {
  try {
    const db = await dbPromise;
    await db.put('keys', keys, 'default');
  } catch {
    // fall back to localStorage
  }
  if (typeof window === 'undefined') return;
  try {
    if (!keys.npub) {
      window.localStorage.removeItem(KEYS_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // ignore
  }
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
