export type TorrentMode = 'seed' | 'fetch';

export interface TorrentStatus {
  magnet: string;
  mode: TorrentMode;
  name?: string;
  eventId?: string;
  url?: string;
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

export class TorrentRegistry {
  private items = new Map<string, TorrentStatus>();
  private listeners = new Set<TorrentListener>();

  subscribe(listener: TorrentListener) {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  start(input: {
    magnet: string;
    mode: TorrentMode;
    name?: string;
    eventId?: string;
    url?: string;
  }) {
    const now = Date.now();
    const existing = this.items.get(input.magnet);
    const next: TorrentStatus = {
      magnet: input.magnet,
      mode: input.mode,
      name: input.name ?? existing?.name,
      eventId: input.eventId ?? existing?.eventId,
      url: input.url ?? existing?.url,
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

  private emit() {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
