import { useEffect, useMemo, useState } from 'react';
import { TransportStore } from '../../nostr/transport';
import type { TransportStatus } from '../../nostr/transportTypes';

export function useTransportState() {
  const transportStore = useMemo(() => new TransportStore(), []);
  const [transport, setTransport] = useState<Record<string, TransportStatus>>({});

  useEffect(() => {
    const unsubscribe = transportStore.subscribe(setTransport);
    return () => unsubscribe();
  }, [transportStore]);

  return { transportStore, transport };
}
