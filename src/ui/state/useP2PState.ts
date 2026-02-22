import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings } from '../../storage/types';
import type { NostrClient } from '../../nostr/client';
import type { NostrCache } from '../../nostr/cache';
import type { EventSigner } from '../../nostr/signer';
import type { Torrent } from 'webtorrent';
import { MediaAssist } from '../../p2p/mediaAssist';
import { MagnetBuilder } from '../../p2p/magnetBuilder';
import { TorrentRegistry, type TorrentSnapshot, type TorrentStatus } from '../../p2p/registry';
import { TorrentSyncService } from '../../p2p/torrentSync';
import { TorrentListService } from '../../nostr/torrentList';
import type { Nip44Cipher } from '../../nostr/nip44';
import type { AssistSource } from '../../p2p/types';
import type { NostrEvent } from '../../nostr/types';
import type { TransportStore } from '../../nostr/transport';
import { WebTorrentHub } from '../../p2p/webtorrentHub';
import { P2PSettingsListService } from '../../nostr/p2pSettingsList';
import { EventAssistService } from '../../p2p/eventAssistService';
import { SeedingListService } from '../../nostr/seedingList';

export function useP2PState({
  settings,
  nostr,
  cache,
  signer,
  nip44Cipher,
  keysNpub,
  transportStore
}: {
  settings: AppSettings;
  nostr: NostrClient;
  cache: NostrCache;
  signer: EventSigner;
  nip44Cipher: Nip44Cipher;
  keysNpub?: string;
  transportStore: TransportStore;
}) {
  const OWN_AVAILABILITY_MS = 30 * 24 * 60 * 60 * 1000;
  const OTHER_AVAILABILITY_MS = 7 * 24 * 60 * 60 * 1000;
  const RESEED_INTERVAL_MS = 10 * 60 * 1000;
  const SEEDING_DISCOVERY_INTERVAL_MS = 2 * 60 * 1000;
  const DISCOVERED_AUTHOR_TTL_MS = 24 * 60 * 60 * 1000;
  const MAX_SEEDING_AUTHORS_PER_SCAN = 20;
  const MAX_HINTS_PER_AUTHOR = 8;
  const AUTOJOIN_COOLDOWN_MS = 5 * 60 * 1000;
  const AUTOJOIN_ABSOLUTE_MAX = 80;

  const [torrentSnapshot, setTorrentSnapshot] = useState<TorrentSnapshot>({});
  const [canEncryptNip44, setCanEncryptNip44] = useState(false);
  const settingsRef = useRef(settings);
  const keysRef = useRef(keysNpub);
  const torrentSnapshotRef = useRef(torrentSnapshot);
  const reseedAtRef = useRef(new Map<string, number>());
  const discoveredAuthorsRef = useRef(new Map<string, number>());
  const seedingDiscoveryInflightRef = useRef(new Set<string>());
  const autoJoinAttemptedAtRef = useRef(new Map<string, number>());
  const trackedTorrentsRef = useRef(new WeakSet<Torrent>());

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
  const seedingListService = useMemo(
    () => new SeedingListService(nostr, signer),
    [nostr, signer]
  );
  const publishSeedingList = useCallback(async (items: TorrentStatus[]) => {
    if (!settingsRef.current.p2p.enabled || !settingsRef.current.p2p.publishSeedingList) return;
    await seedingListService.publish(items);
  }, [seedingListService]);
  const torrentSync = useMemo(
    () => new TorrentSyncService(torrentListService, publishSeedingList),
    [torrentListService, publishSeedingList]
  );

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
          if (item.eventId) {
            // Re-seed from cached event bytes so we act as a seeder, not a leecher
            cache.getEvent(item.eventId).then((event) => {
              if (!active || !event) return;
              magnetBuilder.buildEventPackage(event).then((result) => {
                if (!active || !result.magnet) return;
                transportStore.mark(item.eventId!, { p2p: true });
              }).catch(() => undefined);
            }).catch(() => undefined);
          } else {
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

  const attachTorrentMetrics = useCallback((magnet: string, torrent: Torrent) => {
    if (trackedTorrentsRef.current.has(torrent)) return;
    trackedTorrentsRef.current.add(torrent);
    const update = () => torrentRegistry.update(magnet, {
      peers: torrent.numPeers ?? 0,
      progress: torrent.progress ?? 0,
      downloaded: torrent.downloaded ?? 0,
      uploaded: torrent.uploaded ?? 0
    });
    update();
    torrent.on('download', update);
    torrent.on('upload', update);
    torrent.on('wire', update);
    torrent.on('noPeers', update);
    torrent.on('done', update);
    torrent.on('error', () => torrentRegistry.finish(magnet));
    torrent.on('close', () => torrentRegistry.finish(magnet));
  }, [torrentRegistry]);

  const canAccessAuthor = useCallback((authorPubkey?: string) => {
    if (!authorPubkey) return false;
    const currentKeys = keysRef.current;
    const currentSettings = settingsRef.current;
    const isSelf = Boolean(currentKeys && authorPubkey === currentKeys);
    if (isSelf) return true;
    return currentSettings.p2p.scope === 'everyone' || currentSettings.follows.includes(authorPubkey);
  }, []);

  const ensureFromSeedingHint = useCallback((hint: {
    magnet: string;
    url?: string;
    eventId?: string;
    authorPubkey?: string;
    availableUntil?: number;
  }) => {
    const now = Date.now();
    if (hint.availableUntil !== undefined && now > hint.availableUntil) return;
    if (!canAccessAuthor(hint.authorPubkey)) return;
    const lastAttempt = autoJoinAttemptedAtRef.current.get(hint.magnet) ?? 0;
    if (now - lastAttempt < AUTOJOIN_COOLDOWN_MS) return;
    const activeCount = Object.values(torrentSnapshotRef.current).filter((item) => item.active).length;
    const maxAutoJoin = Math.min(
      AUTOJOIN_ABSOLUTE_MAX,
      Math.max(settingsRef.current.p2p.maxConcurrent * 3, 12)
    );
    if (activeCount >= maxAutoJoin) return;
    autoJoinAttemptedAtRef.current.set(hint.magnet, now);
    if (hint.url?.startsWith('http')) {
      const source: AssistSource = {
        url: hint.url,
        magnet: hint.magnet,
        sha256: undefined,
        type: 'media',
        eventId: hint.eventId,
        authorPubkey: hint.authorPubkey,
        availableUntil: hint.availableUntil
      };
      mediaAssist.ensureWebSeed(source, true);
      return;
    }
    try {
      torrentRegistry.start({
        magnet: hint.magnet,
        mode: 'fetch',
        eventId: hint.eventId,
        authorPubkey: hint.authorPubkey,
        availableUntil: hint.availableUntil
      });
      webtorrentHub.ensure(hint.magnet, (torrent) => {
        torrentRegistry.update(hint.magnet, { name: torrent.name });
        attachTorrentMetrics(hint.magnet, torrent);
      });
    } catch {
      torrentRegistry.finish(hint.magnet);
    }
  }, [attachTorrentMetrics, canAccessAuthor, mediaAssist, torrentRegistry, webtorrentHub, AUTOJOIN_ABSOLUTE_MAX, AUTOJOIN_COOLDOWN_MS]);

  useEffect(() => {
    let active = true;
    const runDiscovery = async () => {
      if (!active) return;
      const currentKeys = keysRef.current;
      const currentSettings = settingsRef.current;
      if (!currentKeys || !currentSettings.p2p.enabled) return;
      const now = Date.now();
      const candidates = new Set<string>([currentKeys, ...currentSettings.follows]);
      discoveredAuthorsRef.current.forEach((seenAt, pubkey) => {
        if (now - seenAt > DISCOVERED_AUTHOR_TTL_MS) {
          discoveredAuthorsRef.current.delete(pubkey);
          return;
        }
        if (currentSettings.p2p.scope === 'everyone' || currentSettings.follows.includes(pubkey)) {
          candidates.add(pubkey);
        }
      });
      const staleAttemptCutoff = now - AUTOJOIN_COOLDOWN_MS * 2;
      autoJoinAttemptedAtRef.current.forEach((attemptedAt, magnet) => {
        if (attemptedAt < staleAttemptCutoff) autoJoinAttemptedAtRef.current.delete(magnet);
      });
      const toLoad = Array.from(candidates)
        .filter((pubkey) => !seedingDiscoveryInflightRef.current.has(pubkey))
        .slice(0, MAX_SEEDING_AUTHORS_PER_SCAN);
      if (toLoad.length === 0) return;
      await Promise.all(toLoad.map(async (pubkey) => {
        seedingDiscoveryInflightRef.current.add(pubkey);
        try {
          if (!canAccessAuthor(pubkey)) return;
          const hints = await seedingListService.load(pubkey).catch(() => []);
          if (!active || hints.length === 0) return;
          hints.slice(0, MAX_HINTS_PER_AUTHOR).forEach((hint) => {
            ensureFromSeedingHint({
              magnet: hint.magnet,
              url: hint.url,
              eventId: hint.eventId,
              authorPubkey: hint.authorPubkey ?? pubkey,
              availableUntil: hint.availableUntil
            });
          });
        } finally {
          seedingDiscoveryInflightRef.current.delete(pubkey);
        }
      }));
    };
    runDiscovery().catch(() => null);
    const timer = window.setInterval(() => {
      runDiscovery().catch(() => null);
    }, SEEDING_DISCOVERY_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [canAccessAuthor, ensureFromSeedingHint, seedingListService, AUTOJOIN_COOLDOWN_MS, DISCOVERED_AUTHOR_TTL_MS, MAX_HINTS_PER_AUTHOR, MAX_SEEDING_AUTHORS_PER_SCAN, SEEDING_DISCOVERY_INTERVAL_MS]);

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
        if (!item.availableUntil || now > item.availableUntil) return;
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
        if (item.mode === 'seed') {
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
            // WebTorrent client not ready
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
          mediaAssist.ensureWebSeed(source, allowP2P);
        }
      });
    }, RESEED_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [mediaAssist, webtorrentHub, torrentRegistry]);

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
    if (authorPubkey) {
      discoveredAuthorsRef.current.set(authorPubkey, Date.now());
      if (discoveredAuthorsRef.current.size > 600) {
        const recent = Array.from(discoveredAuthorsRef.current.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 400);
        discoveredAuthorsRef.current = new Map(recent);
      }
    }
    const isP2POnly = source.url.startsWith('p2p://');
    const isSelf = Boolean(currentKeys && authorPubkey === currentKeys);
    const allowP2P = isP2POnly || isSelf || currentSettings.p2p.scope === 'everyone' || currentSettings.follows.includes(authorPubkey);
    let resolvedSource = source;
    if (allowP2P && !resolvedSource.magnet && authorPubkey) {
      const hint = await seedingListService.resolve(authorPubkey, { eventId, url: source.url }).catch(() => undefined);
      if (hint?.magnet) {
        resolvedSource = {
          ...resolvedSource,
          magnet: hint.magnet
        };
      }
    }
    const availabilityMs = isSelf ? OWN_AVAILABILITY_MS : OTHER_AVAILABILITY_MS;
    const availableUntil = resolvedSource.magnet && resolvedSource.url.startsWith('http')
      ? Date.now() + availabilityMs
      : undefined;
    const assistSource: AssistSource = {
      ...resolvedSource,
      eventId,
      authorPubkey,
      availableUntil
    };
    const shouldReseed = currentSettings.p2p.enabled
      && allowP2P
      && Boolean(assistSource.magnet)
      && assistSource.url.startsWith('http');
    const result = await mediaAssist.load(assistSource, allowP2P, timeoutMs ?? 2000);
    transportStore.mark(eventId, { [result.source]: true });
    if (shouldReseed) {
      transportStore.mark(eventId, { p2p: true });
    }
    return result;
  }, [mediaAssist, transportStore, OWN_AVAILABILITY_MS, OTHER_AVAILABILITY_MS, seedingListService]);

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

  const seedEvent = useCallback(async (event: NostrEvent): Promise<{ bt: string; sha256?: string } | undefined> => {
    if (!settingsRef.current.p2p.enabled) return undefined;
    try {
      const result = await magnetBuilder.buildEventPackage(event);
      if (!result.magnet) return undefined;
      transportStore.mark(event.id, { p2p: true });
      return { bt: result.magnet, sha256: result.sha256 };
    } catch {
      return undefined;
    }
  }, [magnetBuilder, transportStore]);

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
