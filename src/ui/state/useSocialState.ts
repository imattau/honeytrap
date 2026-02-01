import { useEffect, useRef, useState } from 'react';
import type { AppSettings } from '../../storage/types';
import type { NostrClient } from '../../nostr/client';

export function useSocialState({
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
  const [followers, setFollowers] = useState<string[]>([]);
  const fetchRef = useRef({ followersAt: 0, followingAt: 0 });

  useEffect(() => {
    if (!keysNpub) {
      setFollowers([]);
      return;
    }
    const now = Date.now();
    if (now - fetchRef.current.followersAt < 30_000) return;
    fetchRef.current.followersAt = now;
    let active = true;
    nostr.fetchFollowers(keysNpub, 400)
      .then((list) => {
        if (!active) return;
        setFollowers(list);
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [keysNpub, settings.relays, nostr]);

  useEffect(() => {
    if (!keysNpub) return;
    const now = Date.now();
    if (now - fetchRef.current.followingAt < 30_000) return;
    fetchRef.current.followingAt = now;
    let active = true;
    nostr.fetchFollowing(keysNpub)
      .then((list) => {
        if (!active) return;
        if (list.length === 0) return;
        if (sameSet(list, settings.follows)) return;
        updateSettings({ ...settings, follows: list });
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [keysNpub, settings.relays, nostr, settings.follows, updateSettings, settings]);

  return { followers };
}

function sameSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  for (const item of b) {
    if (!set.has(item)) return false;
  }
  return true;
}
