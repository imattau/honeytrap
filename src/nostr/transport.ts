import type { TransportStoreApi } from './contracts';
import type { TransportStatus } from './transportTypes';

type TransportListener = (snapshot: Record<string, TransportStatus>) => void;

export class TransportStore implements TransportStoreApi {
  private map = new Map<string, TransportStatus>();
  private listeners = new Set<TransportListener>();

  get(id: string): TransportStatus {
    return this.map.get(id) ?? {};
  }

  mark(id: string, patch: TransportStatus) {
    const current = this.get(id);
    const next: TransportStatus = { ...current, ...patch };
    if (shallowEqual(current, next)) return;
    this.map.set(id, next);
    this.emit();
  }

  subscribe(listener: TransportListener) {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): Record<string, TransportStatus> {
    const snapshot: Record<string, TransportStatus> = {};
    this.map.forEach((value, key) => {
      snapshot[key] = value;
    });
    return snapshot;
  }

  private emit() {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

function shallowEqual(a: TransportStatus, b: TransportStatus) {
  return a.relay === b.relay
    && a.p2p === b.p2p
    && a.http === b.http
    && a.verified === b.verified;
}
