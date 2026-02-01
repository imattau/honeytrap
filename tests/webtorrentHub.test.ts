import { describe, it, expect, vi, beforeEach } from 'vitest';

type FakeTorrent = { magnetURI: string };

class FakeWebTorrent {
  static instances: FakeWebTorrent[] = [];
  static addCalls = 0;
  private items = new Map<string, FakeTorrent>();

  constructor() {
    FakeWebTorrent.instances.push(this);
  }

  add(magnet: string, onAdd: (torrent: FakeTorrent) => void) {
    FakeWebTorrent.addCalls += 1;
    const torrent = { magnetURI: magnet };
    this.items.set(magnet, torrent);
    onAdd(torrent);
    return torrent;
  }

  get(magnet: string) {
    return this.items.get(magnet);
  }

  destroy() {
    return;
  }
}

vi.mock('webtorrent/dist/webtorrent.min.js', () => ({
  default: FakeWebTorrent
}));

describe('WebTorrentHub', () => {
  beforeEach(() => {
    FakeWebTorrent.instances = [];
    FakeWebTorrent.addCalls = 0;
  });

  it('reuses existing torrent on ensure', async () => {
    const { WebTorrentHub } = await import('../src/p2p/webtorrentHub');
    const hub = new WebTorrentHub({
      enabled: true,
      scope: 'follows',
      preferMedia: true,
      preferEvents: false,
      maxConcurrent: 5,
      maxFileSizeMb: 50,
      seedWhileOpen: true,
      trackers: ['wss://tracker.example']
    });

    hub.ensure('magnet:?xt=urn:btih:abc', () => null);
    hub.ensure('magnet:?xt=urn:btih:abc', () => null);

    expect(FakeWebTorrent.addCalls).toBe(1);
  });

  it('does not recreate client when trackers unchanged', async () => {
    const { WebTorrentHub } = await import('../src/p2p/webtorrentHub');
    const hub = new WebTorrentHub({
      enabled: true,
      scope: 'follows',
      preferMedia: true,
      preferEvents: false,
      maxConcurrent: 5,
      maxFileSizeMb: 50,
      seedWhileOpen: true,
      trackers: ['wss://tracker.example']
    });

    expect(FakeWebTorrent.instances.length).toBe(1);
    hub.updateSettings({
      enabled: true,
      scope: 'follows',
      preferMedia: true,
      preferEvents: false,
      maxConcurrent: 5,
      maxFileSizeMb: 50,
      seedWhileOpen: true,
      trackers: ['wss://tracker.example']
    });
    expect(FakeWebTorrent.instances.length).toBe(1);
  });
});
