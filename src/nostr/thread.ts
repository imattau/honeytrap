import type { NostrEvent } from './types';
import { NostrClient } from './client';
import type { TransportStore } from './transport';
import type { ThreadServiceApi } from './contracts';
import { AsyncEventVerifier, type EventVerifier } from './eventVerifier';

export interface ThreadNode {
  event: NostrEvent;
  depth: number;
  role: 'root' | 'ancestor' | 'target' | 'reply';
}

// How long (ms) to serve a cached thread result before re-fetching from relays.
// Re-opening the same thread within this window is instant.
const THREAD_CACHE_TTL_MS = 90_000;

interface CachedThread {
  nodes: ThreadNode[];
  storedAt: number;
}

export class ThreadService implements ThreadServiceApi {
  private readonly maxReplyFetchDepth = 4;
  private readonly maxReplyNodes = 300;
  private verifier: EventVerifier;
  // In-memory cache of fully assembled ThreadNode arrays, keyed by event id.
  private threadCache = new Map<string, CachedThread>();

  constructor(
    private client: NostrClient,
    private transport?: TransportStore,
    private isBlocked?: (pubkey: string) => boolean,
    verifier?: EventVerifier
  ) {
    this.verifier = verifier ?? new AsyncEventVerifier();
  }

  async loadThread(eventId: string): Promise<ThreadNode[]> {
    // Return cached result immediately if it is fresh enough.
    const cached = this.threadCache.get(eventId);
    if (cached && Date.now() - cached.storedAt < THREAD_CACHE_TTL_MS) {
      return cached.nodes;
    }

    const target = await this.client.fetchEventById(eventId);
    if (!target) return [];
    if (this.isBlocked?.(target.pubkey)) return [];
    this.markTransport(target);

    const [ancestors, replies] = await Promise.all([
      this.loadAncestors(target),
      this.loadRepliesTree(target.id)
    ]);
    replies.forEach((reply) => {
      this.markTransport(reply);
    });

    const nodes: ThreadNode[] = [];
    const chain = ancestors;
    chain.forEach((event, index) => {
      if (this.isBlocked?.(event.pubkey)) return;
      const role = index === 0 ? 'root' : 'ancestor';
      this.markTransport(event);
      nodes.push({ event, depth: index, role });
    });

    const lastAncestor = chain[chain.length - 1];
    const targetIncluded = lastAncestor?.id === target.id;
    const depthBase = chain.length - (targetIncluded ? 1 : 0);
    if (!targetIncluded) {
      nodes.push({ event: target, depth: depthBase, role: 'target' });
    } else {
      nodes[nodes.length - 1] = { event: target, depth: depthBase, role: 'target' };
    }
    replies.forEach((reply) => {
      const depth = depthBase + 1 + inferReplyDepth(reply, target.id);
      nodes.push({ event: reply, depth, role: 'reply' });
    });

    this.threadCache.set(eventId, { nodes, storedAt: Date.now() });
    return nodes;
  }

  private async loadAncestors(event: NostrEvent): Promise<NostrEvent[]> {
    // Batch-fetch all IDs mentioned in e-tags — most clients include the full
    // ancestor chain, so this resolves the common case in a single relay query.
    const eTagIds = event.tags.filter((t) => t[0] === 'e').map((t) => t[1]).filter(Boolean);
    const prefetched = new Map<string, NostrEvent>();
    if (eTagIds.length > 0) {
      const fetched = await this.client.fetchEventsByIds(eTagIds);
      for (const ev of fetched) prefetched.set(ev.id, ev);
    }

    // Walk the chain using prefetched events; collect any gap IDs that require
    // an additional relay lookup, then batch-fetch them all at once.
    const chain: NostrEvent[] = [];
    let current: NostrEvent | undefined = event;
    let depth = 0;
    const MAX_ANCESTOR_DEPTH = 50;

    // First pass: walk as far as we can with prefetched data, recording gaps.
    const gapIds: string[] = [];
    while (current && depth < MAX_ANCESTOR_DEPTH) {
      depth++;
      chain.unshift(current);
      const parentId = getReplyParentId(current);
      if (!parentId) break;
      const parent = prefetched.get(parentId);
      if (!parent) {
        // Gap: this parent was not in the target's e-tags. Record it and stop
        // the first-pass walk — we'll re-walk after a batch fetch.
        gapIds.push(parentId);
        break;
      }
      current = parent;
    }

    // If there are gap IDs, batch-fetch them all (they are likely already in
    // the event cache from previous relay queries, so this is usually free).
    if (gapIds.length > 0) {
      const gapFetched = await this.client.fetchEventsByIds(gapIds);
      for (const ev of gapFetched) prefetched.set(ev.id, ev);

      // Second pass: extend the chain upward using the newly fetched events.
      // Start from the first gap node we recorded.
      let gapCurrent = prefetched.get(gapIds[0]);
      while (gapCurrent && depth < MAX_ANCESTOR_DEPTH) {
        depth++;
        chain.unshift(gapCurrent);
        const parentId = getReplyParentId(gapCurrent);
        if (!parentId) break;
        const parent = prefetched.get(parentId);
        if (!parent) {
          // Deeper gap — fetch individually (rare for well-structured threads).
          const fetched = await this.client.fetchEventById(parentId);
          if (!fetched) break;
          prefetched.set(parentId, fetched);
          gapCurrent = fetched;
        } else {
          gapCurrent = parent;
        }
      }
    }

    return chain;
  }

  private async loadRepliesTree(targetId: string): Promise<NostrEvent[]> {
    const repliesById = new Map<string, NostrEvent>();
    let frontier = [targetId];
    let depth = 0;
    while (frontier.length > 0 && depth < this.maxReplyFetchDepth && repliesById.size < this.maxReplyNodes) {
      const batches = await Promise.all(
        frontier.map((eventId) => this.client.fetchReplies(eventId).catch(() => [] as NostrEvent[]))
      );
      const nextFrontier: string[] = [];
      for (const batch of batches) {
        for (const reply of batch) {
          if (reply.id === targetId) continue;
          if (this.isBlocked?.(reply.pubkey)) continue;
          if (repliesById.has(reply.id)) continue;
          repliesById.set(reply.id, reply);
          if (nextFrontier.length < this.maxReplyNodes) nextFrontier.push(reply.id);
        }
      }
      frontier = nextFrontier.slice(0, 80);
      depth += 1;
    }
    return Array.from(repliesById.values())
      .sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id));
  }

  private markTransport(event: NostrEvent) {
    this.transport?.mark(event.id, { relay: true });
    this.verifier.verify(event, (id, verified) => {
      this.transport?.mark(id, { verified });
    });
  }
}

function getReplyParentId(event: NostrEvent): string | undefined {
  const replyTag = event.tags.find((tag) => tag[0] === 'e' && tag[3] === 'reply');
  if (replyTag) return replyTag[1];
  const rootTag = event.tags.find((tag) => tag[0] === 'e' && tag[3] === 'root');
  if (rootTag) return rootTag[1];
  const eTags = event.tags.filter((tag) => tag[0] === 'e');
  const fallback = eTags.length ? eTags[eTags.length - 1] : undefined;
  return fallback?.[1];
}

function inferReplyDepth(event: NostrEvent, targetId: string): number {
  const tags = event.tags.filter((tag) => tag[0] === 'e').map((tag) => tag[1]);
  const targetIndex = tags.indexOf(targetId);
  if (targetIndex === -1) return 0;
  return Math.max(0, tags.length - targetIndex - 1);
}
