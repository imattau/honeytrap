import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebTorrentAssist } from '../src/p2p/webtorrent';
import type { AssistSource } from '../src/p2p/types';

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

const fetchSpy = vi.fn(async () => ({
  arrayBuffer: async () => new TextEncoder().encode('data').buffer
}));

beforeEach(() => {
  fetchSpy.mockClear();
  (globalThis as any).fetch = fetchSpy;
});

describe('WebTorrentAssist HTTP fallback', () => {
  it('uses HTTP when P2P not allowed even if magnet exists', async () => {
    const assist = new WebTorrentAssist(makeSettings());
    const source = makeSource();
    const result = await assist.fetchWithAssist(source, 1000, false);
    expect(result.source).toBe('http');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('uses HTTP when magnet missing', async () => {
    const assist = new WebTorrentAssist(makeSettings());
    const source = makeSource({ magnet: undefined });
    const result = await assist.fetchWithAssist(source, 1000, true);
    expect(result.source).toBe('http');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
