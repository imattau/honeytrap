import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { defaultSettings } from '../storage/defaults';
import type { AppSettings, KeyRecord } from '../storage/types';
import { loadKeys, saveKeys } from '../storage/db';
import { SettingsStore } from '../storage/settings';
import type { NostrEvent, ProfileMetadata } from '../nostr/types';
import { NostrClient } from '../nostr/client';
import { FeedService } from '../nostr/service';
import { FeedOrchestrator } from '../nostr/feed';
import { ThreadService, type ThreadNode } from '../nostr/thread';
import { connectNip46, disconnectNip46, decodeKey, getNip07Pubkey, type Nip46Session } from '../nostr/auth';
import { PublishService, type PublishInput } from '../nostr/publish';
import { EventSigner } from '../nostr/signer';
import { ZapService } from '../nostr/zaps';
import { TransportStore } from '../nostr/transport';
import type { TransportStatus } from '../nostr/transportTypes';
import { MediaAssist } from '../p2p/mediaAssist';
import type { AssistSource } from '../p2p/types';
import { SocialGraph } from '../nostr/social';
import { NostrCache } from '../nostr/cache';
import { AuthorService } from '../nostr/author';

interface AppStateValue {
  settings: AppSettings;
  events: NostrEvent[];
  profiles: Record<string, ProfileMetadata>;
  followers: string[];
  relayList: string[];
  relayStatus: Record<string, boolean>;
  refreshRelayStatus: () => void;
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
  connectNip46: (input: string) => Promise<string>;
  disconnectNip46: () => void;
  loadOlder: () => Promise<void>;
  loadThread: (eventId: string) => Promise<ThreadNode[]>;
  publishReply: (input: PublishInput, replyTo: NostrEvent) => Promise<NostrEvent>;
  sendZap: (input: {
    event: NostrEvent;
    profile?: ProfileMetadata;
    amountSats: number;
    comment?: string;
  }) => Promise<void>;
  transport: Record<string, TransportStatus>;
  loadMedia: (input: {
    eventId: string;
    source: AssistSource;
    authorPubkey: string;
    timeoutMs?: number;
  }) => Promise<{ url: string; source: 'p2p' | 'http' }>;
  flushPending: () => void;
  isFollowed: (pubkey: string) => boolean;
  isBlocked: (pubkey: string) => boolean;
  isNsfwAuthor: (pubkey: string) => boolean;
  toggleFollow: (pubkey: string) => void;
  toggleBlock: (pubkey: string) => void;
  toggleNsfwAuthor: (pubkey: string) => void;
  setFeedMode: (mode: AppSettings['feedMode']) => void;
  authorService: AuthorService;
  findEventById: (id: string) => NostrEvent | undefined;
}

