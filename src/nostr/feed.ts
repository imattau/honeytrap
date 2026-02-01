import type { NostrEvent, ProfileMetadata, ListDescriptor } from './types';
import { NostrClient } from './client';
import type { TransportStore } from './transport';
import type { FeedOrchestratorApi, FeedServiceApi } from './contracts';
import type { NostrCache } from './cache';
import { AsyncEventVerifier, type EventVerifier } from './eventVerifier';

const MAX_EVENTS = 300;
const MAX_BUFFER = 400;

export class FeedOrchestrator implements FeedOrchestratorApi {
  private knownIds = new Set<string>();
  private pending: NostrEvent[] = [];
  private profiles: Record<string, ProfileMetadata> = {};
  private oldest?: number;
  private paused = false;
  private profileQueue = new Set<string>();
  private profileInflight = new Set<string>();
  private profileDrainTimer?: ReturnType<typeof setTimeout>;
  private maxProfileInflight = 2;
  private hydrated = false;
  private lastContext?: { follows: string[]; followers: string[]; feedMode: 'all' | 'follows' | 'followers' | 'both'; listId?: string; lists?: ListDescriptor[]; tags?: string[] };
  private cache?: NostrCache;
  private verifier: EventVerifier;
  private lastGetEvents?: () => NostrEvent[];
  private lastOnUpdate?: (events: NostrEvent[]) => void;
  private lastOnProfiles?: (profiles: Record<string, ProfileMetadata>) => void;
  private lastOnPending?: (count: number) => void;

  constructor(
    private nostr: NostrClient,
    private service: FeedServiceApi,
    private transport?: TransportStore,
    private isBlocked?: (pubkey: string) => boolean,
    private onEventAssist?: (event: NostrEvent) => void,
    cache?: NostrCache,
    verifier?: EventVerifier
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
      this.service.stop();
      return;
    }
    this.startLiveSubscription();
    if (wasPaused && !value) {
      this.resumeIfBuffered();
    }
  }

  reset() {
    this.knownIds.clear();
    this.pending = [];
    this.oldest = undefined;
    this.hydrated = false;
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
          if (authorSet && !authorSet.has(event.pubkey)) return false;
          if (normalizedTags.length > 0 && !matchesTag(event, normalizedTags)) return false;
          return true;
        });
        if (filtered.length === 0) return;
        filtered.forEach((event) => this.knownIds.add(event.id));
        const merged = this.mergeEvents(getEvents(), filtered);
        onUpdate(merged);
      })
      .catch(() => null);

    this.startLiveSubscription();
  }

  stop() {
    this.service.stop();
  }

  resumeIfBuffered() {
    if (!this.lastGetEvents || !this.lastOnUpdate) return;
    if (this.pending.length === 0) return;
    const merged = this.flush(this.lastGetEvents());
    this.lastOnUpdate(merged);
    this.lastOnPending?.(0);
  }

  flushPending(getEvents: () => NostrEvent[], onUpdate: (events: NostrEvent[]) => void) {
    if (this.pending.length === 0) return;
    const merged = this.flush(getEvents());
    onUpdate(merged);
    // pending count becomes zero after flush
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
    const unique = older.filter((event) => !this.knownIds.has(event.id) && !this.isBlocked?.(event.pubkey));
    if (unique.length === 0) return;
    unique.forEach((event) => this.knownIds.add(event.id));
    unique.forEach((event) => this.markTransport(event));
    const merged = this.mergeEvents(getEvents(), unique);
    onUpdate(merged);
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
    const run = () => {
      this.profileDrainTimer = undefined;
      if (this.profileInflight.size >= this.maxProfileInflight) {
        this.profileDrainTimer = globalThis.setTimeout(run, 400);
        return;
      }
      const next = this.profileQueue.values().next().value as string | undefined;
      if (!next) return;
      if (this.profiles[next] || this.profileInflight.has(next)) {
        this.profileQueue.delete(next);
        this.profileDrainTimer = globalThis.setTimeout(run, 120);
        return;
      }
      this.profileQueue.delete(next);
      this.profileInflight.add(next);
      this.nostr
        .fetchProfile(next)
        .then((profile) => {
          if (!profile) return;
          this.profiles = { ...this.profiles, [next]: profile };
          onProfiles(this.profiles);
        })
        .catch(() => null)
        .finally(() => {
          this.profileInflight.delete(next);
          this.profileDrainTimer = globalThis.setTimeout(run, 200);
        });
    };
    this.profileDrainTimer = globalThis.setTimeout(run, 120);
  }

  private startLiveSubscription() {
    if (this.paused) return;
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
    if (authorSet && !authorSet.has(event.pubkey)) return;
    if (normalizedTags.length > 0 && !matchesTag(event, normalizedTags)) return;
    if (this.knownIds.has(event.id)) return;
    this.knownIds.add(event.id);
    if (this.paused && this.hydrated) {
      this.pending.push(event);
      if (this.pending.length > MAX_BUFFER) {
        this.pending.length = MAX_BUFFER;
      }
      return;
    }
    this.markTransport(event);
    this.onEventAssist?.(event);
    this.pending.push(event);
    if (this.pending.length > MAX_BUFFER) {
      this.pending.length = MAX_BUFFER;
    }
    onPending?.(this.pending.length);
    this.profileQueue.add(event.pubkey);
    if (!this.hydrated) {
      const merged = this.flush(getEvents());
      onUpdate(merged);
      this.hydrated = true;
    } else if (!this.paused) {
      const merged = this.flush(getEvents());
      onUpdate(merged);
    }
    this.drainProfiles(onProfiles);
  }

  private flush(existing: NostrEvent[]): NostrEvent[] {
    if (this.pending.length === 0) return existing;
    const incoming = this.pending.splice(0, this.pending.length)
      .filter((event) => !this.isBlocked?.(event.pubkey));
    if (incoming.length > 0) {
      this.cache?.setEvents(incoming).catch(() => null);
    }
    const merged = this.mergeEvents(existing, incoming);
    this.cache?.setRecentEvents(merged.slice(0, 120)).catch(() => null);
    return merged;
  }

  private mergeEvents(existing: NostrEvent[], incoming: NostrEvent[]): NostrEvent[] {
    const deduped = new Map<string, NostrEvent>();
    [...incoming, ...existing].forEach((event) => {
      const key = eventIdentityKey(event);
      const current = deduped.get(key);
      if (!current) {
        deduped.set(key, event);
        return;
      }
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
