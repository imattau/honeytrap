import React, { createContext, useContext, useMemo } from 'react';
import { useTransportState } from '../useTransportState';
import type { TransportStore } from '../../../nostr/transport';

interface TransportContextValue {
  transportStore: TransportStore;
}

const TransportContext = createContext<TransportContextValue | undefined>(undefined);

export function TransportProvider({ children }: { children: React.ReactNode }) {
  const { transportStore } = useTransportState();

  const value = useMemo(() => ({
    transportStore
  }), [transportStore]);

  return (
    <TransportContext.Provider value={value}>
      {children}
    </TransportContext.Provider>
  );
}

export function useTransport() {
  const context = useContext(TransportContext);
  if (!context) throw new Error('useTransport must be used within a TransportProvider');
  return context;
}
