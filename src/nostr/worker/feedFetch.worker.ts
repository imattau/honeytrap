/// <reference lib="webworker" />
import type { Filter } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import type { FeedWorkerRequest, FeedWorkerResponse } from './feedFetchProtocol';
import type { NostrEvent } from '../types';

const pool = new SimplePool({ enablePing: true, enableReconnect: true });
const unsubByReq = new Map<string, () => void>();

self.onmessage = (message: MessageEvent<FeedWorkerRequest>) => {
  const payload = message.data;
  if (payload.type === 'subscribe') {
    handleSubscribe(payload.reqId, payload.relays, payload.authors, payload.tags);
    return;
  }
  if (payload.type === 'stop') {
    const unsub = unsubByReq.get(payload.reqId);
    if (unsub) {
      unsub();
      unsubByReq.delete(payload.reqId);
    }
    return;
  }
  if (payload.type === 'shutdown') {
    unsubByReq.forEach((unsub) => unsub());
    unsubByReq.clear();
    pool.destroy();
  }
};

function handleSubscribe(reqId: string, relays: string[], authors?: string[], tags?: string[]) {
  const existing = unsubByReq.get(reqId);
  if (existing) {
    existing();
    unsubByReq.delete(reqId);
  }
  const filter: Filter = { kinds: [1, 30023], limit: 100 };
  if (authors && authors.length > 0) filter.authors = authors;
  if (tags && tags.length > 0) {
    filter['#t'] = tags.map((tag) => tag.trim().replace(/^#/, '').toLowerCase()).filter(Boolean);
  }
  const sub = pool.subscribe(relays, filter, {
    onevent: (event: NostrEvent) => {
      post({ type: 'event', reqId, event });
    },
    onclose: (reasons: string[]) => {
      post({ type: 'close', reqId, reasons });
    }
  });
  unsubByReq.set(reqId, () => sub.close('manual'));
}

function post(message: FeedWorkerResponse) {
  self.postMessage(message);
}
