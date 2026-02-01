import { describe, it, expect } from 'vitest';
import { FeedService } from '../src/nostr/service';


describe('FeedService.subscribeTimeline', () => {
  it('passes normalized hashtag filters to client', async () => {
    let capturedFilters: any[] | null = null;
    const client = {
      subscribe: async (filters: any[]) => {
        capturedFilters = filters;
        return () => {};
      }
    } as any;

    const service = new FeedService(client);
    await service.subscribeTimeline({
      tags: ['#Nostr', '  P2P '],
      onEvent: () => null
    });

    expect(capturedFilters).not.toBeNull();
    expect(capturedFilters?.[0]['#t']).toEqual(['nostr', 'p2p']);
  });
});
