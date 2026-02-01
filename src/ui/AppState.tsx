import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { defaultSettings } from '../storage/defaults';
import type { AppSettings, KeyRecord } from '../storage/types';
import type { NostrEvent, ProfileMetadata } from '../nostr/types';
import { NostrClient } from '../nostr/client';
import { ThreadService, type ThreadNode } from '../nostr/thread';
import { PublishService, type PublishInput } from '../nostr/publish';
import { ZapService } from '../nostr/zaps';
import type { TransportStatus } from '../nostr/transportTypes';
import type { AssistSource } from '../p2p/types';
import { NostrCache } from '../nostr/cache';
import { AuthorService } from '../nostr/author';
import { MediaRelayListService } from '../nostr/lists';
import { MediaUploadService } from '../nostr/mediaUpload';
import { SocialGraph } from '../nostr/social';
import type { TorrentSnapshot } from '../p2p/registry';
import { HashtagService } from '../nostr/hashtag';
import { MediaAttachService, type MediaAttachMode, type MediaAttachResult } from '../p2p/mediaAttach';
import { useAuthState } from './state/useAuthState';
import { useSettingsState } from './state/useSettingsState';
import { useTransportState } from './state/useTransportState';
import { useRelayState } from './state/useRelayState';
import { useSocialState } from './state/useSocialState';
import { useP2PState } from './state/useP2PState';
import { useFeedState } from './state/useFeedState';

interface AppStateValue {
  settings: AppSettings;
  events: NostrEvent[];
  profiles: Record<string, ProfileMetadata>;
  followers: string[];
  relayList: string[];
  mediaRelayList: string[];
  relayStatus: Record<string, boolean>;
  refreshRelayStatus: () => void;
  feedLoading: boolean;
  pendingCount: number;
  selectedEvent?: NostrEvent;
  selectedAuthor?: string;
  keys?: KeyRecord;
  selfProfile?: ProfileMetadata;
  paused: boolean;
  setPaused: (value: boolean) => void;
  setSettings: (next: AppSettings) => void;
  selectEvent: (event?: NostrEvent) => void;
  selectAuthor: (pubkey?: string) => void;
  saveKeyRecord: (record: KeyRecord) => Promise<void>;
  clearKeys: () => Promise<void>;
  connectNip07: () => Promise<void>;
  connectNip46: (input: string, onAuthUrl?: (url: string) => void, clientSecretKey?: Uint8Array) => Promise<string>;
  disconnectNip46: () => void;
  loadOlder: () => Promise<void>;
  loadThread: (eventId: string) => Promise<ThreadNode[]>;
  publishPost: (input: PublishInput) => Promise<NostrEvent>;
  publishReply: (input: PublishInput, replyTo: NostrEvent) => Promise<NostrEvent>;
  sendZap: (input: {
    event: NostrEvent;
    profile?: ProfileMetadata;
    amountSats: number;
    comment?: string;
  }) => Promise<void>;
  transport: Record<string, TransportStatus>;
  torrents: TorrentSnapshot;
  canEncryptNip44: boolean;
  loadMedia: (input: {
    eventId: string;
    source: AssistSource;
    authorPubkey: string;
    timeoutMs?: number;
  }) => Promise<{ url: string; source: 'p2p' | 'http' }>;
  seedMediaFile: (file: File) => Promise<{ url: string; magnet: string; sha256: string }>;
  reseedTorrent: (magnet: string) => void;
  attachMedia: (files: File[], mode: MediaAttachMode, options: { relays: string[]; preferredRelay?: string; onProgress?: (percent: number) => void }) => Promise<MediaAttachResult[]>;
  flushPending: () => void;
  isFollowed: (pubkey: string) => boolean;
  isBlocked: (pubkey: string) => boolean;
  isNsfwAuthor: (pubkey: string) => boolean;
  toggleFollow: (pubkey: string) => void;
  toggleBlock: (pubkey: string) => void;
  toggleNsfwAuthor: (pubkey: string) => void;
  setFeedMode: (mode: AppSettings['feedMode']) => void;
  saveMediaRelays: (urls: string[]) => Promise<void>;
  uploadMedia: (file: File, relays: string[], onProgress?: (percent: number) => void, preferredRelay?: string) => Promise<{ url: string; sha256?: string }>;
  authorService: AuthorService;
  hashtagService: HashtagService;
  findEventById: (id: string) => NostrEvent | undefined;
  saveP2PSettings: (settings: AppSettings['p2p'], updatedAt: number) => Promise<void>;
}

