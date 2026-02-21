import type { TransportStoreApi } from './contracts';
import type { TransportStatus } from './transportTypes';

type TransportListener = (snapshot: Record<string, TransportStatus>) => void;
type TransportKeyListener = () => void;
const EMPTY_STATUS: TransportStatus = Object.freeze({});
const TRANSPORT_CHANGE_EVENT = 'transport:change';
const TRANSPORT_KEY_PREFIX = 'transport:key:';

export class TransportStore implements TransportStoreApi {
  private map = new Map<string, TransportStatus>();
  private target = new EventTarget();

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
    const handler = () => listener(this.snapshot());
    this.target.addEventListener(TRANSPORT_CHANGE_EVENT, handler);
    listener(this.snapshot());
    return () => {
      this.target.removeEventListener(TRANSPORT_CHANGE_EVENT, handler);
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
    const keyEvent = `${TRANSPORT_KEY_PREFIX}${id}`;
    const handler = () => listener();
    this.target.addEventListener(keyEvent, handler);
    return () => {
      this.target.removeEventListener(keyEvent, handler);
    };
  }

  private emit(id?: string) {
    this.target.dispatchEvent(new Event(TRANSPORT_CHANGE_EVENT));
    if (!id) return;
    this.target.dispatchEvent(new Event(`${TRANSPORT_KEY_PREFIX}${id}`));
  }
}

function shallowEqual(a: TransportStatus, b: TransportStatus) {
  return a.relay === b.relay
    && a.p2p === b.p2p
    && a.http === b.http
    && a.verified === b.verified;
}
