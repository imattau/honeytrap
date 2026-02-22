import type { NostrEvent, ProfileMetadata, ListDescriptor } from './types';
import { NostrClient } from './client';
import type { TransportStore } from './transport';
import type { FeedOrchestratorApi, FeedServiceApi } from './contracts';
import type { NostrCache } from './cache';
import { AsyncEventVerifier, type EventVerifier } from './eventVerifier';

const MAX_EVENTS = 1000;
const MAX_BUFFER = 1200;
const LIVE_FLUSH_INTERVAL_MS = 40;

export class FeedOrchestrator implements FeedOrchestratorApi {
  private knownIds = new Set<string>();
  private pending: NostrEvent[] = [];
  private profiles: Record<string, ProfileMetadata> = {};
  private oldest?: number;
  private paused = false;
  private profileQueue = new Set<string>();
  private profileInflight = new Set<string>();
  private profileDrainTimer?: ReturnType<typeof setTimeout>;
  private maxProfileInflight = 8;
  private hydrated = false;
  private lastContext?: { follows: string[]; followers: string[]; feedMode: 'all' | 'follows' | 'followers' | 'both'; listId?: string; lists?: ListDescriptor[]; tags?: string[] };
  private cache?: NostrCache;
  private verifier: EventVerifier;
  private lastGetEvents?: () => NostrEvent[];
  private lastOnUpdate?: (events: NostrEvent[]) => void;
  private lastOnProfiles?: (profiles: Record<string, ProfileMetadata>) => void;
  private lastOnPending?: (count: number) => void;
  private liveFlushTimer?: ReturnType<typeof setTimeout>;
  private liveSubscribed = false;

  constructor(
    private nostr: NostrClient,
    private service: FeedServiceApi,
    private transport?: TransportStore,
    private isBlocked?: (pubkey: string) => boolean,
    private onEventAssist?: (event: NostrEvent) => void,
    cache?: NostrCache,
    verifier?: EventVerifier,
    private isMuted?: (event: NostrEvent) => boolean
  ) {
    this.cache = cache;
    this.verifier = verifier ?? new AsyncEventVerifier();
  }

  getProfiles() {
    return this.profiles;
  }

  setPaused(value: boolean) {
    const wasPaused = this.paused;
    if (wasPaused === value) return;
    this.paused = value;
    if (value) {
      this.clearLiveFlushTimer();
      return;
    }
    if (!this.liveSubscribed) {
      this.startLiveSubscription();
    }
    if (wasPaused && !value) {
      this.resumeIfBuffered();
    }
  }

  reset() {
    this.knownIds.clear();
    this.pending = [];
    this.oldest = undefined;
    this.hydrated = false;
    this.clearLiveFlushTimer();
  }

  subscribe(
    {
      follows,
      followers,
      feedMode,
      listId,
      lists,
      tags
    }: { follows: string[]; followers: string[]; feedMode: 'all' | 'follows' | 'followers' | 'both'; listId?: string; lists?: ListDescriptor[]; tags?: string[] },
    getEvents: () => NostrEvent[],
    onUpdate: (events: NostrEvent[]) => void,
    onProfiles: (profiles: Record<string, ProfileMetadata>) => void,
    onPending?: (count: number) => void
  ) {
    this.hydrated = false;
    this.pending = [];
    this.knownIds.clear();
    this.oldest = undefined;
    this.clearLiveFlushTimer();
    this.lastContext = { follows, followers, feedMode, listId, lists, tags };
    this.lastGetEvents = getEvents;
    this.lastOnUpdate = onUpdate;
    this.lastOnProfiles = onProfiles;
    this.lastOnPending = onPending;
    const authors = resolveAuthors({ follows, followers, feedMode, listId, lists });
    const authorSet = authors && authors.length > 0 ? new Set(authors) : undefined;
    const normalizedTags = normalizeTags(tags);
    const requiresAuthorFilter = feedMode !== 'all' || Boolean(listId);
    if (requiresAuthorFilter && (!authors || authors.length === 0)) {
      onUpdate([]);
      onPending?.(0);
      return;
    }
    this.cache?.getRecentEvents()
      .then((cached) => {
        if (!cached || cached.length === 0) return;
        const filtered = cached.filter((event) => {
          if (this.isBlocked?.(event.pubkey)) return false;
          if (this.isMuted?.(event)) return false;
          if (authorSet && !authorSet.has(event.pubkey)) return false;
          if (normalizedTags.length > 0 && !matchesTag(event, normalizedTags)) return false;
          return true;
        });
        if (filtered.length === 0) return;
        filtered.forEach((event) => this.knownIds.add(event.id));
        const merged = this.mergeEvents(getEvents(), filtered);
        onUpdate(merged);
        this.queueProfilesForEvents(merged, onProfiles);
      })
      .catch(() => null);

    this.startLiveSubscription();
  }

