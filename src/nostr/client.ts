import { finalizeEvent, getPublicKey, nip19 } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import type { Filter } from 'nostr-tools';
import pLimit from 'p-limit';
import type { ListDescriptor, NostrEvent, ProfileMetadata, TrackItem } from './types';
import { getAllTagValues, getTagValue } from './utils';
import type { NostrClientApi } from './contracts';
import type { NostrCache } from './cache';
import { normalizeRelayUrl } from './relayUrl';

// Maximum number of concurrent querySync calls (each opens a live REQ on the
// relay).  Nostr relays typically enforce 10-20 simultaneous subscriptions per
// connection; the feed subscription itself is always open, so leave generous
// headroom by capping ad-hoc queries at 8 concurrent REQs.
const MAX_CONCURRENT_QUERIES = 8;

export class NostrClient implements NostrClientApi {
  private pool = new SimplePool({ enablePing: true, enableReconnect: true });
  private relays: string[] = [];
  private relaySet = new Set<string>();
  private cache?: NostrCache;
  private queryLimit = pLimit(MAX_CONCURRENT_QUERIES);

  setRelays(relays: string[]) {
    const next = Array.from(new Set(relays.map(normalizeRelayUrl).filter(Boolean))) as string[];
    const nextSet = new Set(next);
    const removed = Array.from(this.relaySet).filter((url) => !nextSet.has(url));
    const added = next.filter((url) => !this.relaySet.has(url));
    this.relays = next;
    this.relaySet = nextSet;
    if (removed.length > 0) {
      this.pool.close(removed);
    }
    if (added.length > 0) {
      added.forEach((url) => {
        this.pool.ensureRelay(url, { connectionTimeout: 4000 }).catch(() => null);
      });
    }
  }

  setCache(cache?: NostrCache) {
    this.cache = cache;
  }

  getRelayStatus(): Map<string, boolean> {
    return this.pool.listConnectionStatus();
  }

  async subscribe(
    filters: Filter[],
    onEvent: (event: NostrEvent) => void,
    onClose?: (reasons: string[]) => void
  ) {
    const sub = this.pool.subscribe(this.relays, filters[0], {
      onevent: (event: NostrEvent) => onEvent(event),
      onclose: (reasons: string[]) => onClose?.(reasons)
    });
    return () => sub.close('manual');
  }

  async fetchProfile(pubkey: string): Promise<ProfileMetadata | undefined> {
    const result = await this.fetchProfiles([pubkey]);
    return result[pubkey];
  }

