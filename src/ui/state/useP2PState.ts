import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { NostrEvent } from '../../nostr/types';
import type { TransportStore } from '../../nostr/transport';
import { WebTorrentHub } from '../../p2p/webtorrentHub';
import { P2PSettingsListService } from '../../nostr/p2pSettingsList';
import { EventAssistService } from '../../p2p/eventAssistService';

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
  const OWN_AVAILABILITY_MS = 30 * 24 * 60 * 60 * 1000;
  const OTHER_AVAILABILITY_MS = 7 * 24 * 60 * 60 * 1000;
  const RESEED_INTERVAL_MS = 10 * 60 * 1000;

  const [torrentSnapshot, setTorrentSnapshot] = useState<TorrentSnapshot>({});
  const [canEncryptNip44, setCanEncryptNip44] = useState(false);
  const settingsRef = useRef(settings);
  const keysRef = useRef(keysNpub);
  const torrentSnapshotRef = useRef(torrentSnapshot);
  const reseedAtRef = useRef(new Map<string, number>());

  const torrentRegistry = useMemo(() => new TorrentRegistry(), []);
  const webtorrentHub = useMemo(() => new WebTorrentHub(settings.p2p), []);
  const mediaAssist = useMemo(() => new MediaAssist(settings.p2p, torrentRegistry, webtorrentHub), [torrentRegistry, webtorrentHub]);
  const magnetBuilder = useMemo(() => new MagnetBuilder(settings.p2p, torrentRegistry, webtorrentHub), [torrentRegistry, webtorrentHub]);
  const torrentListService = useMemo(
    () => new TorrentListService(nostr, signer, nip44Cipher),
    [nostr, signer, nip44Cipher]
  );
  const eventAssist = useMemo(
    () => new EventAssistService(settings.p2p, torrentRegistry, webtorrentHub),
    [torrentRegistry, webtorrentHub]
  );
  const settingsListService = useMemo(
    () => new P2PSettingsListService(nostr, signer, nip44Cipher),
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
    eventAssist.updateSettings(settings.p2p);
  }, [eventAssist, settings.p2p]);

  useEffect(() => {
    webtorrentHub.updateSettings(settings.p2p);
  }, [webtorrentHub, settings.p2p]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    keysRef.current = keysNpub;
  }, [keysNpub]);

  useEffect(() => {
    const unsubscribe = torrentRegistry.subscribe(setTorrentSnapshot);
    return () => unsubscribe();
  }, [torrentRegistry]);

  useEffect(() => {
    torrentSnapshotRef.current = torrentSnapshot;
  }, [torrentSnapshot]);

  useEffect(() => {
    if (!keysNpub) {
      torrentSync.reset();
      return;
    }
    let active = true;
    torrentSync.hydrate(keysNpub, (snapshot) => {
      if (!active) return;
      torrentRegistry.setAll(Object.values(snapshot));
      if (!settingsRef.current.p2p.enabled) return;
      const now = Date.now();
      Object.values(snapshot).forEach((item) => {
        if (item.availableUntil && now > item.availableUntil) return;
        if (item.mode === 'seed') {
          torrentRegistry.start({ magnet: item.magnet, mode: 'seed', name: item.name, eventId: item.eventId, authorPubkey: item.authorPubkey, availableUntil: item.availableUntil });
          try {
            webtorrentHub.ensure(item.magnet, (torrent) => {
              torrentRegistry.update(item.magnet, { name: torrent.name });
              const update = () => torrentRegistry.update(item.magnet, {
                peers: torrent.numPeers,
                progress: torrent.progress,
                downloaded: torrent.downloaded,
                uploaded: torrent.uploaded
              });
              torrent.on('download', update);
              torrent.on('upload', update);
              torrent.on('wire', update);
              torrent.on('noPeers', update);
              torrent.on('done', update);
              torrent.on('error', () => torrentRegistry.finish(item.magnet));
              torrent.on('close', () => torrentRegistry.finish(item.magnet));
            });
          } catch {
            // WebTorrent client not ready; skip this torrent for now
          }
        } else if (item.url?.startsWith('http')) {
          const source: AssistSource = {
            url: item.url,
            magnet: item.magnet,
            sha256: undefined,
            type: 'media',
            eventId: item.eventId,
            authorPubkey: item.authorPubkey,
            availableUntil: item.availableUntil
          };
          mediaAssist.ensureWebSeed(source, true);
        }
      });
    }).catch(() => null);
    return () => {
      active = false;
    };
  }, [keysNpub, torrentSync, torrentRegistry, webtorrentHub, mediaAssist]);

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

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!settingsRef.current.p2p.enabled) return;
      const now = Date.now();
      const snapshot = torrentSnapshotRef.current;
      Object.values(snapshot).forEach((item) => {
        if (item.mode !== 'fetch') return;
        if (!item.availableUntil || now > item.availableUntil) return;
        if (!item.url || !item.url.startsWith('http')) return;
        if (item.active && item.peers > 0) return;
        const lastReseed = reseedAtRef.current.get(item.magnet) ?? 0;
        if (now - lastReseed < RESEED_INTERVAL_MS) return;
        const currentSettings = settingsRef.current;
        const currentKeys = keysRef.current;
        const isSelf = Boolean(currentKeys && item.authorPubkey === currentKeys);
        const allowP2P = isSelf || currentSettings.p2p.scope === 'everyone'
          || currentSettings.follows.includes(item.authorPubkey ?? '');
        if (!allowP2P) return;
        reseedAtRef.current.set(item.magnet, now);
        const source: AssistSource = {
          url: item.url,
          magnet: item.magnet,
          sha256: undefined,
          type: 'media',
          eventId: item.eventId,
          authorPubkey: item.authorPubkey,
          availableUntil: item.availableUntil
        };
        mediaAssist.ensureWebSeed(source, allowP2P);
      });
    }, RESEED_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [mediaAssist]);

  const loadMedia = useCallback(async ({
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
    const currentSettings = settingsRef.current;
    const currentKeys = keysRef.current;
    const isP2POnly = source.url.startsWith('p2p://');
    const isSelf = Boolean(currentKeys && authorPubkey === currentKeys);
    const allowP2P = isP2POnly || isSelf || currentSettings.p2p.scope === 'everyone' || currentSettings.follows.includes(authorPubkey);
    const availabilityMs = isSelf ? OWN_AVAILABILITY_MS : OTHER_AVAILABILITY_MS;
    const availableUntil = source.magnet && source.url.startsWith('http')
      ? Date.now() + availabilityMs
      : undefined;
    const assistSource: AssistSource = {
      ...source,
      eventId,
      authorPubkey,
      availableUntil
    };
    const shouldReseed = currentSettings.p2p.enabled && allowP2P && Boolean(source.magnet) && source.url.startsWith('http');
    const result = await mediaAssist.load(assistSource, allowP2P, timeoutMs ?? 2000);
    transportStore.mark(eventId, { [result.source]: true });
    if (result.source === 'http' && shouldReseed) {
      transportStore.mark(eventId, { p2p: true });
    }
    return result;
  }, [mediaAssist, transportStore, OWN_AVAILABILITY_MS, OTHER_AVAILABILITY_MS]);

  const seedMediaFile = useCallback(async (file: File) => {
    const buffer = await file.arrayBuffer();
    const assist = await magnetBuilder.buildMediaPackageFromBytes(file.name || 'media.bin', buffer);
    if (!assist.magnet || !assist.sha256) {
      throw new Error('Unable to seed media');
    }
    return {
      url: `p2p://sha256:${assist.sha256}`,
      magnet: assist.magnet,
      sha256: assist.sha256
    };
  }, [magnetBuilder]);

  const reseedTorrent = useCallback((magnet: string) => {
    const client = webtorrentHub.getClient();
    torrentRegistry.start({ magnet, mode: 'seed' });
    if (!client) {
      torrentRegistry.finish(magnet);
      throw new Error('WebTorrent disabled');
    }
    webtorrentHub.ensure(magnet, (torrent) => {
      torrentRegistry.update(magnet, { name: torrent.name });
      const update = () => {
        torrentRegistry.update(magnet, {
          peers: torrent.numPeers ?? 0,
          progress: torrent.progress ?? 0,
          downloaded: torrent.downloaded ?? 0,
          uploaded: torrent.uploaded ?? 0
        });
      };
      torrent.on('download', update);
      torrent.on('upload', update);
      torrent.on('wire', update);
      torrent.on('noPeers', update);
      torrent.on('done', update);
      torrent.on('error', () => torrentRegistry.finish(magnet));
      torrent.on('close', () => torrentRegistry.finish(magnet));
    });
  }, [torrentRegistry, webtorrentHub]);

  const seedEvent = useCallback(async (event: NostrEvent) => {
    if (!settingsRef.current.p2p.enabled) return;
    try {
      const result = await magnetBuilder.buildEventPackage(event);
      if (!result.magnet) return;
    } catch {
      // Fire-and-forget; seeding failure is non-fatal
    }
  }, [magnetBuilder]);

  const assistEvent = useCallback(async (event: NostrEvent) => {
    const authorPubkey = event.pubkey;
    const currentKeys = keysRef.current;
    const currentSettings = settingsRef.current;
    const isSelf = Boolean(currentKeys && authorPubkey === currentKeys);
    const allowP2P = isSelf || currentSettings.p2p.scope === 'everyone' || currentSettings.follows.includes(authorPubkey);
    const assisted = await eventAssist.maybeAssist(event, allowP2P);
    if (assisted) {
      transportStore.mark(event.id, { p2p: true });
    }
  }, [eventAssist, transportStore]);

  return {
    torrentRegistry,
    torrentSnapshot,
    canEncryptNip44,
    mediaAssist,
    magnetBuilder,
    loadMedia,
    seedMediaFile,
    seedEvent,
    reseedTorrent,
    assistEvent,
    loadP2PSettings: (pubkey: string) => settingsListService.load(pubkey),
    publishP2PSettings: (next: AppSettings['p2p'], updatedAt?: number) => settingsListService.publish(next, updatedAt)
  };
}