const AppState = createContext<AppStateValue | undefined>(undefined);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const nostr = useMemo(() => new NostrClient(), []);
  const nostrCache = useMemo(() => new NostrCache(), []);
  const { keys, signer, nip44Cipher, loadKeysFromStorage, saveKeyRecord, clearKeys, connectNip07, connectRemoteSigner, disconnectRemoteSigner } = useAuthState();
  const { transportStore, transport } = useTransportState();
  const { settings, updateSettings } = useSettingsState(defaultSettings);
  const settingsRef = useRef(settings);
  const blockedRef = useRef<string[]>([]);
  const isBlockedRef = useCallback((pubkey: string) => blockedRef.current.includes(pubkey), []);

  const { followers } = useSocialState({
    nostr,
    keysNpub: keys?.npub,
    settings,
    updateSettings
  });

  const { relayList, mediaRelayList, relayStatus, refreshRelayStatus } = useRelayState({
    nostr,
    keysNpub: keys?.npub,
    settings,
    updateSettings
  });

  const { torrentSnapshot, canEncryptNip44, magnetBuilder, loadMedia, seedMediaFile, reseedTorrent, assistEvent, loadP2PSettings, publishP2PSettings } = useP2PState({
    settings,
    nostr,
    signer,
    nip44Cipher,
    keysNpub: keys?.npub,
    transportStore
  });

  const feedState = useFeedState({
    nostr,
    transportStore,
    settings,
    followers,
    isBlocked: isBlockedRef,
    cache: nostrCache,
    onEventAssist: assistEvent
  });

  const [selfProfile, setSelfProfile] = useState<ProfileMetadata | undefined>(undefined);

  const authorService = useMemo(
    () => new AuthorService(nostr, transportStore, isBlockedRef),
    [nostr, transportStore, isBlockedRef]
  );
  const hashtagService = useMemo(
    () => new HashtagService(nostr, transportStore, isBlockedRef),
    [nostr, transportStore, isBlockedRef]
  );
  const threadService = useMemo(
    () => new ThreadService(nostr, transportStore, isBlockedRef),
    [nostr, transportStore, isBlockedRef]
  );
  const publishService = useMemo(() => new PublishService(nostr, signer), [nostr, signer]);
  const zapService = useMemo(() => new ZapService(signer), [signer]);
  const mediaRelayService = useMemo(() => new MediaRelayListService(nostr, signer), [nostr, signer]);
  const mediaUploadService = useMemo(() => new MediaUploadService(signer), [signer]);

  useEffect(() => {
    loadKeysFromStorage();
  }, [loadKeysFromStorage]);

  useEffect(() => {
    nostr.setRelays(settings.relays);
    nostr.setCache(nostrCache);
  }, [nostr, settings.relays]);

  useEffect(() => {
    blockedRef.current = settings.blocked;
  }, [settings.blocked]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    nostrCache.purgeExpired().catch(() => null);
  }, [nostrCache]);

  useEffect(() => {
    if (!keys?.npub) return;
    let active = true;
    loadP2PSettings(keys.npub)
      .then((remote) => {
        if (!active || !remote) return;
        const currentUpdatedAt = settingsRef.current.p2pUpdatedAt ?? 0;
        if ((remote.updatedAt ?? 0) <= currentUpdatedAt) return;
        updateSettings({ ...settingsRef.current, p2p: remote.settings, p2pUpdatedAt: remote.updatedAt });
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [keys, loadP2PSettings, updateSettings]);

  useEffect(() => {
    if (!keys?.npub) {
      setSelfProfile(undefined);
      return;
    }
    feedState.orchestrator.ensureProfile(keys.npub, feedState.setProfiles);
  }, [keys, feedState]);

  useEffect(() => {
    const next = feedState.profiles[keys?.npub ?? ''];
    if (next) setSelfProfile(next);
  }, [feedState.profiles, keys]);

  useEffect(() => {
    feedState.applySettings(settings);
  }, [settings, feedState]);

  const isFollowed = useCallback((pubkey: string) => {
    const graph = new SocialGraph(settings);
    return graph.isFollowed(pubkey);
  }, [settings]);

  const isBlocked = useCallback((pubkey: string) => {
    const graph = new SocialGraph(settings);
    return graph.isBlocked(pubkey);
  }, [settings]);

  const isNsfwAuthor = useCallback((pubkey: string) => {
    const graph = new SocialGraph(settings);
    return graph.isNsfw(pubkey);
  }, [settings]);

  const toggleFollow = useCallback((pubkey: string) => {
    const graph = new SocialGraph(settings);
    updateSettings({ ...graph.toggleFollow(pubkey), followsUpdatedAt: Date.now() });
  }, [settings, updateSettings]);

  const toggleBlock = useCallback((pubkey: string) => {
    const graph = new SocialGraph(settings);
    updateSettings({ ...graph.toggleBlock(pubkey), followsUpdatedAt: Date.now() });
  }, [settings, updateSettings]);

  const toggleNsfwAuthor = useCallback((pubkey: string) => {
    const graph = new SocialGraph(settings);
    updateSettings(graph.toggleNsfw(pubkey));
  }, [settings, updateSettings]);

  const setFeedMode = useCallback((mode: AppSettings['feedMode']) => {
    updateSettings({ ...settings, feedMode: mode });
  }, [settings, updateSettings]);

  const publishWithAssist = useCallback(async (input: PublishInput) => {
    const media = input.media ?? [];
    const withMediaAssist = await Promise.all(
      media.map(async (item) => {
        if (!settings.p2p.enabled) return item;
        try {
          const assist = await magnetBuilder.buildMediaPackage(item.url);
          return { ...item, magnet: assist.magnet, sha256: assist.sha256 };
        } catch {
          return item;
        }
      })
    );

    if (!settings.p2p.enabled) {
      return publishService.publishNote({
        content: input.content,
        media: withMediaAssist,
        replyTo: input.replyTo
      });
    }

    // Event package is derived from a signed note without assist tags to avoid recursion.
    const baseSigned = await publishService.signNote({
      content: input.content,
      media: withMediaAssist,
      replyTo: input.replyTo
    });
    const eventAssist = await magnetBuilder.buildEventPackage(baseSigned);
    const eventTags: string[][] = [];
    if (eventAssist.magnet) eventTags.push(['bt', eventAssist.magnet, 'event']);
    if (eventAssist.sha256) eventTags.push(['x', `sha256:${eventAssist.sha256}`, 'event']);

    const finalSigned = await publishService.signNote(
      { content: input.content, media: withMediaAssist, replyTo: input.replyTo },
      eventTags
    );
    await publishService.publishSigned(finalSigned);
    const seeded = Boolean(eventAssist.magnet) || withMediaAssist.some((item) => item.magnet);
    if (seeded) {
      transportStore.mark(finalSigned.id, { p2p: true });
    }
    return finalSigned;
  }, [magnetBuilder, publishService, settings.p2p.enabled, transportStore]);

  const saveMediaRelays = useCallback(async (urls: string[]) => {
    updateSettings({ ...settings, mediaRelays: urls });
    if (!keys?.npub) return;
    try {
      await mediaRelayService.publish(urls);
    } catch {
      // ignore publish errors; local settings still updated
    }
  }, [mediaRelayService, keys?.npub, settings, updateSettings]);

  const uploadMedia = useCallback(async (file: File, relays: string[], onProgress?: (percent: number) => void, preferredRelay?: string) => {
    if (!keys?.npub) throw new Error('Sign in to upload media');
    return mediaUploadService.uploadWithFallback(file, relays, onProgress, preferredRelay);
  }, [mediaUploadService, keys?.npub]);

  const mediaAttachService = useMemo(
    () => new MediaAttachService(uploadMedia, seedMediaFile),
    [uploadMedia, seedMediaFile]
  );

  const attachMedia = useCallback(async (files: File[], mode: MediaAttachMode, options: { relays: string[]; preferredRelay?: string; onProgress?: (percent: number) => void }) => {
    return mediaAttachService.attach(files, mode, options);
  }, [mediaAttachService]);

  const loadThread = useCallback(async (eventId: string) => {
    return threadService.loadThread(eventId);
  }, [threadService]);

  const publishReply = useCallback(async (input: PublishInput, replyTo: NostrEvent) => {
    return publishWithAssist({
      content: input.content,
      media: input.media,
      replyTo
    });
  }, [publishWithAssist]);

  const publishPost = useCallback(async (input: PublishInput) => {
    return publishWithAssist({
      content: input.content,
      media: input.media
    });
  }, [publishWithAssist]);

  const saveP2PSettings = useCallback(async (next: AppSettings['p2p'], updatedAt: number) => {
    if (!keys?.npub) return;
    await publishP2PSettings(next, updatedAt);
  }, [keys, publishP2PSettings]);

  const sendZap = useCallback(async ({ event, profile, amountSats, comment }: {
    event: NostrEvent;
    profile?: ProfileMetadata;
    amountSats: number;
    comment?: string;
  }) => {
    await zapService.sendZap({
      targetEvent: event,
      recipientProfile: profile,
      relays: settings.relays,
      amountSats,
      comment,
      nwcUri: settings.wallet?.nwc
    });
  }, [zapService, settings.relays, settings.wallet?.nwc]);

  const findEventById = feedState.findEventById;

  return (
    <AppState.Provider
      value={{
        settings,
        events: feedState.events,
        profiles: feedState.profiles,
        followers,
        relayList,
        mediaRelayList,
        relayStatus,
        refreshRelayStatus,
        feedLoading: feedState.feedLoading,
        pendingCount: feedState.pendingCount,
        selectedEvent: feedState.selectedEvent,
        selectedAuthor: feedState.selectedAuthor,
        keys,
        selfProfile,
        paused: feedState.paused,
        setPaused: feedState.setPaused,
        setSettings: updateSettings,
        selectEvent: feedState.selectEvent,
        selectAuthor: feedState.selectAuthor,
        saveKeyRecord,
        clearKeys,
        connectNip07,
        connectNip46: connectRemoteSigner,
        disconnectNip46: disconnectRemoteSigner,
        loadOlder: feedState.loadOlder,
        loadThread,
        publishPost,
        publishReply,
        sendZap,
        transport,
        torrents: torrentSnapshot,
        canEncryptNip44,
        loadMedia,
        seedMediaFile,
        reseedTorrent,
        attachMedia,
        flushPending: feedState.flushPending,
        isFollowed,
        isBlocked,
        isNsfwAuthor,
        toggleFollow,
        toggleBlock,
        toggleNsfwAuthor,
        setFeedMode,
        saveMediaRelays,
        uploadMedia,
        authorService,
        hashtagService,
        findEventById,
        saveP2PSettings
      }}
    >
      {children}
    </AppState.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppState);
  if (!context) throw new Error('AppStateProvider missing');
  return context;
}
