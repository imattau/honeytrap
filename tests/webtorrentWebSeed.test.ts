import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebTorrentAssist } from '../src/p2p/webtorrent';
import type { AssistSource } from '../src/p2p/types';

const ensureMock = vi.fn();
const getClient = vi.fn();

afterEach(() => {
  ensureMock.mockReset();
});

beforeEach(() => {
  getClient.mockReturnValue({});
});

function makeSettings() {
  return {
    enabled: true,
    maxConcurrent: 5,
    maxFileSizeMb: 50,
    seedWhileOpen: true,
    trackers: ['wss://tracker.example']
  };
}

function makeSource(patch: Partial<AssistSource> = {}): AssistSource {
  return {
    url: 'https://example.com/media.jpg',
    magnet: 'magnet:?xt=urn:btih:abc',
    sha256: undefined,
    type: 'media',
    ...patch
  };
}

describe('WebTorrentAssist webseed', () => {
  it('passes webSeed option for media when HTTP url exists', async () => {
    const assist = new WebTorrentAssist(makeSettings(), undefined, {
      getClient,
      ensure: ensureMock
    } as any);

    ensureMock.mockImplementation((_magnet, _onAdd, opts) => {
      expect(opts?.urlList).toEqual(['https://example.com/media.jpg']);
      return {
        files: [],
        ready: true,
        once: () => null,
        on: () => null,
        destroy: () => null
      };
    });

    const source = makeSource();
    await (assist as any).addTorrent(source.magnet!, 1, source);
    expect(ensureMock).toHaveBeenCalledTimes(1);
  });

  it('does not pass webSeed for event packages', async () => {
    const assist = new WebTorrentAssist(makeSettings(), undefined, {
      getClient,
      ensure: ensureMock
    } as any);

    ensureMock.mockImplementation((_magnet, _onAdd, opts) => {
      expect(opts?.urlList).toBeUndefined();
      return {
        files: [],
        ready: true,
        once: () => null,
        on: () => null,
        destroy: () => null
      };
    });

    const source = makeSource({ type: 'event' });
    await (assist as any).addTorrent(source.magnet!, 1, source);
    expect(ensureMock).toHaveBeenCalledTimes(1);
  });

  it('reuses webSeed when reseeding via ensure', () => {
    const assist = new WebTorrentAssist(makeSettings(), undefined, {
      getClient,
      ensure: ensureMock
    } as any);

    ensureMock.mockImplementation((_magnet, _onAdd, opts) => {
      expect(opts?.urlList).toEqual(['https://example.com/media.jpg']);
      return { files: [], on: () => null };
    });

    const source = makeSource();
    assist.ensureWebSeed(source, true);
    expect(ensureMock).toHaveBeenCalledTimes(1);
  });

  it('skips webSeed reseed when P2P is disallowed', () => {
    const assist = new WebTorrentAssist(makeSettings(), undefined, {
      getClient,
      ensure: ensureMock
    } as any);

    const source = makeSource();
    assist.ensureWebSeed(source, false);
    expect(ensureMock).not.toHaveBeenCalled();
  });

  it('destroys a tracked torrent on timeout before ready', async () => {
    vi.useFakeTimers();
    const destroy = vi.fn();
    const once = vi.fn();
    const torrent = {
      files: [],
      ready: false,
      once,
      on: () => null,
      destroy
    };
    const assist = new WebTorrentAssist(makeSettings(), undefined, {
      getClient,
      ensure: ensureMock
    } as any);

    ensureMock.mockImplementation((_magnet, onAdd) => {
      onAdd(torrent as any);
      return torrent as any;
    });

    const source = makeSource();
    const pending = (assist as any).addTorrent(source.magnet!, 5, source);
    vi.advanceTimersByTime(10);
    const result = await pending;

    expect(result).toBeUndefined();
    expect(destroy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
