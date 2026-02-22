import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NostrEvent, ProfileMetadata } from '../../nostr/types';
import type { AppSettings } from '../../storage/types';
import type { NostrClient } from '../../nostr/client';
import { FeedOrchestrator } from '../../nostr/feed';
import type { TransportStore } from '../../nostr/transport';
import { SocialGraph, createMutedMatcher } from '../../nostr/social';
import type { NostrCache } from '../../nostr/cache';
import type { EventVerifier } from '../../nostr/eventVerifier';
import { FeedTimelineCache } from '../../nostr/feedTimelineCache';
import { WorkerFeedService } from '../../nostr/workerFeedService';

export function useFeedState({
  nostr,
  transportStore,
  settings,
  followers,
  relays,
  isBlocked,
  cache,
  onEventAssist,
  verifier
}: {
  nostr: NostrClient;
  transportStore: TransportStore;
  settings: AppSettings;
  followers: string[];
  relays: string[];
  isBlocked: (pubkey: string) => boolean;
  cache?: NostrCache;
  onEventAssist?: (event: NostrEvent) => void;
  verifier?: EventVerifier;
}) {
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileMetadata>>({});
  const [feedLoading, setFeedLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<NostrEvent | undefined>(undefined);
  const [selectedAuthor, setSelectedAuthor] = useState<string | undefined>(undefined);
  const [paused, setPaused] = useState(true);

  const feedService = useMemo(() => new WorkerFeedService(nostr), [nostr]);
  const timelineCache = useMemo(() => new FeedTimelineCache(), []);
  
  // Use refs for functions that might change due to unrelated settings updates
  const onEventAssistRef = useRef(onEventAssist);
  const isBlockedRef = useRef(isBlocked);
  const isMuted = useMemo(
    () => createMutedMatcher(settings),
    [settings.mutedWords, settings.mutedHashtags]
  );
  const isMutedRef = useRef(isMuted);
  useEffect(() => {
    onEventAssistRef.current = onEventAssist;
    isBlockedRef.current = isBlocked;
    isMutedRef.current = isMuted;
  }, [onEventAssist, isBlocked, isMuted]);

  const orchestrator = useMemo(
    () => new FeedOrchestrator(
      nostr, 
      feedService, 
      transportStore, 
      (pk) => isBlockedRef.current(pk), 
      (ev) => onEventAssistRef.current?.(ev), 
      cache, 
      verifier,
      (ev) => isMutedRef.current(ev)
    ),
    [nostr, feedService, transportStore, cache, verifier]
  );

  const eventsRef = useRef<NostrEvent[]>([]);
  const feedLoadingRef = useRef(false);
  const replaceOnNextUpdateRef = useRef(false);
  const pendingCountRef = useRef(0);
  const pendingTimerRef = useRef<number | null>(null);

  const setFeedLoadingSafe = useCallback((value: boolean) => {
    feedLoadingRef.current = value;
    setFeedLoading(value);
  }, []);

  useEffect(() => {
    feedService.setRelays(relays);
  }, [feedService, relays]);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    const unsubscribe = timelineCache.subscribe(() => {
      const next = timelineCache.snapshot();
      eventsRef.current = next;
      setEvents(next);
    });
    return () => unsubscribe();
  }, [timelineCache]);

  useEffect(() => {
    return () => {
      if (pendingTimerRef.current) {
        window.clearTimeout(pendingTimerRef.current);
      }
    };
  }, []);

  const setPendingCountBatched = useCallback((next: number) => {
    pendingCountRef.current = next;
    if (pendingTimerRef.current) return;
    pendingTimerRef.current = window.setTimeout(() => {
      pendingTimerRef.current = null;
      setPendingCount(pendingCountRef.current);
    }, 120);
  }, []);

  const mergeProfiles = useCallback((incoming: Record<string, ProfileMetadata>) => {
    const entries = Object.entries(incoming);
    if (entries.length === 0) return;
    setProfiles((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [pubkey, profile] of entries) {
        if (!profile) continue;
        const current = prev[pubkey];
        if (current && profilesEqual(current, profile)) continue;
        next[pubkey] = profile;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, []);

  const relayKey = useMemo(() => relays.join(','), [relays]);
  const followKey = useMemo(() => settings.follows.join(','), [settings.follows]);
  const followerKey = useMemo(() => followers.join(','), [followers]);

  const subscribeFeed = useCallback(() => {
    timelineCache.reset();
    eventsRef.current = [];
    pendingCountRef.current = 0;
    setPendingCount(0);
    setFeedLoadingSafe(true);
    replaceOnNextUpdateRef.current = true;
    orchestrator.subscribe(
      { follows: settings.follows, followers, feedMode: settings.feedMode, listId: settings.selectedListId },
      () => eventsRef.current,
      (next) => {
        if (replaceOnNextUpdateRef.current) replaceOnNextUpdateRef.current = false;
        timelineCache.set(next);
        if (feedLoadingRef.current) setFeedLoadingSafe(false);
      },
      mergeProfiles,
      setPendingCountBatched
    );
  }, [orchestrator, settings.selectedListId, settings.feedMode, setFeedLoadingSafe, mergeProfiles, setPendingCountBatched, timelineCache, relayKey, followKey, followerKey]);

  useEffect(() => {
    orchestrator.stop();
    subscribeFeed();
    return () => orchestrator.stop();
  }, [subscribeFeed, orchestrator]);

  useEffect(() => {
    return () => {
      feedService.destroy();
    };
  }, [feedService]);

  const loadOlder = useCallback(async () => {
    setFeedLoadingSafe(true);
    try {
      await orchestrator.loadOlder(
        { follows: settings.follows, followers, feedMode: settings.feedMode, listId: settings.selectedListId },
        () => eventsRef.current,
        (next) => timelineCache.set(next)
      );
    } finally {
      setFeedLoadingSafe(false);
    }
  }, [orchestrator, settings.selectedListId, settings.feedMode, setFeedLoadingSafe, timelineCache, relayKey, followKey, followerKey]);

  const flushPending = useCallback(() => {
    orchestrator.flushPending(() => eventsRef.current, (next) => timelineCache.set(next));
    pendingCountRef.current = 0;
    if (pendingTimerRef.current) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    setPendingCount(0);
  }, [orchestrator, timelineCache]);

  const selectEvent = useCallback((event?: NostrEvent) => {
    setSelectedEvent(event);
    if (event) {
      setSelectedAuthor(event.pubkey);
      orchestrator.ensureProfile(event.pubkey, mergeProfiles);
    }
  }, [orchestrator, mergeProfiles]);

  const selectAuthor = useCallback((pubkey?: string) => {
    setSelectedAuthor(pubkey);
    if (pubkey) orchestrator.ensureProfile(pubkey, mergeProfiles);
  }, [orchestrator, mergeProfiles]);

  const applySettings = useCallback((next: AppSettings) => {
    const graph = new SocialGraph(next);
    const base = graph.filterEvents(eventsRef.current);
    timelineCache.set(filterByFeedMode(base, next, followers));
  }, [followerKey, timelineCache]);

  useEffect(() => {
    orchestrator.setPaused(paused);
  }, [paused, orchestrator]);

  const findEventById = useCallback(
    (id: string) => eventsRef.current.find((event) => event.id === id),
    []
  );

  return {
    events,
    profiles,
    feedLoading,
    pendingCount,
    selectedEvent,
    selectedAuthor,
    paused,
    setPaused,
    setProfiles,
    mergeProfiles,
    selectEvent,
    selectAuthor,
    loadOlder,
    flushPending,
    applySettings,
    findEventById,
    orchestrator
  };
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

function filterByFeedMode(events: NostrEvent[], settings: AppSettings, followers: string[]): NostrEvent[] {
  if (settings.feedMode === 'all') return events;
  const followsSet = new Set(settings.follows);
  const followersSet = new Set(followers);
  if (settings.feedMode === 'follows') {
    return events.filter((event) => followsSet.has(event.pubkey));
  }
  if (settings.feedMode === 'followers') {
    return events.filter((event) => followersSet.has(event.pubkey));
  }
  const both = new Set<string>([...settings.follows, ...followers]);
  return events.filter((event) => both.has(event.pubkey));
}
