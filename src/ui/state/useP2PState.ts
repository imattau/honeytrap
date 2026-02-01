import { useEffect, useMemo, useState } from 'react';
import type { AppSettings } from '../../storage/types';
import type { NostrClient } from '../../nostr/client';
import type { EventSigner } from '../../nostr/signer';
import { MediaAssist } from '../../p2p/mediaAssist';
import { MagnetBuilder } from '../../p2p/magnetBuilder';
import { TorrentRegistry, type TorrentSnapshot } from '../../p2p/registry';
import { TorrentSyncService } from '../../p2p/torrentSync';
import { TorrentListService } from '../../nostr/torrentList';
import type { Nip44Cipher } from '../../nostr/nip44';
import type { AssistSource } from '../../p2p/types';
import type { TransportStore } from '../../nostr/transport';

export function useP2PState({
  settings,
  nostr,
  signer,
  nip44Cipher,
  keysNpub,
  transportStore
}: {
  settings: AppSettings;
  nostr: NostrClient;
  signer: EventSigner;
  nip44Cipher: Nip44Cipher;
  keysNpub?: string;
  transportStore: TransportStore;
}) {
  const [torrentSnapshot, setTorrentSnapshot] = useState<TorrentSnapshot>({});
  const [canEncryptNip44, setCanEncryptNip44] = useState(false);

  const torrentRegistry = useMemo(() => new TorrentRegistry(), []);
  const mediaAssist = useMemo(() => new MediaAssist(settings.p2p, torrentRegistry), [settings.p2p, torrentRegistry]);
  const magnetBuilder = useMemo(() => new MagnetBuilder(settings.p2p, torrentRegistry), [settings.p2p, torrentRegistry]);
  const torrentListService = useMemo(
    () => new TorrentListService(nostr, signer, nip44Cipher),
    [nostr, signer, nip44Cipher]
  );
  const torrentSync = useMemo(() => new TorrentSyncService(torrentListService), [torrentListService]);

  useEffect(() => {
    mediaAssist.updateSettings(settings.p2p);
  }, [mediaAssist, settings.p2p]);

  useEffect(() => {
    magnetBuilder.updateSettings(settings.p2p);
  }, [magnetBuilder, settings.p2p]);

  useEffect(() => {
    const unsubscribe = torrentRegistry.subscribe(setTorrentSnapshot);
    return () => unsubscribe();
  }, [torrentRegistry]);

  useEffect(() => {
    if (!keysNpub) {
      torrentSync.reset();
      return;
    }
    let active = true;
    torrentSync.hydrate(keysNpub, (snapshot) => {
      if (!active) return;
      torrentRegistry.setAll(Object.values(snapshot));
    }).catch(() => null);
    return () => {
      active = false;
    };
  }, [keysNpub, torrentSync, torrentRegistry]);

  useEffect(() => {
    if (!keysNpub) return;
    torrentSync.schedulePublish(keysNpub, torrentSnapshot);
  }, [keysNpub, torrentSnapshot, torrentSync]);

  useEffect(() => {
    setCanEncryptNip44(nip44Cipher.canEncrypt());
  }, [nip44Cipher]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      torrentRegistry.prune();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [torrentRegistry]);

  const loadMedia = async ({
    eventId,
    source,
    authorPubkey,
    timeoutMs
  }: {
    eventId: string;
    source: AssistSource;
    authorPubkey: string;
    timeoutMs?: number;
  }) => {
    const allowP2P = settings.p2p.scope === 'everyone' || settings.follows.includes(authorPubkey);
    const result = await mediaAssist.load(source, allowP2P, timeoutMs ?? 2000);
    transportStore.mark(eventId, { [result.source]: true });
    return result;
  };

  return {
    torrentRegistry,
    torrentSnapshot,
    canEncryptNip44,
    mediaAssist,
    magnetBuilder,
    loadMedia
  };
}
