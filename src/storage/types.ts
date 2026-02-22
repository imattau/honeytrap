export type P2PScope = 'follows' | 'everyone';

export interface P2PSettings {
  enabled: boolean;
  scope: P2PScope;
  preferMedia: boolean;
  preferEvents: boolean;
  maxConcurrent: number;
  maxFileSizeMb: number;
  seedWhileOpen: boolean;
  seedRelayEvents: boolean;
  trackers: string[];
}

export interface RelayStatus {
  url: string;
  connected: boolean;
  lastError?: string;
}

export interface AppSettings {
  relays: string[];
  p2p: P2PSettings;
  p2pUpdatedAt?: number;
  followsUpdatedAt?: number;
  selectedListId?: string;
  follows: string[];
  blocked: string[];
  mutedWords: string[];
  mutedHashtags: string[];
  nsfwAuthors: string[];
  feedMode: 'all' | 'follows' | 'followers' | 'both';
  mediaRelays: string[];
  wallet: WalletSettings;
}

export interface WalletSettings {
  lnurl?: string;
  presets: number[];
  nwc?: string;
}

export interface KeyRecord {
  npub: string;
  nsec?: string;
}

export interface CachedEvent {
  id: string;
  event: unknown;
  receivedAt: number;
}

export interface CachedCacheEntry {
  key: string;
  value: unknown;
  expiresAt: number;
  storedAt: number;
  accessAt?: number;
}
