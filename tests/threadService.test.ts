import { describe, it, expect } from 'vitest';
import { ThreadService } from '../src/nostr/thread';
import type { NostrEvent } from '../src/nostr/types';

function makeEvent(id: string, author = 'a'.repeat(64), tags: string[][] = [], createdAt = 1): NostrEvent {
  return {
    id,
    pubkey: author,
    created_at: createdAt,
    kind: 1,
    tags,
    content: id,
    sig: 'f'.repeat(128)
  };
}

describe('ThreadService.loadThread', () => {
  it('loads nested replies when descendants reference only their parent', async () => {
    const root = makeEvent('root', '1'.repeat(64), [], 10);
    const reply1 = makeEvent('reply1', '2'.repeat(64), [['e', 'root', '', 'reply']], 11);
    const reply2 = makeEvent('reply2', '3'.repeat(64), [['e', 'reply1', '', 'reply']], 12);
    const reply3 = makeEvent('reply3', '4'.repeat(64), [['e', 'reply2', '', 'reply']], 13);

    const replyMap: Record<string, NostrEvent[]> = {
      root: [reply1],
      reply1: [reply2],
      reply2: [reply3],
      reply3: []
    };

    const client = {
      fetchEventById: async (id: string) => (id === 'root' ? root : undefined),
      fetchEventsByIds: async () => [],
      fetchReplies: async (id: string) => replyMap[id] ?? []
    } as any;

    const threadService = new ThreadService(client);
    const nodes = await threadService.loadThread('root');
    const ids = nodes.map((node) => node.event.id);

    expect(ids).toEqual(['root', 'reply1', 'reply2', 'reply3']);
    expect(nodes[0]?.role).toBe('target');
    expect(nodes.slice(1).every((node) => node.role === 'reply')).toBe(true);
  });

  it('filters blocked authors from replies', async () => {
    const root = makeEvent('root', '1'.repeat(64), [], 10);
    const keep = makeEvent('keep', '2'.repeat(64), [['e', 'root', '', 'reply']], 11);
    const blocked = makeEvent('blocked', '9'.repeat(64), [['e', 'root', '', 'reply']], 12);

    const client = {
      fetchEventById: async () => root,
      fetchEventsByIds: async () => [],
      fetchReplies: async () => [keep, blocked]
    } as any;

    const threadService = new ThreadService(client, undefined, (pubkey) => pubkey === blocked.pubkey);
    const nodes = await threadService.loadThread('root');
    const ids = nodes.map((node) => node.event.id);

    expect(ids).toContain('keep');
    expect(ids).not.toContain('blocked');
  });
});
