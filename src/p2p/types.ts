export interface AssistSource {
  magnet?: string;
  url: string;
  sha256?: string;
  type: 'media' | 'event';
  eventId?: string;
  authorPubkey?: string;
  availableUntil?: number;
}

export interface AssistResult {
  source: 'p2p' | 'http';
  data: ArrayBuffer;
}

export interface MediaAssistResult {
  url: string;
  source: 'p2p' | 'http';
}
