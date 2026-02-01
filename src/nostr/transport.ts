import type { TransportStoreApi } from './contracts';
import type { TransportStatus } from './transportTypes';

type TransportListener = (snapshot: Record<string, TransportStatus>) => void;
type TransportKeyListener = () => void;
const EMPTY_STATUS: TransportStatus = Object.freeze({});

export class TransportStore implements TransportStoreApi {
  private map = new Map<string, TransportStatus>();
  private listeners = new Set<TransportListener>();
  private keyListeners = new Map<string, Set<TransportKeyListener>>();

  get(id: string): TransportStatus {
    return this.map.get(id) ?? EMPTY_STATUS;
  }

  mark(id: string, patch: TransportStatus) {
    const current = this.get(id);
    const next: TransportStatus = { ...current, ...patch };
    if (shallowEqual(current, next)) return;
    this.map.set(id, next);
    this.emit(id);
  }

  subscribe(listener: TransportListener) {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  snapshot(): Record<string, TransportStatus> {
    const snapshot: Record<string, TransportStatus> = {};
    this.map.forEach((value, key) => {
      snapshot[key] = value;
    });
    return snapshot;
  }

  subscribeKey(id: string, listener: TransportKeyListener) {
    const bucket = this.keyListeners.get(id) ?? new Set<TransportKeyListener>();
    bucket.add(listener);
    this.keyListeners.set(id, bucket);
    return () => {
      const existing = this.keyListeners.get(id);
      if (!existing) return;
      existing.delete(listener);
      if (existing.size === 0) this.keyListeners.delete(id);
    };
  }

  private emit(id?: string) {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
    if (!id) return;
    this.keyListeners.get(id)?.forEach((listener) => listener());
  }
}

function shallowEqual(a: TransportStatus, b: TransportStatus) {
  return a.relay === b.relay
    && a.p2p === b.p2p
    && a.http === b.http
    && a.verified === b.verified;
}
