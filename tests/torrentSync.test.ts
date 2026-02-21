import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TorrentSyncService } from '../src/p2p/torrentSync';
import type { TorrentSnapshot, TorrentStatus } from '../src/p2p/registry';

function makeStatus(magnet: string, updatedAt = Date.now()): TorrentStatus {
  return {
    magnet,
    mode: 'fetch',
    addedAt: updatedAt,
    updatedAt,
    peers: 1,
    progress: 0.5,
    downloaded: 100,
    uploaded: 25,
    active: true
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('TorrentSyncService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('hydrates per pubkey and clears snapshot when next account has no items', async () => {
    const load = vi.fn(async (pubkey: string) => (
      pubkey === 'alice' ? [makeStatus('magnet:alice')] : []
    ));
    const publish = vi.fn(async () => undefined);
    const service = new TorrentSyncService({ load, publish } as any);
    const onItems = vi.fn();

    await service.hydrate('alice', onItems);
    await service.hydrate('bob', onItems);

    expect(load).toHaveBeenCalledTimes(2);
    expect(onItems).toHaveBeenCalledTimes(2);
    expect(onItems).toHaveBeenNthCalledWith(1, expect.objectContaining({ 'magnet:alice': expect.any(Object) }));
    expect(onItems).toHaveBeenNthCalledWith(2, {});
  });

  it('ignores stale hydrate responses when pubkey changes quickly', async () => {
    const aliceLoad = deferred<TorrentStatus[]>();
    const bobLoad = deferred<TorrentStatus[]>();
    const load = vi.fn((pubkey: string) => (pubkey === 'alice' ? aliceLoad.promise : bobLoad.promise));
    const service = new TorrentSyncService({ load, publish: vi.fn(async () => undefined) } as any);
    const onItems = vi.fn();

    const hydrateAlice = service.hydrate('alice', onItems);
    const hydrateBob = service.hydrate('bob', onItems);

    bobLoad.resolve([makeStatus('magnet:bob')]);
    await hydrateBob;
    aliceLoad.resolve([makeStatus('magnet:alice')]);
    await hydrateAlice;

    expect(onItems).toHaveBeenCalledTimes(1);
    expect(onItems).toHaveBeenCalledWith(expect.objectContaining({ 'magnet:bob': expect.any(Object) }));
  });

  it('cancels a pending publish when pubkey switches before next hydrate', async () => {
    const publish = vi.fn(async () => undefined);
    const service = new TorrentSyncService({
      load: vi.fn(async () => []),
      publish
    } as any);
    const snapshot: TorrentSnapshot = { 'magnet:alice': makeStatus('magnet:alice') };

    await service.hydrate('alice', () => null);
    service.schedulePublish('alice', snapshot);
    service.schedulePublish('bob', snapshot);
    vi.advanceTimersByTime(10_100);

    expect(publish).not.toHaveBeenCalled();
  });

  it('publishes after debounce once hydrated for current pubkey', async () => {
    const publish = vi.fn(async () => undefined);
    const service = new TorrentSyncService({
      load: vi.fn(async () => []),
      publish
    } as any);
    const snapshot: TorrentSnapshot = { 'magnet:alice': makeStatus('magnet:alice') };

    await service.hydrate('alice', () => null);
    service.schedulePublish('alice', snapshot);
    vi.advanceTimersByTime(10_100);

    expect(publish).toHaveBeenCalledTimes(1);
  });
});
