import { finalizeEvent, getPublicKey, nip19 } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import type { Filter } from 'nostr-tools';
import type { ListDescriptor, NostrEvent, ProfileMetadata, TrackItem } from './types';
import { getAllTagValues, getTagValue } from './utils';
import type { NostrClientApi } from './contracts';
import type { NostrCache } from './cache';

export class NostrClient implements NostrClientApi {
  private pool = new SimplePool({ enablePing: true, enableReconnect: true });
  private relays: string[] = [];
  private relaySet = new Set<string>();
  private cache?: NostrCache;

  setRelays(relays: string[]) {
    const next = Array.from(new Set(relays.map((url) => url.trim()).filter(Boolean)));
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
    const cached = await this.cache?.getProfile(pubkey);
    if (cached) return cached;
    const events = await this.safeQuerySync({ kinds: [0], authors: [pubkey], limit: 1 });
    const event = events[0] as NostrEvent | undefined;
    if (!event) return undefined;
    try {
      const profile = JSON.parse(event.content) as ProfileMetadata;
      await this.cache?.setProfile(pubkey, profile);
      return profile;
    } catch {
      return undefined;
    }
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
    if (cached) return cached;
    const events = await this.safeQuerySync({ kinds: [1], '#e': [eventId], limit: 50 });
    const list = events as NostrEvent[];
    await this.cache?.setReplies(eventId, list);
    return list;
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

  async publishEvent(event: NostrEvent): Promise<void> {
    await Promise.allSettled(this.pool.publish(this.relays, event));
  }

  async fetchOlderTimeline({
    until,
    authors,
    limit = 50
  }: {
    until: number;
    authors?: string[];
    limit?: number;
  }): Promise<NostrEvent[]> {
    const filter: Filter = { kinds: [1, 30023], limit, until };
    if (authors && authors.length > 0) filter.authors = authors;
    const events = await this.safeQuerySync(filter);
    return events as NostrEvent[];
  }

  private async safeQuerySync(filter: Filter): Promise<NostrEvent[]> {
    try {
      const events = await this.pool.querySync(this.relays, filter);
      return events as NostrEvent[];
    } catch {
      return [];
    }
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
    await this.pool.publish(this.relays, event);
    return event as NostrEvent;
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
