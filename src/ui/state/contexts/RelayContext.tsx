import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { useRelayState } from '../useRelayState';
import { useSettings } from './SettingsContext';
import { useAuth } from './AuthContext';
import { useNostr } from './NostrContext';
import { MediaRelayListService, RelayListService } from '../../../nostr/lists';

interface RelayContextValue {
  relayList: string[];
  mediaRelayList: string[];
  relayStatus: Record<string, boolean>;
  refreshRelayStatus: () => void;
  publishRelayList: (urls: string[]) => Promise<void>;
  saveMediaRelays: (urls: string[]) => Promise<void>;
}

const RelayContext = createContext<RelayContextValue | undefined>(undefined);

export function RelayProvider({ children }: { children: React.ReactNode }) {
  const { settings, updateSettings } = useSettings();
  const { keys, signer } = useAuth();
  const { nostr } = useNostr();

  const { relayList, mediaRelayList, relayStatus, refreshRelayStatus } = useRelayState({
    nostr,
    keysNpub: keys?.npub,
    settings,
    updateSettings
  });

  const mediaRelayService = useMemo(() => new MediaRelayListService(nostr, signer), [nostr, signer]);
  const relayListService = useMemo(() => new RelayListService(nostr, signer), [nostr, signer]);

  const saveMediaRelays = useCallback(async (urls: string[]) => {
    updateSettings({ ...settings, mediaRelays: urls });
    if (!keys?.npub) return;
    try {
      await mediaRelayService.publish(urls);
    } catch {
      // ignore publish errors; local settings still updated
    }
  }, [mediaRelayService, keys?.npub, settings, updateSettings]);

  const publishRelayList = useCallback(async (urls: string[]) => {
    if (!keys?.npub) return;
    try {
      await relayListService.publish(urls);
    } catch {
      // ignore publish errors; local settings still updated
    }
  }, [keys?.npub, relayListService]);

  const value = useMemo(() => ({
    relayList,
    mediaRelayList,
    relayStatus,
    refreshRelayStatus,
    publishRelayList,
    saveMediaRelays
  }), [relayList, mediaRelayList, relayStatus, refreshRelayStatus, publishRelayList, saveMediaRelays]);

  return (
    <RelayContext.Provider value={value}>
      {children}
    </RelayContext.Provider>
  );
}

export function useRelay() {
  const context = useContext(RelayContext);
  if (!context) throw new Error('useRelay must be used within a RelayProvider');
  return context;
}
