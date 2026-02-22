import React, { createContext, useContext, useMemo, useEffect, useCallback, useRef, useState } from 'react';
import { useFeedState } from '../useFeedState';
import { useSettings } from './SettingsContext';
import { useAuth } from './AuthContext';
import { useNostr } from './NostrContext';
import { useTransport } from './TransportContext';
import { useSocial } from './SocialContext';
import { useP2P } from './P2PContext';
import { AuthorService } from '../../../nostr/author';
import { HashtagService } from '../../../nostr/hashtag';
import { ThreadService, type ThreadNode } from '../../../nostr/thread';
import { PublishService, type PublishInput } from '../../../nostr/publish';
import { ZapService } from '../../../nostr/zaps';
import { PeopleListService } from '../../../nostr/lists';
import { encodeNeventUri } from '../../../nostr/uri';
import { copyToClipboard } from '../../utils';
import type { NostrEvent, ProfileMetadata, ListDescriptor } from '../../../nostr/types';
import { ProfileStore, useAuthorProfile, useAllProfiles } from '../ProfileStore';

interface FeedContextValue {
  events: NostrEvent[];
  profiles: Record<string, ProfileMetadata>;
  feedLoading: boolean;
  pendingCount: number;
  selectedEvent?: NostrEvent;
  selectedAuthor?: string;
  selfProfile?: ProfileMetadata;
  paused: boolean;
  setPaused: (value: boolean) => void;
  selectEvent: (event?: NostrEvent) => void;
  selectAuthor: (pubkey?: string) => void;
  loadOlder: () => Promise<void>;
  flushPending: () => void;
  loadThread: (eventId: string) => Promise<ThreadNode[]>;
  publishPost: (input: PublishInput) => Promise<NostrEvent>;
  publishReply: (input: PublishInput, replyTo: NostrEvent) => Promise<NostrEvent>;
  sendZap: (input: {
    event: NostrEvent;
    profile?: ProfileMetadata;
    amountSats: number;
    comment?: string;
  }) => Promise<void>;
  publishRepost: (event: NostrEvent) => Promise<void>;
  publishReaction: (event: NostrEvent, reaction?: string) => Promise<void>;
  shareEvent: (event: NostrEvent) => Promise<string>;
  publishProfile: (profile: ProfileMetadata) => Promise<void>;
  searchEvents: (query: string) => Promise<NostrEvent[]>;
  fetchMentions: (pubkey: string, input?: { until?: number; limit?: number }) => Promise<NostrEvent[]>;
  subscribeMentions: (pubkey: string, onEvent: (event: NostrEvent) => void, onClose?: (reasons: string[]) => void) => Promise<() => void>;
  fetchLists: (pubkey: string) => Promise<ListDescriptor[]>;
  publishPeopleList: (input: { title: string; description?: string; pubkeys: string[]; identifier?: string; kind?: number }) => Promise<void>;
  mergeProfiles: (profiles: Record<string, ProfileMetadata>) => void;
  hydrateProfiles: (pubkeys: string[]) => Promise<void>;
  authorService: AuthorService;
  hashtagService: HashtagService;
  findEventById: (id: string) => NostrEvent | undefined;
  fetchEventById: (id: string) => Promise<NostrEvent | undefined>;
}

interface FeedActionsContextValue {
  selectEvent: (event?: NostrEvent) => void;
  selectAuthor: (pubkey?: string) => void;
  publishRepost: (event: NostrEvent) => Promise<void>;
  publishReaction: (event: NostrEvent, reaction?: string) => Promise<void>;
  shareEvent: (event: NostrEvent) => Promise<string>;
  hydrateProfiles: (pubkeys: string[]) => Promise<void>;
  findEventById: (id: string) => NostrEvent | undefined;
}

const FeedContext = createContext<FeedContextValue | undefined>(undefined);
const FeedActionsContext = createContext<FeedActionsContextValue | undefined>(undefined);
// Legacy whole-map context kept for components that need all profiles (PostContent, etc.)
const FeedProfilesContext = createContext<Record<string, ProfileMetadata>>({});
const FeedControlState = createContext<{ setPaused: (value: boolean) => void } | undefined>(undefined);

// Stable ref context: consumers that only need to read the latest profiles without
// subscribing to every profile change use this to avoid re-renders.
const FeedProfilesRefContext = createContext<React.MutableRefObject<Record<string, ProfileMetadata>>>({ current: {} });

