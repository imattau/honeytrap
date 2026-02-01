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

export class ThreadService implements ThreadServiceApi {
  private verifier: EventVerifier;

  constructor(
    private client: NostrClient,
    private transport?: TransportStore,
    private isBlocked?: (pubkey: string) => boolean,
    verifier?: EventVerifier
  ) {
    this.verifier = verifier ?? new AsyncEventVerifier();
  }

  async loadThread(eventId: string): Promise<ThreadNode[]> {
    const target = await this.client.fetchEventById(eventId);
    if (!target) return [];
    if (this.isBlocked?.(target.pubkey)) return [];
    this.markTransport(target);

    const ancestors = await this.loadAncestors(target);
    const replies = (await this.client.fetchReplies(target.id))
      .filter((reply) => !this.isBlocked?.(reply.pubkey));
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

    return nodes;
  }

  private async loadAncestors(event: NostrEvent): Promise<NostrEvent[]> {
    const chain: NostrEvent[] = [];
    let current: NostrEvent | undefined = event;
    while (current) {
      chain.unshift(current);
      const parentId = getReplyParentId(current);
      if (!parentId) break;
      const parent = await this.client.fetchEventById(parentId);
      if (!parent) break;
      current = parent;
    }
    return chain;
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
