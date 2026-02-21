import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { defaultSettings } from '../storage/defaults';
import type { AppSettings, KeyRecord } from '../storage/types';
import type { ListDescriptor, NostrEvent, ProfileMetadata } from '../nostr/types';
import { NostrClient } from '../nostr/client';
import { ThreadService, type ThreadNode } from '../nostr/thread';
import { PublishService, type PublishInput } from '../nostr/publish';
import { ZapService } from '../nostr/zaps';
import type { AssistSource } from '../p2p/types';
import { NostrCache } from '../nostr/cache';
import { AuthorService } from '../nostr/author';
import { MediaRelayListService, PeopleListService, RelayListService } from '../nostr/lists';
import { MediaUploadService } from '../nostr/mediaUpload';
import { SocialGraph } from '../nostr/social';
import type { TorrentSnapshot } from '../p2p/registry';
import { HashtagService } from '../nostr/hashtag';
import { MediaAttachService, type MediaAttachMode, type MediaAttachResult } from '../p2p/mediaAttach';
import { AsyncEventVerifier } from '../nostr/eventVerifier';
import { encodeNeventUri } from '../nostr/uri';
import { useAuthState } from './state/useAuthState';
import { useSettingsState } from './state/useSettingsState';
import { useTransportState } from './state/useTransportState';
import { useRelayState } from './state/useRelayState';
import { useSocialState } from './state/useSocialState';
import { useP2PState } from './state/useP2PState';
import { useFeedState } from './state/useFeedState';
import type { TransportStore } from '../nostr/transport';

interface AppStateValue {
  settings: AppSettings;
  events: NostrEvent[];
  profiles: Record<string, ProfileMetadata>;
  followers: string[];
  following: string[];
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
  transportStore: TransportStore;
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
  publishRelayList: (urls: string[]) => Promise<void>;
  saveMediaRelays: (urls: string[]) => Promise<void>;
  uploadMedia: (file: File, relays: string[], onProgress?: (percent: number) => void, preferredRelay?: string) => Promise<{ url: string; sha256?: string }>;
  authorService: AuthorService;
  hashtagService: HashtagService;
  findEventById: (id: string) => NostrEvent | undefined;
  fetchEventById: (id: string) => Promise<NostrEvent | undefined>;
  publishRepost: (event: NostrEvent) => Promise<void>;
  publishReaction: (event: NostrEvent, reaction?: string) => Promise<void>;
  shareEvent: (event: NostrEvent) => Promise<string>;
  publishProfile: (profile: ProfileMetadata) => Promise<void>;
  fetchFollowersFor: (pubkey: string) => Promise<string[]>;
  fetchFollowingFor: (pubkey: string) => Promise<string[]>;
  searchProfiles: (query: string) => Promise<Record<string, ProfileMetadata>>;
  searchEvents: (query: string) => Promise<NostrEvent[]>;
  fetchMentions: (pubkey: string, input?: { until?: number; limit?: number }) => Promise<NostrEvent[]>;
  subscribeMentions: (pubkey: string, onEvent: (event: NostrEvent) => void, onClose?: (reasons: string[]) => void) => Promise<() => void>;
  fetchLists: (pubkey: string) => Promise<ListDescriptor[]>;
  publishPeopleList: (input: { title: string; description?: string; pubkeys: string[]; kind?: number }) => Promise<void>;
  saveP2PSettings: (settings: AppSettings['p2p'], updatedAt: number) => Promise<void>;
  mergeProfiles: (profiles: Record<string, ProfileMetadata>) => void;
  hydrateProfiles: (pubkeys: string[]) => Promise<void>;
}

