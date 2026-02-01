import type { Filter } from 'nostr-tools';
import type { AppSettings } from '../storage/types';
import type { AssistSource } from '../p2p/types';
import type { TransportStatus } from './transportTypes';
import type { ListDescriptor, NostrEvent, ProfileMetadata } from './types';
import type { ThreadNode } from './thread';

export interface NostrClientApi {
  setRelays(relays: string[]): void;
  subscribe(filters: Filter[], onEvent: (event: NostrEvent) => void, onClose?: (reasons: string[]) => void): Promise<() => void>;
  fetchProfile(pubkey: string): Promise<ProfileMetadata | undefined>;
  fetchLists(pubkey: string): Promise<ListDescriptor[]>;
  fetchReplies(eventId: string): Promise<NostrEvent[]>;
  fetchEventById(id: string): Promise<NostrEvent | undefined>;
  publishEvent(event: NostrEvent): Promise<void>;
  fetchOlderTimeline(input: { until: number; authors?: string[]; limit?: number }): Promise<NostrEvent[]>;
  publishList(input: {
    title: string;
    description?: string;
    pubkeys: string[];
    secretKeyHex: string;
    kind?: number;
    isTracklist?: boolean;
    tracks?: { url: string; magnet?: string; sha256?: string }[];
  }): Promise<NostrEvent>;
  decodeKey(value: string): { pubkey: string; secretKeyHex?: string };
  fetchFollowers(pubkey: string, limit?: number): Promise<string[]>;
  fetchFollowing(pubkey: string): Promise<string[]>;
  fetchRelayList(pubkey: string): Promise<string[]>;
  getRelayStatus(): Map<string, boolean>;
}

export interface NostrCacheApi {
  getProfile(pubkey: string): Promise<ProfileMetadata | undefined>;
  setProfile(pubkey: string, profile: ProfileMetadata): Promise<void>;
  getEvent(id: string): Promise<NostrEvent | undefined>;
  setEvent(event: NostrEvent): Promise<void>;
  getReplies(eventId: string): Promise<NostrEvent[] | undefined>;
  setReplies(eventId: string, events: NostrEvent[]): Promise<void>;
  getFollowers(pubkey: string): Promise<string[] | undefined>;
  setFollowers(pubkey: string, list: string[]): Promise<void>;
  getFollowing(pubkey: string): Promise<string[] | undefined>;
  setFollowing(pubkey: string, list: string[]): Promise<void>;
  getRelayList(pubkey: string): Promise<string[] | undefined>;
  setRelayList(pubkey: string, list: string[]): Promise<void>;
  purgeExpired(): Promise<void>;
}

export interface FeedServiceApi {
  subscribeTimeline(input: { authors?: string[]; onEvent: (event: NostrEvent) => void }): void;
  stop(): void;
}

export interface FeedOrchestratorApi {
  setPaused(value: boolean): void;
  subscribe(
    ctx: { follows: string[]; followers: string[]; feedMode: AppSettings['feedMode']; listId?: string; lists?: ListDescriptor[] },
    getEvents: () => NostrEvent[],
    onUpdate: (events: NostrEvent[]) => void,
    onProfiles: (profiles: Record<string, ProfileMetadata>) => void
  ): void;
  stop(): void;
  loadOlder(
    ctx: { follows: string[]; followers: string[]; feedMode: AppSettings['feedMode']; listId?: string; lists?: ListDescriptor[] },
    getEvents: () => NostrEvent[],
    onUpdate: (events: NostrEvent[]) => void
  ): Promise<void>;
  ensureProfile(pubkey: string, onProfile: (profiles: Record<string, ProfileMetadata>) => void): void;
  flushPending(getEvents: () => NostrEvent[], onUpdate: (events: NostrEvent[]) => void): void;
}

export interface ThreadServiceApi {
  loadThread(eventId: string): Promise<ThreadNode[]>;
}

export interface PublishServiceApi {
  publishNote(input: { content: string; replyTo?: NostrEvent; media?: { url: string; magnet?: string; sha256?: string }[] }): Promise<NostrEvent>;
}

export interface ZapServiceApi {
  sendZap(input: {
    targetEvent: NostrEvent;
    recipientProfile?: ProfileMetadata;
    relays: string[];
    amountSats: number;
    comment?: string;
    nwcUri?: string;
  }): Promise<void>;
}

export interface EventSignerApi {
  signEvent(event: { kind: number; created_at: number; content: string; tags: string[][] }): Promise<NostrEvent>;
}

export interface SocialGraphApi {
  isFollowed(pubkey: string): boolean;
  isBlocked(pubkey: string): boolean;
  isNsfw(pubkey: string): boolean;
  toggleFollow(pubkey: string): AppSettings;
  toggleBlock(pubkey: string): AppSettings;
  toggleNsfw(pubkey: string): AppSettings;
  filterEvents(events: NostrEvent[]): NostrEvent[];
}

export interface TransportStoreApi {
  get(id: string): TransportStatus;
  mark(id: string, patch: TransportStatus): void;
  subscribe(listener: (snapshot: Record<string, TransportStatus>) => void): () => void;
  snapshot(): Record<string, TransportStatus>;
}

export interface MediaAssistApi {
  updateSettings(settings: AppSettings['p2p']): void;
  load(source: AssistSource, allowP2P: boolean, timeoutMs: number): Promise<{ url: string; source: 'p2p' | 'http' }>;
}
