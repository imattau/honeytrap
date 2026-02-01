export type NostrTag = string[];

export interface NostrEvent {
  id: string;
  kind: number;
  pubkey: string;
  created_at: number;
  content: string;
  tags: NostrTag[];
  sig: string;
}

export interface ProfileMetadata {
  name?: string;
  display_name?: string;
  picture?: string;
  about?: string;
  lud16?: string;
  lud06?: string;
}

export interface LongFormMetadata {
  title?: string;
  summary?: string;
  image?: string;
  published_at?: string;
}

export interface ListDescriptor {
  id: string;
  title: string;
  description?: string;
  pubkeys: string[];
  kind: number;
}

export interface TrackItem {
  url: string;
  magnet?: string;
  sha256?: string;
}
