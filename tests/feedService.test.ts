import { describe, it, expect, vi } from 'vitest';
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

  it('keeps a single pending retry when closed repeatedly', async () => {
    vi.useFakeTimers();
    let capturedClose: ((reasons: string[]) => void) | undefined;
    const subscribe = vi.fn(async (_filters: any[], _onEvent: any, onClose?: (reasons: string[]) => void) => {
      capturedClose = onClose;
      return () => {};
    });
    const service = new FeedService({ subscribe } as any);
    await service.subscribeTimeline({ onEvent: () => null });

    capturedClose?.(['closed-1']);
    capturedClose?.(['closed-2']);
    vi.runAllTimers();

    expect(subscribe).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
