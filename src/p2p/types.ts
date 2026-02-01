export interface AssistSource {
  magnet?: string;
  url: string;
  sha256?: string;
  type: 'media' | 'event';
}

export interface AssistResult {
  source: 'p2p' | 'http';
  data: ArrayBuffer;
}
