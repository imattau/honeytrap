import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSettings } from '../../storage/types';
import type { NostrClient } from '../../nostr/client';

export function useRelayState({
  nostr,
  keysNpub,
  settings,
  updateSettings
}: {
  nostr: NostrClient;
  keysNpub?: string;
  settings: AppSettings;
  updateSettings: (next: AppSettings) => void;
}) {
  const [relayList, setRelayList] = useState<string[]>([]);
  const [mediaRelayList, setMediaRelayList] = useState<string[]>([]);
  const [relayStatus, setRelayStatus] = useState<Record<string, boolean>>({});
  const fetchRef = useRef({ relaysAt: 0, mediaRelaysAt: 0 });

  const refreshRelayStatus = useCallback(() => {
    const status = nostr.getRelayStatus();
    const next: Record<string, boolean> = {};
    status.forEach((value, key) => {
      next[key] = value;
    });
    setRelayStatus(next);
  }, [nostr]);

  useEffect(() => {
    if (!keysNpub) return;
    const now = Date.now();
    if (now - fetchRef.current.relaysAt < 30_000) return;
    fetchRef.current.relaysAt = now;
    let active = true;
    nostr.fetchRelayList(keysNpub)
      .then((list) => {
        if (!active) return;
        setRelayList(list);
        if (list.length === 0) return;
        if (sameSet(list, settings.relays)) return;
        updateSettings({ ...settings, relays: list });
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [keysNpub, settings.relays, nostr, updateSettings, settings]);

  useEffect(() => {
    if (!keysNpub) return;
    const now = Date.now();
    if (now - fetchRef.current.mediaRelaysAt < 30_000) return;
    fetchRef.current.mediaRelaysAt = now;
    let active = true;
    nostr.fetchMediaRelayList(keysNpub)
      .then((list) => {
        if (!active) return;
        setMediaRelayList(list);
        if (list.length === 0) return;
        if (sameSet(list, settings.mediaRelays)) return;
        updateSettings({ ...settings, mediaRelays: list });
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [keysNpub, settings.mediaRelays, nostr, updateSettings, settings]);

  return { relayList, mediaRelayList, relayStatus, refreshRelayStatus };
}

function sameSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  for (const item of b) {
    if (!set.has(item)) return false;
  }
  return true;
}
