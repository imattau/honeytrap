import { describe, expect, it } from 'vitest';
import { computeP2PStats } from '../src/ui/P2PStatusBar';
import type { TorrentSnapshot } from '../src/p2p/registry';

function makeSnapshot(items: Array<Partial<TorrentSnapshot[string]> & { magnet: string }>): TorrentSnapshot {
  const now = Date.now();
  const snapshot: TorrentSnapshot = {};
  for (const item of items) {
    snapshot[item.magnet] = {
      magnet: item.magnet,
      mode: item.mode ?? 'fetch',
      addedAt: item.addedAt ?? now,
      updatedAt: item.updatedAt ?? now,
      peers: item.peers ?? 0,
      progress: item.progress ?? 0,
      downloaded: item.downloaded ?? 0,
      uploaded: item.uploaded ?? 0,
      active: item.active ?? true,
      name: item.name,
      eventId: item.eventId,
      authorPubkey: item.authorPubkey,
      url: item.url,
      availableUntil: item.availableUntil
    };
  }
  return snapshot;
}

describe('computeP2PStats', () => {
  it('counts upload-active fetch torrents as seeding', () => {
    const snapshot = makeSnapshot([
      { magnet: 'magnet:fetch-upload', mode: 'fetch', uploaded: 2048, active: true, peers: 2 },
      { magnet: 'magnet:fetch-idle', mode: 'fetch', uploaded: 0, active: true, peers: 1 }
    ]);

    const stats = computeP2PStats(snapshot);

    expect(stats.fetching).toBe(2);
    expect(stats.seeding).toBe(1);
    expect(stats.peers).toBe(3);
    expect(stats.uploaded).toBe(2048);
  });

  it('does not count inactive torrents as active or seeding', () => {
    const snapshot = makeSnapshot([
      { magnet: 'magnet:seed-inactive', mode: 'seed', uploaded: 4096, active: false, peers: 4 }
    ]);

    const stats = computeP2PStats(snapshot);

    expect(stats.active).toBe(0);
    expect(stats.fetching).toBe(0);
    expect(stats.seeding).toBe(0);
    expect(stats.peers).toBe(4);
  });
});
