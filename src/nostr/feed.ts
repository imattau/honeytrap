import type { NostrEvent, ProfileMetadata, ListDescriptor } from './types';
import { NostrClient } from './client';
import { FeedService } from './service';
import { verifyEvent } from 'nostr-tools';
import type { TransportStore } from './transport';
import type { FeedOrchestratorApi } from './contracts';

const MAX_EVENTS = 300;
const MAX_BUFFER = 400;

export class FeedOrchestrator implements FeedOrchestratorApi {
  private knownIds = new Set<string>();
  private pending: NostrEvent[] = [];
  private profiles: Record<string, ProfileMetadata> = {};
  private oldest?: number;
  private paused = false;
  private pausedByBuffer = false;
  private profileQueue = new Set<string>();
  private profileInflight = new Set<string>();
  private profileDrainTimer?: number;
  private maxProfileInflight = 2;
  private hydrated = false;
  private lastContext?: { follows: string[]; listId?: string; lists?: ListDescriptor[] };
  private lastGetEvents?: () => NostrEvent[];
  private lastOnUpdate?: (events: NostrEvent[]) => void;
  private lastOnProfiles?: (profiles: Record<string, ProfileMetadata>) => void;

  constructor(
    private nostr: NostrClient,
    private service: FeedService,
    private transport?: TransportStore,
    private isBlocked?: (pubkey: string) => boolean
  ) {}

  getProfiles() {
    return this.profiles;
  }

  setPaused(value: boolean) {
    this.paused = value;
  }

  subscribe(
    {
      follows,
      followers,
      feedMode,
      listId,
      lists
    }: { follows: string[]; followers: string[]; feedMode: 'all' | 'follows' | 'followers' | 'both'; listId?: string; lists?: ListDescriptor[] },
    getEvents: () => NostrEvent[],
    onUpdate: (events: NostrEvent[]) => void,
    onProfiles: (profiles: Record<string, ProfileMetadata>) => void
  ) {
    this.hydrated = false;
    this.pending = [];
    this.lastContext = { follows, followers, feedMode, listId, lists };
    this.lastGetEvents = getEvents;
    this.lastOnUpdate = onUpdate;
    this.lastOnProfiles = onProfiles;
    this.service.subscribeTimeline({
      authors: resolveAuthors({ follows, followers, feedMode, listId, lists }),
      onEvent: (event) => {
        if (this.isBlocked?.(event.pubkey)) return;
        if (this.knownIds.has(event.id)) return;
        this.knownIds.add(event.id);
        this.transport?.mark(event.id, { relay: true, verified: verifyEvent(event as any) });
        this.pending.push(event);
        if (this.pending.length > MAX_BUFFER) {
          this.pending.length = MAX_BUFFER;
          if (!this.pausedByBuffer) {
            this.pausedByBuffer = true;
            this.service.stop();
          }
        }
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
    });
  }

  stop() {
    this.service.stop();
  }

  resumeIfBuffered() {
    if (!this.pausedByBuffer) return;
    if (!this.lastContext || !this.lastGetEvents || !this.lastOnUpdate || !this.lastOnProfiles) return;
    this.pausedByBuffer = false;
    this.subscribe(this.lastContext, this.lastGetEvents, this.lastOnUpdate, this.lastOnProfiles);
  }

  flushPending(getEvents: () => NostrEvent[], onUpdate: (events: NostrEvent[]) => void) {
    if (this.pending.length === 0) return;
    const merged = this.flush(getEvents());
    onUpdate(merged);
    this.resumeIfBuffered();
  }

  async loadOlder(
    {
      follows,
      followers,
      feedMode,
      listId,
      lists
    }: { follows: string[]; followers: string[]; feedMode: 'all' | 'follows' | 'followers' | 'both'; listId?: string; lists?: ListDescriptor[] },
    getEvents: () => NostrEvent[],
    onUpdate: (events: NostrEvent[]) => void
  ) {
    if (this.pausedByBuffer || !this.oldest) return;
    const authors = resolveAuthors({ follows, followers, feedMode, listId, lists });
    const older = await this.nostr.fetchOlderTimeline({ until: this.oldest - 1, authors, limit: 40 });
    const unique = older.filter((event) => !this.knownIds.has(event.id) && !this.isBlocked?.(event.pubkey));
    if (unique.length === 0) return;
    unique.forEach((event) => this.knownIds.add(event.id));
    unique.forEach((event) => this.transport?.mark(event.id, { relay: true, verified: verifyEvent(event as any) }));
    const merged = this.mergeEvents(getEvents(), unique);
    onUpdate(merged);
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
        this.profileDrainTimer = window.setTimeout(run, 400);
        return;
      }
      const next = this.profileQueue.values().next().value as string | undefined;
      if (!next) return;
      if (this.profiles[next] || this.profileInflight.has(next)) {
        this.profileQueue.delete(next);
        this.profileDrainTimer = window.setTimeout(run, 120);
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
          this.profileDrainTimer = window.setTimeout(run, 200);
        });
    };
    this.profileDrainTimer = window.setTimeout(run, 120);
  }

  private flush(existing: NostrEvent[]): NostrEvent[] {
    if (this.pending.length === 0) return existing;
    const incoming = this.pending.splice(0, this.pending.length)
      .filter((event) => !this.isBlocked?.(event.pubkey));
    return this.mergeEvents(existing, incoming);
  }

  private mergeEvents(existing: NostrEvent[], incoming: NostrEvent[]): NostrEvent[] {
    const merged = [...incoming, ...existing];
    merged.sort((a, b) => b.created_at - a.created_at);
    this.oldest = merged[merged.length - 1]?.created_at ?? this.oldest;
    return merged.slice(0, MAX_EVENTS);
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
