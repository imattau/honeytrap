import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NostrEvent, ProfileMetadata } from '../../nostr/types';
import type { AppSettings } from '../../storage/types';
import type { NostrClient } from '../../nostr/client';
import { FeedService } from '../../nostr/service';
import { FeedOrchestrator } from '../../nostr/feed';
import type { TransportStore } from '../../nostr/transport';
import { SocialGraph } from '../../nostr/social';

export function useFeedState({
  nostr,
  transportStore,
  settings,
  followers,
  isBlocked
}: {
  nostr: NostrClient;
  transportStore: TransportStore;
  settings: AppSettings;
  followers: string[];
  isBlocked: (pubkey: string) => boolean;
}) {
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileMetadata>>({});
  const [feedLoading, setFeedLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<NostrEvent | undefined>(undefined);
  const [selectedAuthor, setSelectedAuthor] = useState<string | undefined>(undefined);
  const [paused, setPaused] = useState(true);

  const feedService = useMemo(() => new FeedService(nostr), [nostr]);
  const orchestrator = useMemo(
    () => new FeedOrchestrator(nostr, feedService, transportStore, isBlocked),
    [nostr, feedService, transportStore, isBlocked]
  );

  const eventsRef = useRef<NostrEvent[]>([]);
  const feedLoadingRef = useRef(false);

  const setFeedLoadingSafe = useCallback((value: boolean) => {
    feedLoadingRef.current = value;
    setFeedLoading(value);
  }, []);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const subscribeFeed = useCallback(() => {
    eventsRef.current = [];
    setEvents([]);
    setPendingCount(0);
    setFeedLoadingSafe(true);
    orchestrator.subscribe(
      { follows: settings.follows, followers, feedMode: settings.feedMode, listId: settings.selectedListId },
      () => eventsRef.current,
      (next) => {
        setEvents(next);
        if (feedLoadingRef.current) setFeedLoadingSafe(false);
      },
      setProfiles,
      setPendingCount
    );
  }, [orchestrator, settings.follows, settings.selectedListId, settings.feedMode, followers, setFeedLoadingSafe]);

  useEffect(() => {
    orchestrator.stop();
    subscribeFeed();
    return () => orchestrator.stop();
  }, [subscribeFeed, orchestrator]);

  const loadOlder = useCallback(async () => {
    setFeedLoadingSafe(true);
    try {
      await orchestrator.loadOlder(
        { follows: settings.follows, followers, feedMode: settings.feedMode, listId: settings.selectedListId },
        () => eventsRef.current,
        setEvents
      );
    } finally {
      setFeedLoadingSafe(false);
    }
  }, [orchestrator, settings.follows, settings.selectedListId, settings.feedMode, followers, setFeedLoadingSafe]);

  const flushPending = () => {
    const apply = (next: NostrEvent[]) => {
      eventsRef.current = next;
      setEvents(next);
    };
    orchestrator.flushPending(() => eventsRef.current, apply);
    setPendingCount(0);
  };

  const selectEvent = (event?: NostrEvent) => {
    setSelectedEvent(event);
    if (event) setSelectedAuthor(event.pubkey);
    if (event) orchestrator.ensureProfile(event.pubkey, setProfiles);
  };

  const selectAuthor = (pubkey?: string) => {
    setSelectedAuthor(pubkey);
    if (pubkey) orchestrator.ensureProfile(pubkey, setProfiles);
  };

  const applySettings = (next: AppSettings) => {
    const graph = new SocialGraph(next);
    setEvents((prev) => graph.filterEvents(prev));
  };

  useEffect(() => {
    orchestrator.setPaused(paused);
  }, [paused, orchestrator]);

  const findEventById = useCallback(
    (id: string) => events.find((event) => event.id === id),
    [events]
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
    selectEvent,
    selectAuthor,
    loadOlder,
    flushPending,
    applySettings,
    findEventById,
    orchestrator
  };
}
