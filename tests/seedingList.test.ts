import { describe, expect, it, vi } from 'vitest';
import type { NostrEvent } from '../src/nostr/types';
import type { TorrentStatus } from '../src/p2p/registry';
import { SeedingListService } from '../src/nostr/seedingList';

function makeStatus(patch: Partial<TorrentStatus> & { magnet: string }): TorrentStatus {
  const now = Date.now();
  return {
    magnet: patch.magnet,
    mode: patch.mode ?? 'seed',
    addedAt: patch.addedAt ?? now,
    updatedAt: patch.updatedAt ?? now,
    peers: patch.peers ?? 1,
    progress: patch.progress ?? 1,
    downloaded: patch.downloaded ?? 1,
    uploaded: patch.uploaded ?? 1,
    active: patch.active ?? true,
    name: patch.name,
    eventId: patch.eventId,
    authorPubkey: patch.authorPubkey,
    url: patch.url,
    availableUntil: patch.availableUntil
  };
}

function makeListEvent(tags: string[][]): NostrEvent {
  return {
    id: 'list-1',
    pubkey: 'alice',
    kind: 30000,
    created_at: 1000,
    content: '',
    tags,
    sig: 'sig'
  };
}

describe('SeedingListService', () => {
  it('publishes public bt tags for active seedable torrents', async () => {
    const publishEvent = vi.fn(async () => undefined);
    const signEvent = vi.fn(async (input: { tags: string[][] }) => makeListEvent(input.tags));
    const service = new SeedingListService(
      { publishEvent, fetchListEvent: vi.fn(async () => undefined) } as any,
      { signEvent } as any
    );
    const items: TorrentStatus[] = [
      makeStatus({ magnet: 'magnet:seed', mode: 'seed', eventId: 'evt-1', url: 'https://cdn/a.jpg' }),
      makeStatus({ magnet: 'magnet:inactive', active: false })
    ];

    const event = await service.publish(items);

    expect(event).toBeTruthy();
    expect(signEvent).toHaveBeenCalledTimes(1);
    const tags = signEvent.mock.calls[0]?.[0]?.tags ?? [];
    expect(tags.some((tag: string[]) => tag[0] === 'd' && tag[1] === 'honeytrap-seeding')).toBe(true);
    const btTags = tags.filter((tag: string[]) => tag[0] === 'bt');
    expect(btTags).toHaveLength(1);
    expect(btTags[0]?.[1]).toBe('magnet:seed');
    expect(publishEvent).toHaveBeenCalledTimes(1);
  });

  it('resolves hint by event id and reuses cache', async () => {
    const fetchListEvent = vi.fn(async () => makeListEvent([
      ['d', 'honeytrap-seeding'],
      ['bt', 'magnet:event', 'seed', 'e=evt-1', 'updated=2000'],
      ['bt', 'magnet:media', 'seed', 'u=https://cdn/a.jpg', 'updated=1000']
    ]));
    const service = new SeedingListService(
      { fetchListEvent, publishEvent: vi.fn(async () => undefined) } as any,
      { signEvent: vi.fn(async () => makeListEvent([])) } as any
    );

    const byEvent = await service.resolve('alice', { eventId: 'evt-1' });
    const byUrl = await service.resolve('alice', { url: 'https://cdn/a.jpg' });

    expect(byEvent?.magnet).toBe('magnet:event');
    expect(byUrl?.magnet).toBe('magnet:media');
    expect(fetchListEvent).toHaveBeenCalledTimes(1);
  });
});
