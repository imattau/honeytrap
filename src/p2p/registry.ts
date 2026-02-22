export type TorrentMode = 'seed' | 'fetch';

export interface TorrentStatus {
  magnet: string;
  mode: TorrentMode;
  name?: string;
  eventId?: string;
  authorPubkey?: string;
  url?: string;
  availableUntil?: number;
  addedAt: number;
  updatedAt: number;
  peers: number;
  progress: number;
  downloaded: number;
  uploaded: number;
  active: boolean;
}

export type TorrentSnapshot = Record<string, TorrentStatus>;

export type TorrentListener = (snapshot: TorrentSnapshot) => void;
const TORRENT_REGISTRY_CHANGE_EVENT = 'torrent:change';

export class TorrentRegistry {
  private items = new Map<string, TorrentStatus>();
  private target = new EventTarget();

  constructor(private maxAgeMs = 6 * 60 * 60 * 1000) {}

  subscribe(listener: TorrentListener) {
    const handler = () => listener(this.snapshot());
    this.target.addEventListener(TORRENT_REGISTRY_CHANGE_EVENT, handler);
    listener(this.snapshot());
    return () => {
      this.target.removeEventListener(TORRENT_REGISTRY_CHANGE_EVENT, handler);
    };
  }

  start(input: {
    magnet: string;
    mode: TorrentMode;
    name?: string;
    eventId?: string;
    authorPubkey?: string;
    url?: string;
    availableUntil?: number;
  }) {
    const now = Date.now();
    const existing = this.items.get(input.magnet);
    const next: TorrentStatus = {
      magnet: input.magnet,
      mode: input.mode,
      name: input.name ?? existing?.name,
      eventId: input.eventId ?? existing?.eventId,
      authorPubkey: input.authorPubkey ?? existing?.authorPubkey,
      url: input.url ?? existing?.url,
      availableUntil: input.availableUntil ?? existing?.availableUntil,
      addedAt: existing?.addedAt ?? now,
      updatedAt: now,
      peers: existing?.peers ?? 0,
      progress: existing?.progress ?? 0,
      downloaded: existing?.downloaded ?? 0,
      uploaded: existing?.uploaded ?? 0,
      active: true
    };
    this.items.set(input.magnet, next);
    this.emit();
  }

  update(magnet: string, patch: Partial<Omit<TorrentStatus, 'magnet' | 'addedAt'>>) {
    const existing = this.items.get(magnet);
    if (!existing) return;
    const next = {
      ...existing,
      ...patch,
      updatedAt: Date.now()
    };
    this.items.set(magnet, next);
    this.emit();
  }

  finish(magnet: string) {
    const existing = this.items.get(magnet);
    if (!existing) return;
    this.items.set(magnet, { ...existing, active: false, updatedAt: Date.now() });
    this.emit();
  }

  setAll(items: TorrentStatus[]) {
    this.items.clear();
    items.forEach((item) => this.items.set(item.magnet, item));
    this.emit();
  }

  snapshot(): TorrentSnapshot {
    return Object.fromEntries(this.items.entries());
  }

  prune() {
    const now = Date.now();
    let changed = false;
    this.items.forEach((value, key) => {
      const expired = value.availableUntil !== undefined && now > value.availableUntil;
      const inactiveStale = !value.active && now - value.updatedAt > this.maxAgeMs;
      const longLived = !value.active && now - value.addedAt > this.maxAgeMs * 2;
      if (expired || inactiveStale || longLived) {
        this.items.delete(key);
        changed = true;
      }
    });
    if (changed) this.emit();
  }

  private emit() {
    this.target.dispatchEvent(new Event(TORRENT_REGISTRY_CHANGE_EVENT));
  }
}
