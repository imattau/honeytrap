/// <reference lib="webworker" />
import type { Filter } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import type { FeedWorkerRequest, FeedWorkerResponse } from './feedFetchProtocol';
import type { NostrEvent } from '../types';

const pool = new SimplePool({ enablePing: true, enableReconnect: true });
const unsubByReq = new Map<string, () => void>();
const queueByReq = new Map<string, NostrEvent[]>();
const timerByReq = new Map<string, ReturnType<typeof setTimeout>>();
const BATCH_MS = 50;
const MAX_BATCH = 120;

self.onmessage = (message: MessageEvent<FeedWorkerRequest>) => {
  const payload = message.data;
  if (payload.type === 'subscribe') {
    handleSubscribe(payload.reqId, payload.relays, payload.authors, payload.tags);
    return;
  }
  if (payload.type === 'stop') {
    stopRequest(payload.reqId);
    return;
  }
  if (payload.type === 'shutdown') {
    Array.from(unsubByReq.keys()).forEach((reqId) => stopRequest(reqId));
    pool.destroy();
  }
};

function handleSubscribe(reqId: string, relays: string[], authors?: string[], tags?: string[]) {
  stopRequest(reqId);
  const filter: Filter = { kinds: [1, 30023], limit: 100 };
  if (authors && authors.length > 0) filter.authors = authors;
  if (tags && tags.length > 0) {
    filter['#t'] = tags.map((tag) => tag.trim().replace(/^#/, '').toLowerCase()).filter(Boolean);
  }
  const sub = pool.subscribe(relays, filter, {
    onevent: (event: NostrEvent) => {
      queueEvent(reqId, event);
    },
    onclose: (reasons: string[]) => {
      flush(reqId);
      post({ type: 'close', reqId, reasons });
    }
  });
  unsubByReq.set(reqId, () => sub.close('manual'));
}

function queueEvent(reqId: string, event: NostrEvent) {
  const queue = queueByReq.get(reqId) ?? [];
  queue.push(event);
  queueByReq.set(reqId, queue);
  if (queue.length >= MAX_BATCH) {
    flush(reqId);
    return;
  }
  if (timerByReq.has(reqId)) return;
  timerByReq.set(reqId, globalThis.setTimeout(() => {
    timerByReq.delete(reqId);
    flush(reqId);
  }, BATCH_MS));
}

function flush(reqId: string) {
  const timer = timerByReq.get(reqId);
  if (timer) {
    globalThis.clearTimeout(timer);
    timerByReq.delete(reqId);
  }
  const queue = queueByReq.get(reqId);
  if (!queue || queue.length === 0) return;
  queueByReq.set(reqId, []);
  post({ type: 'event-batch', reqId, events: queue });
}

function stopRequest(reqId: string) {
  const unsub = unsubByReq.get(reqId);
  if (unsub) {
    unsub();
    unsubByReq.delete(reqId);
  }
  flush(reqId);
  queueByReq.delete(reqId);
  const timer = timerByReq.get(reqId);
  if (timer) {
    globalThis.clearTimeout(timer);
    timerByReq.delete(reqId);
  }
}

function post(message: FeedWorkerResponse) {
  self.postMessage(message);
}
