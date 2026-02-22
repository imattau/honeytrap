import type { NostrEvent, ProfileMetadata } from './types';
import { NostrClient } from './client';
import { FeedOrchestrator } from './feed';
import { FeedService } from './service';
import type { TransportStore } from './transport';
import type { EventVerifier } from './eventVerifier';

const INITIAL_TAGGED_LIMIT = 120;
const INITIAL_FALLBACK_LIMIT = 180;
const OLDER_LIMIT = 40;
const OLDER_FALLBACK_LIMIT = 120;

export class HashtagService {
  private feedService: FeedService;
  private orchestrator: FeedOrchestrator;

  constructor(
    private client: NostrClient,
    transport?: TransportStore,
    private isBlocked?: (pubkey: string) => boolean,
    verifier?: EventVerifier
  ) {
    this.feedService = new FeedService(client);
    this.orchestrator = new FeedOrchestrator(client, this.feedService, transport, this.isBlocked, undefined, undefined, verifier);
  }

  subscribeHashtagFeed(
    tag: string,
    getEvents: () => NostrEvent[],
    onUpdate: (events: NostrEvent[]) => void,
    onProfiles: (profiles: Record<string, ProfileMetadata>) => void
  ) {
    const normalized = normalizeTag(tag);
    this.orchestrator.subscribe(
      { follows: [], followers: [], feedMode: 'all', tags: [normalized] },
      getEvents,
      onUpdate,
      onProfiles
    );
  }

  async primeHashtagFeed(
    tag: string,
    getEvents: () => NostrEvent[],
    onUpdate: (events: NostrEvent[]) => void,
    onProfiles: (profiles: Record<string, ProfileMetadata>) => void
  ) {
    const normalized = normalizeTag(tag);
    if (!normalized) return;
    const untilNow = Math.floor(Date.now() / 1000);
    const tagged = await this.client.fetchOlderTimeline({
      until: untilNow,
      tags: [normalized],
      limit: INITIAL_TAGGED_LIMIT
    }).catch(() => [] as NostrEvent[]);
    let fallback: NostrEvent[] = [];
    if (tagged.length < 12) {
      const broad = await this.client.fetchOlderTimeline({
        until: untilNow,
        limit: INITIAL_FALLBACK_LIMIT
      }).catch(() => [] as NostrEvent[]);
      fallback = broad.filter((event) => matchesHashtagEvent(event, normalized));
    }
    const merged = mergeHashtagEvents(getEvents(), [...tagged, ...fallback], normalized, this.isBlocked);
    if (merged.length > 0) {
      onUpdate(merged);
      await this.hydrateProfiles(merged, onProfiles);
    }
  }

  async loadOlder(
    tag: string,
    getEvents: () => NostrEvent[],
    onUpdate: (events: NostrEvent[]) => void,
    onProfiles?: (profiles: Record<string, ProfileMetadata>) => void
  ) {
    const normalized = normalizeTag(tag);
    const beforeCount = getEvents().length;
    await this.orchestrator.loadOlder(
      { follows: [], followers: [], feedMode: 'all', tags: [normalized] },
      getEvents,
      onUpdate
    );
    const current = getEvents();
    if (current.length > beforeCount) return;
    const until = Math.max((current[current.length - 1]?.created_at ?? Math.floor(Date.now() / 1000)) - 1, 1);
    const taggedOlder = await this.client.fetchOlderTimeline({
      until,
      tags: [normalized],
      limit: OLDER_LIMIT
    }).catch(() => [] as NostrEvent[]);
    let fallbackOlder: NostrEvent[] = [];
    if (taggedOlder.length < 6) {
      const broadOlder = await this.client.fetchOlderTimeline({
        until,
        limit: OLDER_FALLBACK_LIMIT
      }).catch(() => [] as NostrEvent[]);
      fallbackOlder = broadOlder.filter((event) => matchesHashtagEvent(event, normalized));
    }
    const older = [...taggedOlder, ...fallbackOlder];
    if (older.length === 0) return;
    const merged = mergeHashtagEvents(current, older, normalized, this.isBlocked);
    if (merged.length === current.length) return;
    onUpdate(merged);
    if (onProfiles) {
      await this.hydrateProfiles(merged, onProfiles);
    }
  }

  stop() {
    this.orchestrator.stop();
  }

  private async hydrateProfiles(
    events: NostrEvent[],
    onProfiles: (profiles: Record<string, ProfileMetadata>) => void
  ) {
    const pubkeys = Array.from(new Set(events.map((event) => event.pubkey).filter(Boolean)));
    if (pubkeys.length === 0) return;
    const profiles = await this.client.fetchProfiles(pubkeys).catch(() => ({} as Record<string, ProfileMetadata>));
    if (Object.keys(profiles).length > 0) onProfiles(profiles);
  }
}

function normalizeTag(tag: string) {
  return tag.trim().replace(/^#/, '').toLowerCase();
}

export function matchesHashtagEvent(event: NostrEvent, normalizedTag: string) {
  if (!normalizedTag) return false;
  const hasTag = event.tags.some((tag) => tag[0] === 't' && tag[1]?.toLowerCase() === normalizedTag);
  if (hasTag) return true;
  const tagRegex = new RegExp(`(^|[^a-z0-9_])#${escapeRegExp(normalizedTag)}(?![a-z0-9_])`, 'i');
  return tagRegex.test(event.content);
}

export function mergeHashtagEvents(
  existing: NostrEvent[],
  incoming: NostrEvent[],
  normalizedTag: string,
  isBlocked?: (pubkey: string) => boolean
) {
  const deduped = new Map<string, NostrEvent>();
  existing.forEach((event) => {
    deduped.set(eventIdentityKey(event), event);
  });
  incoming.forEach((event) => {
    if (isBlocked?.(event.pubkey)) return;
    if (!matchesHashtagEvent(event, normalizedTag)) return;
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
  return Array.from(deduped.values())
    .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id));
}

function eventIdentityKey(event: NostrEvent) {
  if (event.kind >= 30000 && event.kind < 40000) {
    const d = event.tags.find((tag) => tag[0] === 'd' && tag[1])?.[1];
    if (d) return `a:${event.kind}:${event.pubkey}:${d}`;
  }
  return `id:${event.id}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
