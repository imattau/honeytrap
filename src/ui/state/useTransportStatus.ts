import { useSyncExternalStore } from 'react';
import type { TransportStatus } from '../../nostr/transportTypes';
import type { TransportStore } from '../../nostr/transport';

export function useTransportStatus(store: TransportStore, id: string): TransportStatus {
  return useSyncExternalStore(
    (onStoreChange) => store.subscribeKey(id, onStoreChange),
    () => store.get(id),
    () => store.get(id)
  );
}