const AppState = createContext<AppStateValue | undefined>(undefined);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettingsState] = useState<AppSettings>(defaultSettings);
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileMetadata>>({});
  const [followers, setFollowers] = useState<string[]>([]);
  const [relayList, setRelayList] = useState<string[]>([]);
  const [relayStatus, setRelayStatus] = useState<Record<string, boolean>>({});
  const [selectedEvent, setSelectedEvent] = useState<NostrEvent | undefined>(undefined);
  const [selectedAuthor, setSelectedAuthor] = useState<string | undefined>(undefined);
  const [keys, setKeys] = useState<KeyRecord | undefined>(undefined);
  const [selfProfile, setSelfProfile] = useState<ProfileMetadata | undefined>(undefined);
  const [paused, setPaused] = useState(true);
  const [transport, setTransport] = useState<Record<string, TransportStatus>>({});

  const nostr = useMemo(() => new NostrClient(), []);
  const settingsStore = useMemo(() => new SettingsStore(defaultSettings), []);
  const transportStore = useMemo(() => new TransportStore(), []);
  const mediaAssist = useMemo(() => new MediaAssist(defaultSettings.p2p), []);
  const nostrCache = useMemo(() => new NostrCache(), []);
  const blockedRef = useRef<string[]>([]);
  const socialFetchRef = useRef({ followersAt: 0, followingAt: 0, relaysAt: 0 });
  const feedService = useMemo(() => new FeedService(nostr), [nostr]);
  const nip46SessionRef = useRef<Nip46Session | null>(null);
  const orchestrator = useMemo(
    () => new FeedOrchestrator(nostr, feedService, transportStore, (pubkey) => blockedRef.current.includes(pubkey)),
    [nostr, feedService, transportStore]
  );
  const authorService = useMemo(
    () => new AuthorService(nostr, transportStore, (pubkey) => blockedRef.current.includes(pubkey)),
    [nostr, transportStore]
  );
  const threadService = useMemo(
    () => new ThreadService(nostr, transportStore, (pubkey) => blockedRef.current.includes(pubkey)),
    [nostr, transportStore]
  );
  const signer = useMemo(() => new EventSigner(() => keys, () => nip46SessionRef.current), [keys]);
  const publishService = useMemo(() => new PublishService(nostr, signer), [nostr, signer]);
  const zapService = useMemo(() => new ZapService(signer), [signer]);

  const updateSettings = (next: AppSettings) => {
    setSettingsState(next);
    settingsStore.save(next).catch(() => null);
    const graph = new SocialGraph(next);
    setEvents((prev) => graph.filterEvents(prev));
  };

  useEffect(() => {
    settingsStore.load().then(setSettingsState);
    loadKeys().then(setKeys);
  }, [settingsStore]);

  useEffect(() => {
    nostr.setRelays(settings.relays);
    nostr.setCache(nostrCache);
  }, [nostr, settings.relays]);

  const refreshRelayStatus = useCallback(() => {
    const status = nostr.getRelayStatus();
    const next: Record<string, boolean> = {};
    status.forEach((value, key) => {
      next[key] = value;
    });
    setRelayStatus(next);
  }, [nostr]);

  useEffect(() => {
    blockedRef.current = settings.blocked;
  }, [settings.blocked]);

  useEffect(() => {
    mediaAssist.updateSettings(settings.p2p);
  }, [mediaAssist, settings.p2p]);

  useEffect(() => {
    const unsubscribe = transportStore.subscribe(setTransport);
    return () => unsubscribe();
  }, [transportStore]);

  useEffect(() => {
    nostrCache.purgeExpired().catch(() => null);
  }, [nostrCache]);

  useEffect(() => {
    if (!keys?.npub) {
      setSelfProfile(undefined);
      return;
    }
    orchestrator.ensureProfile(keys.npub, setProfiles);
  }, [keys, orchestrator]);

  useEffect(() => {
    if (!keys?.npub) {
      setFollowers([]);
      return;
    }
    const now = Date.now();
    if (now - socialFetchRef.current.followersAt < 30_000) return;
    socialFetchRef.current.followersAt = now;
    let active = true;
    nostr.fetchFollowers(keys.npub, 400)
      .then((list) => {
        if (!active) return;
        setFollowers(list);
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [keys?.npub, settings.relays, nostr]);

  useEffect(() => {
    if (!keys?.npub) return;
    const now = Date.now();
    if (now - socialFetchRef.current.followingAt < 30_000) return;
    socialFetchRef.current.followingAt = now;
    let active = true;
    nostr.fetchFollowing(keys.npub)
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
  }, [keys?.npub, settings.relays, nostr, settings.follows, updateSettings]);

  useEffect(() => {
    if (!keys?.npub) return;
    const now = Date.now();
    if (now - socialFetchRef.current.relaysAt < 30_000) return;
    socialFetchRef.current.relaysAt = now;
    let active = true;
    nostr.fetchRelayList(keys.npub)
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
  }, [keys?.npub, settings.relays, nostr, updateSettings]);

  useEffect(() => {
    if (!keys?.npub) return;
    const next = profiles[keys.npub];
    if (next) setSelfProfile(next);
  }, [profiles, keys]);

  useEffect(() => {
    orchestrator.setPaused(paused);
  }, [paused, orchestrator]);

  const eventsRef = useRef<NostrEvent[]>([]);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const subscribeFeed = useCallback(() => {
    orchestrator.reset();
    setEvents([]);
    orchestrator.subscribe(
      { follows: settings.follows, followers, feedMode: settings.feedMode, listId: settings.selectedListId },
      () => eventsRef.current,
      setEvents,
      setProfiles
    );
  }, [orchestrator, settings.follows, settings.selectedListId, settings.feedMode, followers]);

  useEffect(() => {
    orchestrator.stop();
    subscribeFeed();
    return () => orchestrator.stop();
  }, [subscribeFeed, orchestrator]);

  const selectEvent = (event?: NostrEvent) => {
    setSelectedEvent(event);
    if (event) setSelectedAuthor(event.pubkey);
    if (event) orchestrator.ensureProfile(event.pubkey, setProfiles);
  };

  const selectAuthor = (pubkey?: string) => {
    setSelectedAuthor(pubkey);
    if (pubkey) orchestrator.ensureProfile(pubkey, setProfiles);
  };

  const saveKeyRecord = async (record: KeyRecord) => {
    await saveKeys(record);
    setKeys(record);
  };

  const clearKeys = async () => {
    await saveKeys({ npub: '' });
    setKeys(undefined);
    nip46SessionRef.current = null;
  };

  const connectRemoteSigner = async (input: string) => {
    const session = await connectNip46(input);
    nip46SessionRef.current = session;
    await saveKeyRecord({ npub: session.pubkey });
    return session.pubkey;
  };

  const connectNip07 = async () => {
    const pubkey = await getNip07Pubkey();
    await saveKeyRecord({ npub: pubkey });
  };

  const disconnectRemoteSigner = () => {
    disconnectNip46(nip46SessionRef.current ?? undefined);
    nip46SessionRef.current = null;
  };

  const loadOlder = useCallback(async () => {
    await orchestrator.loadOlder(
      { follows: settings.follows, followers, feedMode: settings.feedMode, listId: settings.selectedListId },
      () => eventsRef.current,
      setEvents
    );
  }, [orchestrator, settings.follows, settings.selectedListId, settings.feedMode, followers]);

  const flushPending = useCallback(() => {
    orchestrator.flushPending(() => eventsRef.current, setEvents);
  }, [orchestrator]);

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
    updateSettings(graph.toggleFollow(pubkey));
  }, [settings, updateSettings]);

  const toggleBlock = useCallback((pubkey: string) => {
    const graph = new SocialGraph(settings);
    updateSettings(graph.toggleBlock(pubkey));
  }, [settings, updateSettings]);

  const toggleNsfwAuthor = useCallback((pubkey: string) => {
    const graph = new SocialGraph(settings);
    updateSettings(graph.toggleNsfw(pubkey));
  }, [settings, updateSettings]);

  const setFeedMode = useCallback((mode: AppSettings['feedMode']) => {
    updateSettings({ ...settings, feedMode: mode });
  }, [settings, updateSettings]);

  const loadThread = useCallback(async (eventId: string) => {
    return threadService.loadThread(eventId);
  }, [threadService]);

  const publishReply = useCallback(async (input: PublishInput, replyTo: NostrEvent) => {
    return publishService.publishNote({
      content: input.content,
      media: input.media,
      replyTo
    });
  }, [publishService]);

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

  const loadMedia = useCallback(async ({ eventId, source, authorPubkey, timeoutMs }: {
    eventId: string;
    source: AssistSource;
    authorPubkey: string;
    timeoutMs?: number;
  }) => {
    const allowP2P = settings.p2p.scope === 'everyone' || settings.follows.includes(authorPubkey);
    const result = await mediaAssist.load(source, allowP2P, timeoutMs ?? 2000);
    transportStore.mark(eventId, { [result.source]: true });
    return result;
  }, [mediaAssist, settings.follows, settings.p2p.scope, transportStore]);

  const findEventById = useCallback(
    (id: string) => events.find((event) => event.id === id),
    [events]
  );

  return (
    <AppState.Provider
      value={{
        settings,
        events,
        profiles,
        followers,
        relayList,
        relayStatus,
        refreshRelayStatus,
        selectedEvent,
        selectedAuthor,
        keys,
        selfProfile,
        paused,
        setPaused,
        setSettings: updateSettings,
        selectEvent,
        selectAuthor,
        saveKeyRecord,
        clearKeys,
        connectNip07,
        connectNip46: connectRemoteSigner,
        disconnectNip46: disconnectRemoteSigner,
        loadOlder,
        loadThread,
        publishReply,
        sendZap,
        transport,
        loadMedia,
        flushPending,
        isFollowed,
        isBlocked,
        isNsfwAuthor,
        toggleFollow,
        toggleBlock,
        toggleNsfwAuthor,
        setFeedMode,
        authorService,
        findEventById
      }}
    >
      {children}
    </AppState.Provider>
  );
}

function sameSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  for (const item of b) {
    if (!set.has(item)) return false;
  }
  return true;
}

export function useAppState() {
  const context = useContext(AppState);
  if (!context) throw new Error('AppStateProvider missing');
  return context;
}