// ProfileStore context: enables per-pubkey subscriptions (no re-render on unrelated profiles)
const ProfileStoreContext = createContext<ProfileStore | null>(null);

const PROFILE_HYDRATION_RETRY_MS = 8_000;

export function FeedProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const { keys, signer } = useAuth();
  const { nostr, cache, verifier } = useNostr();
  const { transportStore } = useTransport();
  const { followers, isBlocked } = useSocial();
  const { assistEvent, seedEvent } = useP2P();

  // Basic hooks first
  const [selfProfile, setSelfProfile] = useState<ProfileMetadata | undefined>(undefined);
  const isBlockedRef = useRef(isBlocked);
  const onEventAssistRef = useRef(assistEvent);
  const seedEventRef = useRef(seedEvent);
  const profilesRef = useRef<Record<string, ProfileMetadata>>({});
  const profileHydrationInflightRef = useRef<Set<string>>(new Set());
  const profileHydrationAttemptRef = useRef<Map<string, number>>(new Map());
  const mergeProfilesRef = useRef<((profiles: Record<string, ProfileMetadata>) => void) | null>(null);

  // Update refs in effects
  useEffect(() => { isBlockedRef.current = isBlocked; }, [isBlocked]);
  useEffect(() => { onEventAssistRef.current = assistEvent; }, [assistEvent]);
  useEffect(() => { seedEventRef.current = seedEvent; }, [seedEvent]);

  const onEventAssist = useCallback(async (event: NostrEvent) => {
    await onEventAssistRef.current(event);
    // Gap 3: seed relay-received events that have no bt tag, when opt-in is enabled
    if (settings.p2p.enabled && settings.p2p.seedRelayEvents) {
      const hasBtTag = event.tags.some((t) => t[0] === 'bt');
      if (!hasBtTag) {
        seedEventRef.current(event).catch(() => undefined);
      }
    }
  }, [settings.p2p.enabled, settings.p2p.seedRelayEvents]);

  const feedState = useFeedState({
    nostr,
    transportStore,
    settings,
    followers,
    relays: settings.relays,
    isBlocked: (pk) => isBlockedRef.current(pk),
    cache,
    onEventAssist,
    verifier
  });

  const { applySettings, setPaused: setPausedRaw, mergeProfiles: mergeProfilesRaw, findEventById: findEventByIdRaw } = feedState;

  // Sync the ref with latest profiles from state
  profilesRef.current = feedState.profiles;

  // Update the mergeProfiles ref whenever it changes
  useEffect(() => { mergeProfilesRef.current = mergeProfilesRaw; }, [mergeProfilesRaw]);

  // Stable ref to profiles — lets components read the latest without subscribing
  const profilesStableRef = useRef<Record<string, ProfileMetadata>>(feedState.profiles);
  profilesStableRef.current = feedState.profiles;

  // ProfileStore: enables per-pubkey subscriptions so PostCard only re-renders
  // when its own author's profile changes, not on every profile load.
  const profileStore = useMemo(() => new ProfileStore(), []);

  // Keep the ProfileStore in sync with the feed state profiles.
  // feedState.profiles only changes when a profile actually changed (mergeProfiles
  // does equality checking), so this effect fires minimally.
  useEffect(() => {
    profileStore.merge(feedState.profiles);
  }, [feedState.profiles, profileStore]);

  const authorService = useMemo(() => new AuthorService(nostr, transportStore, (pk) => isBlockedRef.current(pk), verifier), [nostr, transportStore, verifier]);
  const hashtagService = useMemo(() => new HashtagService(nostr, transportStore, (pk) => isBlockedRef.current(pk), verifier), [nostr, transportStore, verifier]);
  const threadService = useMemo(() => new ThreadService(nostr, transportStore, (pk) => isBlockedRef.current(pk), verifier), [nostr, transportStore, verifier]);
  const publishService = useMemo(() => new PublishService(nostr, signer), [nostr, signer]);
  const zapService = useMemo(() => new ZapService(signer), [signer]);
  const peopleListService = useMemo(() => new PeopleListService(nostr, signer), [nostr, signer]);

  useEffect(() => {
    if (!keys?.npub) {
      setSelfProfile(undefined);
      return;
    }
    feedState.orchestrator.ensureProfile(keys.npub, (p) => mergeProfilesRef.current?.(p));
  }, [keys, feedState.orchestrator]);

  useEffect(() => {
    const next = feedState.profiles[keys?.npub ?? ''];
    if (next) setSelfProfile(next);
  }, [feedState.profiles, keys]);

  // applySettings does a client-side re-filter of already-loaded events.
  // It should only fire when follows/followers/blocked/mute settings change while the feed
  // mode and list ID stay the same. When feedMode or selectedListId change,
  // subscribeFeed() already restarts the subscription and resets the cache, so
  // calling applySettings at the same time would cause a redundant intermediate
  // state (old events briefly filtered by new mode, then immediately cleared).
  const membershipKey = useMemo(() => {
    return [
      settings.follows.join(','),
      followers.join(','),
      settings.blocked.join(','),
      settings.mutedWords.join(','),
      settings.mutedHashtags.join(',')
    ].join('|');
  }, [settings.follows, followers, settings.blocked, settings.mutedWords, settings.mutedHashtags]);

  useEffect(() => {
    applySettings(settings);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membershipKey, applySettings]); // Only re-filter on membership changes, not mode/listId changes

  const publishPost = useCallback(async (input: PublishInput) => {
    const draft = await publishService.signNote(input);
    const p2p = await seedEventRef.current(draft).catch(() => undefined);
    const extraTags = p2p
      ? [['bt', p2p.bt, 'event'], ...(p2p.sha256 ? [['x', `sha256:${p2p.sha256}`, 'event']] : [])]
      : [];
    const event = extraTags.length > 0 ? await publishService.signNote(input, extraTags) : draft;
    await publishService.publishSigned(event);
    return event;
  }, [publishService]);

  const publishReply = useCallback(async (input: PublishInput, replyTo: NostrEvent) => {
    const replyInput = { ...input, replyTo };
    const draft = await publishService.signNote(replyInput);
    const p2p = await seedEventRef.current(draft).catch(() => undefined);
    const extraTags = p2p
      ? [['bt', p2p.bt, 'event'], ...(p2p.sha256 ? [['x', `sha256:${p2p.sha256}`, 'event']] : [])]
      : [];
    const event = extraTags.length > 0 ? await publishService.signNote(replyInput, extraTags) : draft;
    await publishService.publishSigned(event);
    return event;
  }, [publishService]);

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

  const shareEvent = useCallback(async (event: NostrEvent) => {
    const uri = encodeNeventUri({
      id: event.id,
      author: event.pubkey,
      relays: settings.relays.slice(0, 3)
    });
    await copyToClipboard(uri);
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
    await cache.setProfile(keys.npub, profile);
  }, [feedState, keys, nostr, cache, signer]);

  const hydrateProfiles = useCallback(async (pubkeys: string[]) => {
    const unique = Array.from(new Set(pubkeys.map((pk) => pk.trim()).filter(Boolean)));
    if (unique.length === 0) return;
    const now = Date.now();
    const missing = unique.filter((pk) => {
      if (profilesRef.current[pk]) return false;
      if (profileHydrationInflightRef.current.has(pk)) return false;
      const last = profileHydrationAttemptRef.current.get(pk) ?? 0;
      return now - last > PROFILE_HYDRATION_RETRY_MS;
    });
    if (missing.length === 0) return;
    missing.forEach((pk) => profileHydrationInflightRef.current.add(pk));
    missing.forEach((pk) => profileHydrationAttemptRef.current.set(pk, now));
    try {
      const fetched = await nostr.fetchProfiles(missing);
      mergeProfilesRef.current?.(fetched);
    } finally {
      missing.forEach((pubkey) => profileHydrationInflightRef.current.delete(pubkey));
    }
  }, [nostr]);

  const value: FeedContextValue = useMemo(() => ({
    events: feedState.events,
    profiles: feedState.profiles,
    feedLoading: feedState.feedLoading,
    pendingCount: feedState.pendingCount,
    selectedEvent: feedState.selectedEvent,
    selectedAuthor: feedState.selectedAuthor,
    selfProfile,
    paused: feedState.paused,
    setPaused: setPausedRaw,
    selectEvent: feedState.selectEvent,
    selectAuthor: feedState.selectAuthor,
    loadOlder: feedState.loadOlder,
    flushPending: feedState.flushPending,
    loadThread: (id: string) => threadService.loadThread(id),
    publishPost,
    publishReply,
    sendZap,
    publishRepost,
    publishReaction,
    shareEvent,
    publishProfile,
    searchEvents: (q: string) => nostr.searchEvents(q),
    fetchMentions: (pk: string, i: any) => nostr.fetchMentions(pk, i),
    subscribeMentions: (pk: string, onE: any, onC: any) => nostr.subscribeMentions(pk, onE, onC),
    fetchLists: (pk: string) => nostr.fetchLists(pk),
    publishPeopleList: async (i: any) => { await peopleListService.publish(i); },
    mergeProfiles: (p: any) => mergeProfilesRef.current?.(p),
    hydrateProfiles,
    authorService,
    hashtagService,
    findEventById: findEventByIdRaw,
    fetchEventById: (id: string) => nostr.fetchEventById(id)
  }), [
    feedState.events,
    feedState.profiles,
    feedState.feedLoading,
    feedState.pendingCount,
    feedState.selectedEvent,
    feedState.selectedAuthor,
    feedState.paused,
    feedState.setPaused,
    feedState.selectEvent,
    feedState.selectAuthor,
    feedState.loadOlder,
    feedState.flushPending,
    findEventByIdRaw,
    selfProfile,
    authorService,
    hashtagService,
    publishPost,
    publishReply,
    sendZap,
    publishRepost,
    publishReaction,
    shareEvent,
    publishProfile,
    nostr,
    peopleListService,
    hydrateProfiles
  ]);

  const actionsValue = useMemo<FeedActionsContextValue>(() => ({
    selectEvent: feedState.selectEvent,
    selectAuthor: feedState.selectAuthor,
    publishRepost,
    publishReaction,
    shareEvent,
    hydrateProfiles,
    findEventById: findEventByIdRaw
  }), [
    feedState.selectEvent,
    feedState.selectAuthor,
    publishRepost,
    publishReaction,
    shareEvent,
    hydrateProfiles,
    findEventByIdRaw
  ]);

  const feedControlValue = useMemo(
    () => ({ setPaused: setPausedRaw }),
    [setPausedRaw]
  );

  return (
    <FeedControlState.Provider value={feedControlValue}>
      <FeedActionsContext.Provider value={actionsValue}>
        <ProfileStoreContext.Provider value={profileStore}>
          <FeedProfilesRefContext.Provider value={profilesStableRef}>
            <FeedProfilesContext.Provider value={feedState.profiles}>
              <FeedContext.Provider value={value}>
                {children}
              </FeedContext.Provider>
            </FeedProfilesContext.Provider>
          </FeedProfilesRefContext.Provider>
        </ProfileStoreContext.Provider>
      </FeedActionsContext.Provider>
    </FeedControlState.Provider>
  );
}

