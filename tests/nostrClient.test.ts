import { describe, it, expect } from 'vitest';
import { NostrClient } from '../src/nostr/client';


describe('NostrClient.fetchOlderTimeline', () => {
  it('normalizes tag filters', async () => {
    const client = new NostrClient();
    let captured: any = null;
    (client as any).safeQuerySync = async (filter: any) => {
      captured = filter;
      return [];
    };

    await client.fetchOlderTimeline({
      until: 100,
      tags: ['#Hello', 'World', '  tEst '],
      limit: 5
    });

    expect(captured['#t']).toEqual(['hello', 'world', 'test']);
  });
});