  stop() {
    this.clearLiveFlushTimer();
    this.liveSubscribed = false;
    this.knownIds.clear();
    this.pending = [];
    this.oldest = undefined;
    this.hydrated = false;
    this.service.stop();
  }

  resumeIfBuffered() {
    if (!this.lastGetEvents || !this.lastOnUpdate) return;
    if (this.pending.length === 0) return;
    this.clearLiveFlushTimer();
    const merged = this.flush(this.lastGetEvents());
    this.lastOnUpdate(merged);
    this.lastOnPending?.(0);
    if (this.lastOnProfiles) {
      this.queueProfilesForEvents(merged, this.lastOnProfiles);
    }
  }

  flushPending(getEvents: () => NostrEvent[], onUpdate: (events: NostrEvent[]) => void) {
    if (this.pending.length === 0) return;
    this.clearLiveFlushTimer();
    const merged = this.flush(getEvents());
    onUpdate(merged);
    if (this.lastOnProfiles) {
      this.queueProfilesForEvents(merged, this.lastOnProfiles);
    }
  }

  async loadOlder(
    {
      follows,
      followers,
      feedMode,
      listId,
      lists,
      tags
    }: { follows: string[]; followers: string[]; feedMode: 'all' | 'follows' | 'followers' | 'both'; listId?: string; lists?: ListDescriptor[]; tags?: string[] },
    getEvents: () => NostrEvent[],
    onUpdate: (events: NostrEvent[]) => void
  ) {
    if (!this.oldest) return;
    const authors = resolveAuthors({ follows, followers, feedMode, listId, lists });
    const older = await this.nostr.fetchOlderTimeline({ until: this.oldest - 1, authors, tags, limit: 40 });
    const unique = older.filter(
      (event) => !this.knownIds.has(event.id) && !this.isBlocked?.(event.pubkey) && !this.isMuted?.(event)
    );
    if (unique.length === 0) return;
    unique.forEach((event) => this.knownIds.add(event.id));
    unique.forEach((event) => this.markTransport(event));
    const merged = this.mergeEvents(getEvents(), unique);
    onUpdate(merged);
    if (this.lastOnProfiles) {
      this.queueProfilesForEvents(merged, this.lastOnProfiles);
    }
    this.cache?.setEvents(unique).catch(() => null);
    this.cache?.setRecentEvents(merged.slice(0, 120)).catch(() => null);
  }

  ensureProfile(pubkey: string, onProfile: (profiles: Record<string, ProfileMetadata>) => void) {
    if (this.profiles[pubkey]) return;
    this.profileQueue.add(pubkey);
    this.drainProfiles(onProfile);
  }

  private drainProfiles(onProfiles: (profiles: Record<string, ProfileMetadata>) => void) {
    if (this.profileDrainTimer) return;
    // Do not start a new batch while one is already in-flight; the .finally()
    // callback will re-schedule as needed.  This prevents stacking multiple
    // concurrent querySync REQs on the relay (each querySync = one live REQ).
    if (this.profileInflight.size > 0) return;
    const run = () => {
      this.profileDrainTimer = undefined;
      if (this.profileInflight.size > 0) {
        // A batch is still running; it will call drainProfiles again on completion.
        return;
      }
      // Collect up to maxProfileInflight pubkeys as a single batch.
      const toFetch: string[] = [];
      for (const pubkey of this.profileQueue) {
        if (toFetch.length >= this.maxProfileInflight) break;
        if (this.profiles[pubkey] || this.profileInflight.has(pubkey)) {
          this.profileQueue.delete(pubkey);
          continue;
        }
        this.profileQueue.delete(pubkey);
        toFetch.push(pubkey);
      }
      if (toFetch.length === 0) return;
      toFetch.forEach((pubkey) => this.profileInflight.add(pubkey));
      // Issue a single batched relay request.  Do NOT schedule the next batch
      // here — wait until this one finishes so we never have two concurrent REQs
      // open just for profile fetching.
      this.nostr
        .fetchProfiles(toFetch)
        .then((fetched) => {
          let changed = false;
          for (const [pubkey, profile] of Object.entries(fetched)) {
            this.profiles = { ...this.profiles, [pubkey]: profile };
            this.cache?.setProfile(pubkey, profile).catch(() => null);
            changed = true;
          }
          if (changed) onProfiles(this.profiles);
          // Re-queue pubkeys the relay didn't return so they get retried.
          const missing = toFetch.filter((pk) => !fetched[pk]);
          if (missing.length > 0) {
            globalThis.setTimeout(() => {
              missing.forEach((pk) => {
                if (!this.profiles[pk]) this.profileQueue.add(pk);
              });
              if (this.lastOnProfiles) this.drainProfiles(this.lastOnProfiles);
            }, 5_000);
          }
        })
        .catch(() => null)
        .finally(() => {
          toFetch.forEach((pubkey) => this.profileInflight.delete(pubkey));
          // Schedule the next batch only after this one is complete.
          // Use lastOnProfiles so we always use the current callback, not a stale captured param.
          if (this.profileQueue.size > 0 && this.lastOnProfiles) {
            this.drainProfiles(this.lastOnProfiles);
          }
        });
    };
    this.profileDrainTimer = globalThis.setTimeout(run, 20);
  }

