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
  ok: true,
  status: 200,
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

  it('throws when HTTP fallback returns a non-2xx status', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 503,
      arrayBuffer: async () => new ArrayBuffer(0)
    });
    const assist = new WebTorrentAssist(makeSettings());
    const source = makeSource({ magnet: undefined });
    await expect(assist.fetchWithAssist(source, 1000, true)).rejects.toThrow('HTTP assist failed with status 503');
  });

  it('throws a timeout error when HTTP fallback does not respond in time', async () => {
    fetchSpy.mockImplementationOnce((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined;
      signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });
    }));
    const assist = new WebTorrentAssist(makeSettings());
    const source = makeSource({ magnet: undefined });
    await expect(assist.fetchWithAssist(source, 1, true)).rejects.toThrow('HTTP assist timed out');
  });
});