export function useFeed() {
  const context = useContext(FeedContext);
  if (!context) throw new Error('useFeed must be used within a FeedProvider');
  return context;
}

/**
 * Subscribe to a single author's profile via the ProfileStore. The component
 * ONLY re-renders when that specific pubkey's profile changes — not when any
 * other profile loads. This eliminates cross-card flicker in the feed.
 */
export function useProfile(pubkey?: string) {
  const store = useContext(ProfileStoreContext);
  // Always call both hooks unconditionally (Rules of Hooks).
  // useAuthorProfile is a no-op (returns undefined and subscribes to nothing)
  // when store is null, so the legacyProfile path is used instead.
  const storeProfile = useAuthorProfile(store, pubkey);
  const legacyProfiles = useContext(FeedProfilesContext);
  const legacyProfile = useMemo(
    () => (pubkey ? legacyProfiles[pubkey] : undefined),
    [legacyProfiles, pubkey]
  );
  return store ? storeProfile : legacyProfile;
}

/**
 * Subscribe to the full profiles map. Re-renders on any profile change.
 * Use sparingly — prefer useProfile for per-card subscriptions.
 */
export function useProfiles() {
  const store = useContext(ProfileStoreContext);
  const storeProfiles = useAllProfiles(store);
  const legacyProfiles = useContext(FeedProfilesContext);
  return store ? storeProfiles : legacyProfiles;
}

/**
 * Returns a stable ref to the profiles map. Reading `.current[pubkey]` gives the
 * latest profile without subscribing to every profile update. Use this in components
 * that should NOT re-render when unrelated profiles load.
 */
export function useProfilesRef() {
  return useContext(FeedProfilesRefContext);
}

export function useFeedActions() {
  const context = useContext(FeedActionsContext);
  if (!context) throw new Error('useFeedActions must be used within a FeedProvider');
  return context;
}

export function useFeedControlState() {
  const context = useContext(FeedControlState);
  if (!context) throw new Error('FeedControlState provider missing');
  return context;
}