  async searchProfiles(query: string, limit = 40): Promise<Record<string, ProfileMetadata>> {
    const trimmed = query.trim();
    if (!trimmed) return {};
    const normalized = trimmed.toLowerCase();
    const filter = { kinds: [0], limit } as Filter & { search?: string };
    filter.search = trimmed;
    let events = await this.safeQuerySync(filter);
    if (events.length === 0) {
      events = await this.safeQuerySync({ kinds: [0], limit: Math.max(limit * 3, 120) });
    }
    const sorted = events
      .slice()
      .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id));
    const out: Record<string, ProfileMetadata> = {};
    for (const event of sorted) {
      if (event.pubkey in out) continue;
      const parsed = parseProfileEvent(event);
      if (!parsed) continue;
      const haystack = [parsed.display_name, parsed.name, parsed.about, parsed.nip05, parsed.website]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (events.length > limit && !haystack.includes(normalized)) continue;
      out[event.pubkey] = parsed;
      if (Object.keys(out).length >= limit) break;
    }
    return out;
  }

  async fetchProfiles(pubkeys: string[]): Promise<Record<string, ProfileMetadata>> {
    if (pubkeys.length === 0) return {};
    // Check in-memory/IDB cache first; only query relay for the misses.
    const result: Record<string, ProfileMetadata> = {};
    const missing: string[] = [];
    await Promise.all(
      pubkeys.map(async (pubkey) => {
        const cached = await this.cache?.getProfile(pubkey);
        if (cached) {
          result[pubkey] = cached;
        } else {
          missing.push(pubkey);
        }
      })
    );
    if (missing.length === 0) return result;
    // Single relay subscription for all missing pubkeys.
    const events = await this.safeQuerySync({ kinds: [0], authors: missing, limit: missing.length });
    await Promise.all(
      (events as NostrEvent[]).map(async (event) => {
        try {
          const profile = JSON.parse(event.content) as ProfileMetadata;
          result[event.pubkey] = profile;
          await this.cache?.setProfile(event.pubkey, profile);
        } catch {
          // ignore malformed profile
        }
      })
    );
    return result;
  }

  async fetchLists(pubkey: string): Promise<ListDescriptor[]> {
    const events = await this.safeQuerySync({
      kinds: [30000, 30001, 30002, 30003, 30004, 30005],
      authors: [pubkey]
    });
    return (events as NostrEvent[]).map((event) => {
      const title = getTagValue(event.tags, 'title') ?? getTagValue(event.tags, 'd') ?? 'Untitled';
      const description = getTagValue(event.tags, 'description');
      const pubkeys = getAllTagValues(event.tags, 'p');
      return { id: event.id, title, description, pubkeys, kind: event.kind };
    });
  }

  async fetchReplies(eventId: string): Promise<NostrEvent[]> {
    const cached = await this.cache?.getReplies(eventId);
    // Always refresh from relay so thread views don't get stuck on a stale empty cache.
    const events = await this.safeQuerySync({ kinds: [1], '#e': [eventId], limit: 150 });
    const fresh = events as NostrEvent[];
    const merged = dedupeEventsById([...(cached ?? []), ...fresh]);
    if (merged.length > 0) {
      await this.cache?.setReplies(eventId, merged);
      await this.cache?.setEvents(merged);
    }
    return merged;
  }

  async fetchFollowers(pubkey: string, limit = 200): Promise<string[]> {
    const cached = await this.cache?.getFollowers(pubkey);
    if (cached) return cached;
    const events = await this.safeQuerySync({
      kinds: [3],
      '#p': [pubkey],
      limit
    });
    const followers = new Set<string>();
    (events as NostrEvent[]).forEach((event) => {
      followers.add(event.pubkey);
    });
    const list = Array.from(followers);
    await this.cache?.setFollowers(pubkey, list);
    return list;
  }

  async fetchFollowing(pubkey: string): Promise<string[]> {
    const cached = await this.cache?.getFollowing(pubkey);
    if (cached) return cached;
    const events = await this.safeQuerySync({
      kinds: [3],
      authors: [pubkey],
      limit: 10
    });
    const latest = (events as NostrEvent[])
      .sort((a, b) => b.created_at - a.created_at)[0];
    if (!latest) return [];
    const follows = latest.tags
      .filter((tag) => tag[0] === 'p' && tag[1])
      .map((tag) => tag[1]);
    const list = Array.from(new Set(follows));
    await this.cache?.setFollowing(pubkey, list);
    return list;
  }

  async fetchRelayList(pubkey: string): Promise<string[]> {
    const cached = await this.cache?.getRelayList(pubkey);
    if (cached) return cached;
    const events = await this.safeQuerySync({
      kinds: [10002],
      authors: [pubkey],
      limit: 1
    });
    const latest = (events as NostrEvent[])
      .sort((a, b) => b.created_at - a.created_at)[0];
    if (!latest) return [];
    const relays = latest.tags
      .filter((tag) => tag[0] === 'r' && tag[1])
      .map((tag) => tag[1]);
    const list = Array.from(new Set(relays));
    await this.cache?.setRelayList(pubkey, list);
    return list;
  }

  async fetchMediaRelayList(pubkey: string): Promise<string[]> {
    const cached = await this.cache?.getMediaRelayList(pubkey);
    if (cached) return cached;
    const events = await this.safeQuerySync({
      kinds: [30000],
      authors: [pubkey],
      '#d': ['media-relays'],
      limit: 1
    });
    const latest = (events as NostrEvent[])
      .sort((a, b) => b.created_at - a.created_at)[0];
    if (!latest) return [];
    const urls = latest.tags
      .filter((tag) => tag[0] === 'u' && tag[1])
      .map((tag) => tag[1]);
    const list = Array.from(new Set(urls));
    await this.cache?.setMediaRelayList(pubkey, list);
    return list;
  }

  async fetchListEvent(pubkey: string, listId: string, kind = 30000): Promise<NostrEvent | undefined> {
    const events = await this.safeQuerySync({
      kinds: [kind],
      authors: [pubkey],
      '#d': [listId],
      limit: 1
    });
    const latest = (events as NostrEvent[])
      .sort((a, b) => b.created_at - a.created_at)[0];
    return latest;
  }

  async fetchEventById(id: string): Promise<NostrEvent | undefined> {
    const cached = await this.cache?.getEvent(id);
    if (cached) return cached;
    const events = await this.safeQuerySync({ ids: [id], limit: 1 });
    const event = events[0] as NostrEvent | undefined;
    if (event) await this.cache?.setEvent(event);
    return event;
  }

  async searchEvents(query: string, limit = 40): Promise<NostrEvent[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const normalized = trimmed.toLowerCase();
    const filter = { kinds: [1, 30023], limit } as Filter & { search?: string };
    filter.search = trimmed;
    let events = await this.safeQuerySync(filter);
    if (events.length === 0) {
      events = await this.safeQuerySync({ kinds: [1, 30023], limit: Math.max(limit * 4, 160) });
    }
    const deduped = new Map<string, NostrEvent>();
    for (const event of events) {
      if (deduped.has(event.id)) continue;
      const title = getTagValue(event.tags, 'title') ?? '';
      const summary = getTagValue(event.tags, 'summary') ?? '';
      const haystack = `${event.content} ${title} ${summary}`.toLowerCase();
      if (events.length > limit && !haystack.includes(normalized)) continue;
      deduped.set(event.id, event);
      if (deduped.size >= limit) break;
    }
    return Array.from(deduped.values())
      .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id));
  }

  async fetchEventsByIds(ids: string[]): Promise<NostrEvent[]> {
    if (ids.length === 0) return [];
    const result: NostrEvent[] = [];
    const missing: string[] = [];
    await Promise.all(ids.map(async (id) => {
      const cached = await this.cache?.getEvent(id);
      if (cached) result.push(cached);
      else missing.push(id);
    }));
    if (missing.length > 0) {
      const fetched = await this.safeQuerySync({ ids: missing, limit: missing.length });
      await Promise.all(fetched.map((e) => this.cache?.setEvent(e as NostrEvent)));
      result.push(...fetched as NostrEvent[]);
    }
    return result;
  }

  async fetchMentions(pubkey: string, { until, limit = 50 }: { until?: number; limit?: number } = {}): Promise<NostrEvent[]> {
    const filter = { kinds: [1, 7, 9735], '#p': [pubkey], limit } as Filter;
    if (until) filter.until = until;
    const events = await this.safeQuerySync(filter);
    const sorted = (events as NostrEvent[])
      .slice()
      .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id));
    await this.cache?.setEvents(sorted);
    return sorted;
  }

  async subscribeMentions(
    pubkey: string,
    onEvent: (event: NostrEvent) => void,
    onClose?: (reasons: string[]) => void
  ): Promise<() => void> {
    return this.subscribe([{ kinds: [1, 7, 9735], '#p': [pubkey], limit: 100 } as Filter], onEvent, onClose);
  }

  async publishEvent(event: NostrEvent): Promise<void> {
    await this.publishToRelays(event);
  }

  async fetchOlderTimeline({
    until,
    authors,
    tags,
    limit = 50
  }: {
    until: number;
    authors?: string[];
    tags?: string[];
    limit?: number;
  }): Promise<NostrEvent[]> {
    const filter: Filter = { kinds: [1, 30023], limit, until };
    if (authors && authors.length > 0) filter.authors = authors;
    if (tags && tags.length > 0) filter['#t'] = tags.map((tag) => tag.trim().replace(/^#/, '').toLowerCase()).filter(Boolean);
    const events = await this.safeQuerySync(filter);
    await this.cache?.setEvents(events as NostrEvent[]);
    return events as NostrEvent[];
  }

  private async safeQuerySync(filter: Filter): Promise<NostrEvent[]> {
    return this.queryLimit(async () => {
      try {
        const events = await this.pool.querySync(this.relays, filter);
        return events as NostrEvent[];
      } catch {
        return [];
      }
    });
  }

  async publishList({
    title,
    description,
    pubkeys,
    secretKeyHex,
    kind = 30000,
    isTracklist = false,
    tracks = []
  }: {
    title: string;
    description?: string;
    pubkeys: string[];
    secretKeyHex: string;
    kind?: number;
    isTracklist?: boolean;
    tracks?: TrackItem[];
  }) {
    const secretKey = hexToBytes(secretKeyHex);
    const pubkey = getPublicKey(secretKey);
    const tags = [
      ['d', title.toLowerCase().replace(/\s+/g, '-')],
      ['title', title]
    ];
    if (description) tags.push(['description', description]);
    if (isTracklist) tags.push(['type', 'tracklist']);
    pubkeys.forEach((key) => tags.push(['p', key]));
    tracks.forEach((track) => {
      const payload = ['track', track.url];
      if (track.magnet) payload.push(`magnet=${track.magnet}`);
      if (track.sha256) payload.push(`sha256=${track.sha256}`);
      tags.push(payload);
    });

    const event = finalizeEvent(
      {
        kind,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: ''
      },
      secretKey
    );
    await this.publishToRelays(event as NostrEvent);
    return event as NostrEvent;
  }

  private async publishToRelays(event: NostrEvent): Promise<void> {
    if (this.relays.length === 0) {
      throw new Error('No relays configured for publish');
    }
    const results = await Promise.allSettled(this.pool.publish(this.relays, event));
    const ok = results.some((result) => result.status === 'fulfilled');
    if (ok) return;
    const reasons = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => errorMessage(result.reason))
      .filter(Boolean);
    if (reasons.length > 0) {
      throw new Error(`Failed to publish to relays: ${reasons.join('; ')}`);
    }
    throw new Error('Failed to publish to relays');
  }

  decodeKey(value: string): { pubkey: string; secretKeyHex?: string } {
    const decoded = nip19.decode(value);
    if (decoded.type === 'npub') return { pubkey: decoded.data as string };
    if (decoded.type === 'nsec') {
      const secretKeyHex = toHex(decoded.data as Uint8Array | string);
      return { pubkey: getPublicKey(hexToBytes(secretKeyHex)), secretKeyHex };
    }
    throw new Error('Unsupported key format');
  }
}

function toHex(value: Uint8Array | string): string {
  if (typeof value === 'string') return value;
  return bytesToHex(value);
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message) return reason.message;
  if (typeof reason === 'string') return reason;
  return '';
}

function parseProfileEvent(event: NostrEvent): ProfileMetadata | undefined {
  try {
    return JSON.parse(event.content) as ProfileMetadata;
  } catch {
    return undefined;
  }
}

function dedupeEventsById(events: NostrEvent[]): NostrEvent[] {
  const byId = new Map<string, NostrEvent>();
  events.forEach((event) => {
    byId.set(event.id, event);
  });
  return Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id));
}