  private startLiveSubscription() {
    if (this.paused) return;
    if (this.liveSubscribed) return;
    if (!this.lastContext || !this.lastGetEvents || !this.lastOnUpdate || !this.lastOnProfiles) return;
    const { follows, followers, feedMode, listId, lists, tags } = this.lastContext;
    const getEvents = this.lastGetEvents;
    const onUpdate = this.lastOnUpdate;
    const onProfiles = this.lastOnProfiles;
    const onPending = this.lastOnPending;
    const authors = resolveAuthors({ follows, followers, feedMode, listId, lists });
    const authorSet = authors && authors.length > 0 ? new Set(authors) : undefined;
    const normalizedTags = normalizeTags(tags);
    const requiresAuthorFilter = feedMode !== 'all' || Boolean(listId);
    if (requiresAuthorFilter && (!authors || authors.length === 0)) {
      onUpdate([]);
      onPending?.(0);
      return;
    }
    this.service.subscribeTimeline({
      authors,
      tags,
      onEvent: (event) => this.handleIncomingEvent(event, authorSet, normalizedTags, getEvents, onUpdate, onProfiles, onPending)
    });
    this.liveSubscribed = true;
  }

  private handleIncomingEvent(
    event: NostrEvent,
    authorSet: Set<string> | undefined,
    normalizedTags: string[],
    getEvents: () => NostrEvent[],
    onUpdate: (events: NostrEvent[]) => void,
    onProfiles: (profiles: Record<string, ProfileMetadata>) => void,
    onPending?: (count: number) => void
  ) {
    if (this.isBlocked?.(event.pubkey)) return;
    if (this.isMuted?.(event)) return;
    if (authorSet && !authorSet.has(event.pubkey)) return;
    if (normalizedTags.length > 0 && !matchesTag(event, normalizedTags)) return;
    if (this.knownIds.has(event.id)) return;
    this.knownIds.add(event.id);
    // Always queue the profile so names load even for events buffered while paused.
    if (!this.profiles[event.pubkey] && !this.profileInflight.has(event.pubkey)) {
      this.profileQueue.add(event.pubkey);
    }
    if (this.paused && this.hydrated) {
      this.pending.push(event);
      if (this.pending.length > MAX_BUFFER) {
        this.pending.splice(0, this.pending.length - MAX_BUFFER);
      }
      this.drainProfiles(onProfiles);
      return;
    }
    this.markTransport(event);
    this.onEventAssist?.(event);
    this.pending.push(event);
    if (this.pending.length > MAX_BUFFER) {
      this.pending.splice(0, this.pending.length - MAX_BUFFER);
    }
    onPending?.(this.pending.length);
    this.profileQueue.add(event.pubkey);
    // After the initial load is hydrated, stop auto-flushing new live events
    // into the displayed list. They accumulate in pending until the user
    // explicitly pulls to refresh (flushPending). This prevents non-stop
    // re-sorting and layout thrash while the user is reading.
    if (!this.hydrated) {
      this.scheduleLiveFlush(getEvents, onUpdate, onPending);
    }
    this.drainProfiles(onProfiles);
  }

