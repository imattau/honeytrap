import { useMemo } from 'react';
import { TransportStore } from '../../nostr/transport';

export function useTransportState() {
  const transportStore = useMemo(() => new TransportStore(), []);
  return { transportStore };
}