const AppState = createContext<AppStateValue | undefined>(undefined);
const FeedControlState = createContext<{ setPaused: (value: boolean) => void } | undefined>(undefined);
const PROFILE_HYDRATION_RETRY_MS = 45_000;

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const nostr = useMemo(() => new NostrClient(), []);
  const nostrCache = useMemo(() => new NostrCache(), []);
  const eventVerifier = useMemo(() => new AsyncEventVerifier(), []);
  const { keys, signer, nip44Cipher, loadKeysFromStorage, saveKeyRecord, clearKeys, connectNip07, connectRemoteSigner, disconnectRemoteSigner } = useAuthState();
  const { transportStore } = useTransportState();
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
    relays: settings.relays,
    isBlocked: isBlockedRef,
    cache: nostrCache,
    onEventAssist: assistEvent,
    verifier: eventVerifier
  });

  const [selfProfile, setSelfProfile] = useState<ProfileMetadata | undefined>(undefined);
  const profilesRef = useRef<Record<string, ProfileMetadata>>({});
  const profileHydrationInflightRef = useRef<Set<string>>(new Set());
  const profileHydrationAttemptRef = useRef<Map<string, number>>(new Map());

  const authorService = useMemo(
    () => new AuthorService(nostr, transportStore, isBlockedRef, eventVerifier),
    [nostr, transportStore, isBlockedRef, eventVerifier]
  );
  const hashtagService = useMemo(
    () => new HashtagService(nostr, transportStore, isBlockedRef, eventVerifier),
    [nostr, transportStore, isBlockedRef, eventVerifier]
  );
  const threadService = useMemo(
    () => new ThreadService(nostr, transportStore, isBlockedRef, eventVerifier),
    [nostr, transportStore, isBlockedRef, eventVerifier]
  );
  const publishService = useMemo(() => new PublishService(nostr, signer), [nostr, signer]);
  const zapService = useMemo(() => new ZapService(signer), [signer]);
  const mediaRelayService = useMemo(() => new MediaRelayListService(nostr, signer), [nostr, signer]);
  const relayListService = useMemo(() => new RelayListService(nostr, signer), [nostr, signer]);
  const peopleListService = useMemo(() => new PeopleListService(nostr, signer), [nostr, signer]);
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
    feedState.orchestrator.ensureProfile(keys.npub, feedState.mergeProfiles);
  }, [keys, feedState]);

  useEffect(() => {
    const next = feedState.profiles[keys?.npub ?? ''];
    if (next) setSelfProfile(next);
  }, [feedState.profiles, keys]);

  useEffect(() => {
    profilesRef.current = feedState.profiles;
  }, [feedState.profiles]);

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
    updateSettings({ ...settingsRef.current, feedMode: mode });
  }, [updateSettings]);

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

  const publishRelayList = useCallback(async (urls: string[]) => {
    if (!keys?.npub) return;
    try {
      await relayListService.publish(urls);
    } catch {
      // ignore publish errors; local settings still updated
    }
  }, [keys?.npub, relayListService]);

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

  const publishRepost = useCallback(async (event: NostrEvent) => {
    const signed = await signer.signEvent({
      kind: 6,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['e', event.id], ['p', event.pubkey]],
      content: JSON.stringify(event)
    });
    await nostr.publishEvent(signed);
  }, [nostr, signer]);

  const publishReaction = useCallback(async (event: NostrEvent, reaction = '+') => {
    const rootId = event.tags.find((tag) => tag[0] === 'e' && tag[3] === 'root')?.[1];
    const tags: string[][] = [['e', event.id], ['p', event.pubkey]];
    if (rootId && rootId !== event.id) tags.push(['e', rootId, '', 'root']);
    const signed = await signer.signEvent({
      kind: 7,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: reaction
    });
    await nostr.publishEvent(signed);
  }, [nostr, signer]);

  const shareEvent = useCallback(async (event: NostrEvent) => {
    const uri = encodeNeventUri({
      id: event.id,
      author: event.pubkey,
      relays: settings.relays.slice(0, 3)
    });
    await copyToClipboard(uri);
    if (navigator.share) {
      try {
        await navigator.share({ url: uri, text: uri });
      } catch {
        // clipboard already populated
      }
    }
    return uri;
  }, [settings.relays]);

  const publishProfile = useCallback(async (profile: ProfileMetadata) => {
    if (!keys?.npub) throw new Error('Sign in to edit profile');
    const signed = await signer.signEvent({
      kind: 0,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: JSON.stringify(profile)
    });
    await nostr.publishEvent(signed);
    setSelfProfile(profile);
    feedState.setProfiles((prev) => ({ ...prev, [keys.npub]: profile }));
    await nostrCache.setProfile(keys.npub, profile);
  }, [feedState, keys, nostr, nostrCache, signer]);

  const mergeProfiles = useCallback((incoming: Record<string, ProfileMetadata>) => {
    const entries = Object.entries(incoming);
    if (entries.length === 0) return;
    feedState.setProfiles((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [pubkey, profile] of entries) {
        if (!profile) continue;
        const prevProfile = prev[pubkey];
        if (profilesEqual(prevProfile, profile)) continue;
        next[pubkey] = profile;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [feedState]);

  const hydrateProfiles = useCallback(async (pubkeys: string[]) => {
    const unique = Array.from(new Set(pubkeys.map((pubkey) => pubkey.trim().toLowerCase()).filter(Boolean)));
    if (unique.length === 0) return;
    const now = Date.now();
    const missing = unique.filter(
      (pubkey) => {
        if (profilesRef.current[pubkey]) return false;
        if (profileHydrationInflightRef.current.has(pubkey)) return false;
        const lastAttempt = profileHydrationAttemptRef.current.get(pubkey) ?? 0;
        return now - lastAttempt > PROFILE_HYDRATION_RETRY_MS;
      }
    );
    if (missing.length === 0) return;
    missing.forEach((pubkey) => profileHydrationInflightRef.current.add(pubkey));
    missing.forEach((pubkey) => profileHydrationAttemptRef.current.set(pubkey, now));
    try {
      const fetched = await nostr.fetchProfiles(missing);
      mergeProfiles(fetched);
      Object.keys(fetched).forEach((pubkey) => profileHydrationAttemptRef.current.delete(pubkey.toLowerCase()));
    } finally {
      missing.forEach((pubkey) => profileHydrationInflightRef.current.delete(pubkey));
    }
  }, [mergeProfiles, nostr]);

  const fetchFollowersFor = useCallback(async (pubkey: string) => {
    return nostr.fetchFollowers(pubkey, 600);
  }, [nostr]);

  const fetchFollowingFor = useCallback(async (pubkey: string) => {
    return nostr.fetchFollowing(pubkey);
  }, [nostr]);

  const searchProfiles = useCallback(async (query: string) => {
    return nostr.searchProfiles(query);
  }, [nostr]);

  const searchEvents = useCallback(async (query: string) => {
    return nostr.searchEvents(query);
  }, [nostr]);

  const fetchMentions = useCallback(async (pubkey: string, input?: { until?: number; limit?: number }) => {
    return nostr.fetchMentions(pubkey, input);
  }, [nostr]);

  const subscribeMentions = useCallback(async (
    pubkey: string,
    onEvent: (event: NostrEvent) => void,
    onClose?: (reasons: string[]) => void
  ) => {
    return nostr.subscribeMentions(pubkey, onEvent, onClose);
  }, [nostr]);

  const fetchLists = useCallback(async (pubkey: string) => {
    return nostr.fetchLists(pubkey);
  }, [nostr]);

  const publishPeopleList = useCallback(async (input: { title: string; description?: string; pubkeys: string[]; kind?: number }) => {
    if (!keys?.npub) throw new Error('Sign in to publish a list');
    await peopleListService.publish(input);
  }, [keys?.npub, peopleListService]);

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
  const fetchEventById = useCallback(async (id: string) => nostr.fetchEventById(id), [nostr]);

  const feedControlValue = useMemo(
    () => ({ setPaused: feedState.setPaused }),
    [feedState.setPaused]
  );

  return (
    <FeedControlState.Provider value={feedControlValue}>
      <AppState.Provider
        value={{
        settings,
        events: feedState.events,
        profiles: feedState.profiles,
        followers,
        following: settings.follows,
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
        transportStore,
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
        publishRelayList,
        saveMediaRelays,
        uploadMedia,
        authorService,
        hashtagService,
        findEventById,
        fetchEventById,
        publishRepost,
        publishReaction,
        shareEvent,
        publishProfile,
        fetchFollowersFor,
        fetchFollowingFor,
        searchProfiles,
        searchEvents,
        fetchMentions,
        subscribeMentions,
        fetchLists,
        publishPeopleList,
        saveP2PSettings,
        mergeProfiles,
        hydrateProfiles
        }}
      >
        {children}
      </AppState.Provider>
    </FeedControlState.Provider>
  );
}

async function copyToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const area = document.createElement('textarea');
  area.value = value;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  document.body.removeChild(area);
}

export function useAppState() {
  const context = useContext(AppState);
  if (!context) throw new Error('AppStateProvider missing');
  return context;
}

export function useFeedControlState() {
  const context = useContext(FeedControlState);
  if (!context) throw new Error('FeedControlState provider missing');
  return context;
}

function profilesEqual(a?: ProfileMetadata, b?: ProfileMetadata) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.name === b.name &&
    a.display_name === b.display_name &&
    a.picture === b.picture &&
    a.banner === b.banner &&
    a.about === b.about &&
    a.website === b.website &&
    a.nip05 === b.nip05 &&
    a.lud16 === b.lud16 &&
    a.lud06 === b.lud06
  );
}
