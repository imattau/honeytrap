import React, { createContext, useContext, useMemo, useEffect } from 'react';
import { NostrClient } from '../../../nostr/client';
import { NostrCache } from '../../../nostr/cache';
import { AsyncEventVerifier } from '../../../nostr/eventVerifier';
import { useSettings } from './SettingsContext';

interface NostrContextValue {
  nostr: NostrClient;
  cache: NostrCache;
  verifier: AsyncEventVerifier;
}

const NostrContext = createContext<NostrContextValue | undefined>(undefined);

export function NostrProvider({ children }: { children: React.ReactNode }) {
  const nostr = useMemo(() => new NostrClient(), []);
  const cache = useMemo(() => new NostrCache(), []);
  const verifier = useMemo(() => new AsyncEventVerifier(), []);
  const { settings } = useSettings();

  useEffect(() => {
    nostr.setRelays(settings.relays);
    nostr.setCache(cache);
  }, [nostr, settings.relays, cache]);

  useEffect(() => {
    cache.purgeExpired().catch(() => null);
  }, [cache]);

  const value = useMemo(() => ({
    nostr,
    cache,
    verifier
  }), [nostr, cache, verifier]);

  return (
    <NostrContext.Provider value={value}>
      {children}
    </NostrContext.Provider>
  );
}

export function useNostr() {
  const context = useContext(NostrContext);
  if (!context) throw new Error('useNostr must be used within a NostrProvider');
  return context;
}