  private scheduleLiveFlush(
    getEvents: () => NostrEvent[],
    onUpdate: (events: NostrEvent[]) => void,
    onPending?: (count: number) => void
  ) {
    if (this.paused) return;
    if (this.liveFlushTimer) return;
    const delay = this.hydrated ? LIVE_FLUSH_INTERVAL_MS : 0;
    this.liveFlushTimer = globalThis.setTimeout(() => {
      this.liveFlushTimer = undefined;
      if (this.paused || this.pending.length === 0) return;
      const merged = this.flush(getEvents());
      onUpdate(merged);
      onPending?.(0);
      this.hydrated = true;
    }, delay);
  }

  private clearLiveFlushTimer() {
    if (!this.liveFlushTimer) return;
    globalThis.clearTimeout(this.liveFlushTimer);
    this.liveFlushTimer = undefined;
  }

  private flush(existing: NostrEvent[]): NostrEvent[] {
    if (this.pending.length === 0) return existing;
    const incoming = this.pending.splice(0, this.pending.length)
      .filter((event) => !this.isBlocked?.(event.pubkey) && !this.isMuted?.(event));
    if (incoming.length > 0) {
      this.cache?.setEvents(incoming).catch(() => null);
    }
    const merged = this.mergeEvents(existing, incoming);
    this.cache?.setRecentEvents(merged.slice(0, 120)).catch(() => null);
    return merged;
  }

  private mergeEvents(existing: NostrEvent[], incoming: NostrEvent[]): NostrEvent[] {
    const deduped = new Map<string, NostrEvent>();
    
    // First, add existing events to the map
    existing.forEach((event) => {
      const key = eventIdentityKey(event);
      deduped.set(key, event);
    });

    // Then, merge incoming events, only replacing if they are truly "better" 
    // or if we don't have them yet.
    incoming.forEach((event) => {
      const key = eventIdentityKey(event);
      const current = deduped.get(key);
      if (!current) {
        deduped.set(key, event);
        return;
      }
      // If we have it, only replace if the incoming one is newer.
      // If they have the same created_at and ID, KEEP the existing object reference.
      if (event.created_at > current.created_at) {
        deduped.set(key, event);
        return;
      }
      if (event.created_at === current.created_at && event.id > current.id) {
        deduped.set(key, event);
      }
    });

    const merged = Array.from(deduped.values())
      .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id))
      .slice(0, MAX_EVENTS);
    this.oldest = merged[merged.length - 1]?.created_at ?? this.oldest;
    return merged;
  }

  private queueProfilesForEvents(events: NostrEvent[], onProfiles: (profiles: Record<string, ProfileMetadata>) => void) {
    let queued = false;
    events.forEach((event) => {
      if (this.profiles[event.pubkey] || this.profileInflight.has(event.pubkey) || this.profileQueue.has(event.pubkey)) return;
      this.profileQueue.add(event.pubkey);
      queued = true;
    });
    if (queued) this.drainProfiles(onProfiles);
  }

  private markTransport(event: NostrEvent) {
    this.transport?.mark(event.id, { relay: true });
    this.verifier.verify(event, (id, verified) => {
      this.transport?.mark(id, { verified });
    });
  }
}

function resolveAuthors({
  follows,
  followers,
  feedMode,
  listId,
  lists
}: {
  follows: string[];
  followers: string[];
  feedMode: 'all' | 'follows' | 'followers' | 'both';
  listId?: string;
  lists?: ListDescriptor[];
}): string[] | undefined {
  if (listId) return lists?.find((list) => list.id === listId)?.pubkeys;
  if (feedMode === 'followers') return followers;
  if (feedMode === 'follows') return follows;
  if (feedMode === 'both') return Array.from(new Set([...follows, ...followers]));
  return undefined;
}

function normalizeTags(tags?: string[]) {
  return (tags ?? [])
    .map((tag) => tag.trim().replace(/^#/, '').toLowerCase())
    .filter(Boolean);
}

function matchesTag(event: NostrEvent, tags: string[]) {
  if (tags.length === 0) return true;
  const tagSet = new Set(tags);
  return event.tags.some((tag) => tag[0] === 't' && tag[1] && tagSet.has(tag[1].toLowerCase()));
}

function eventIdentityKey(event: NostrEvent) {
  if (isAddressableKind(event.kind)) {
    const d = event.tags.find((tag) => tag[0] === 'd' && tag[1])?.[1];
    if (d) return `a:${event.kind}:${event.pubkey}:${d}`;
  }
  return `id:${event.id}`;
}

function isAddressableKind(kind: number) {
  return kind >= 30000 && kind < 40000;
}
