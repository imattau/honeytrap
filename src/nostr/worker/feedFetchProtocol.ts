import type { NostrEvent } from '../types';

export interface FeedSubscribeRequest {
  type: 'subscribe';
  reqId: string;
  relays: string[];
  authors?: string[];
  tags?: string[];
}

export interface FeedStopRequest {
  type: 'stop';
  reqId: string;
}

export interface FeedShutdownRequest {
  type: 'shutdown';
}

export type FeedWorkerRequest = FeedSubscribeRequest | FeedStopRequest | FeedShutdownRequest;

export interface FeedEventMessage {
  type: 'event';
  reqId: string;
  event: NostrEvent;
}

export interface FeedCloseMessage {
  type: 'close';
  reqId: string;
  reasons: string[];
}

export interface FeedErrorMessage {
  type: 'error';
  reqId: string;
  message: string;
}

export type FeedWorkerResponse = FeedEventMessage | FeedCloseMessage | FeedErrorMessage;
