import { describe, it, expect, vi } from 'vitest';
import { NostrClient } from '../src/nostr/client';
import type { NostrEvent } from '../src/nostr/types';


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

describe('NostrClient.setRelays', () => {
  it('normalizes and deduplicates relay urls with nostr-tools normalizeURL', () => {
    const client = new NostrClient();
    const ensureRelay = vi.fn(async () => undefined);
    const close = vi.fn();
    (client as any).pool = { ensureRelay, close };

    client.setRelays([
      'relay.example.com',
      'wss://relay.example.com/',
      'https://second.example.com/',
      'invalid relay value'
    ]);

    expect((client as any).relays).toEqual([
      'wss://relay.example.com/',
      'wss://second.example.com/'
    ]);
    expect(ensureRelay).toHaveBeenCalledTimes(2);
    expect(close).not.toHaveBeenCalled();
  });

  it('closes removed normalized relays', () => {
    const client = new NostrClient();
    const ensureRelay = vi.fn(async () => undefined);
    const close = vi.fn();
    (client as any).pool = { ensureRelay, close };
    (client as any).relays = ['wss://relay.one/', 'wss://relay.two/'];
    (client as any).relaySet = new Set(['wss://relay.one/', 'wss://relay.two/']);

    client.setRelays(['wss://relay.one/']);

    expect((client as any).relays).toEqual(['wss://relay.one/']);
    expect(close).toHaveBeenCalledWith(['wss://relay.two/']);
  });
});

describe('NostrClient.publishEvent', () => {
  const baseEvent: NostrEvent = {
    id: 'event-id',
    pubkey: 'f'.repeat(64),
    created_at: 1_700_000_000,
    kind: 1,
    tags: [],
    content: 'hello',
    sig: 'a'.repeat(128)
  };

  it('succeeds when at least one relay publish succeeds', async () => {
    const client = new NostrClient();
    (client as any).relays = ['wss://relay.one', 'wss://relay.two'];
    (client as any).pool = {
      publish: () => [
        Promise.reject(new Error('relay one down')),
        Promise.resolve('ok')
      ]
    };

    await expect(client.publishEvent(baseEvent)).resolves.toBeUndefined();
  });

  it('fails when all relay publishes fail', async () => {
    const client = new NostrClient();
    (client as any).relays = ['wss://relay.one', 'wss://relay.two'];
    (client as any).pool = {
      publish: () => [
        Promise.reject(new Error('relay one down')),
        Promise.reject(new Error('relay two timeout'))
      ]
    };

    await expect(client.publishEvent(baseEvent)).rejects.toThrow('Failed to publish to relays');
  });

  it('fails fast when no relays are configured', async () => {
    const client = new NostrClient();
    (client as any).relays = [];
    (client as any).pool = {
      publish: () => [Promise.resolve('ok')]
    };

    await expect(client.publishEvent(baseEvent)).rejects.toThrow('No relays configured for publish');
  });
});

describe('NostrClient.fetchReplies', () => {
  it('refreshes replies from relay even when cache has stale empty list', async () => {
    const client = new NostrClient();
    const event: NostrEvent = {
      id: 'reply-1',
      pubkey: 'f'.repeat(64),
      created_at: 1_700_000_100,
      kind: 1,
      tags: [['e', 'root-id', '', 'reply']],
      content: 'hello',
      sig: 'a'.repeat(128)
    };
    const getReplies = vi.fn(async () => [] as NostrEvent[]);
    const setReplies = vi.fn(async () => undefined);
    const setEvents = vi.fn(async () => undefined);
    (client as any).cache = { getReplies, setReplies, setEvents };
    (client as any).safeQuerySync = vi.fn(async () => [event]);

    const replies = await client.fetchReplies('root-id');

    expect(replies.map((item) => item.id)).toEqual(['reply-1']);
    expect((client as any).safeQuerySync).toHaveBeenCalledWith({ kinds: [1], '#e': ['root-id'], limit: 150 });
    expect(setReplies).toHaveBeenCalledOnce();
    expect(setEvents).toHaveBeenCalledOnce();
  });
});

describe('NostrClient.fetchProfiles', () => {
  function profileEvent(pubkey: string, createdAt: number, profile: Record<string, unknown>): NostrEvent {
    return {
      id: `${pubkey.slice(0, 8)}-${createdAt}`,
      pubkey,
      created_at: createdAt,
      kind: 0,
      tags: [],
      content: JSON.stringify(profile),
      sig: 'a'.repeat(128)
    };
  }

  it('keeps the newest profile when relay returns out-of-order metadata events', async () => {
    const client = new NostrClient();
    const alice = 'a'.repeat(64);
    const setProfile = vi.fn(async () => undefined);
    (client as any).cache = {
      getProfile: vi.fn(async () => undefined),
      setProfile
    };
    (client as any).safeQuerySync = vi.fn(async () => [
      profileEvent(alice, 100, { name: 'Alice Old', picture: 'https://cdn.example/old.png' }),
      profileEvent(alice, 200, { name: 'Alice New', picture: 'https://cdn.example/new.png' })
    ]);

    const profiles = await client.fetchProfiles([alice]);

    expect(profiles[alice]).toEqual({ name: 'Alice New', picture: 'https://cdn.example/new.png' });
    expect(setProfile).toHaveBeenCalledWith(alice, { name: 'Alice New', picture: 'https://cdn.example/new.png' });
  });

  it('falls back to per-author profile queries when batch query misses authors', async () => {
    const client = new NostrClient();
    const alice = 'a'.repeat(64);
    const bob = 'b'.repeat(64);
    const setProfile = vi.fn(async () => undefined);
    (client as any).cache = {
      getProfile: vi.fn(async () => undefined),
      setProfile
    };
    const safeQuerySync = vi
      .fn()
      .mockResolvedValueOnce([profileEvent(alice, 100, { name: 'Alice' })])
      .mockResolvedValueOnce([profileEvent(bob, 110, { name: 'Bob' })]);
    (client as any).safeQuerySync = safeQuerySync;

    const profiles = await client.fetchProfiles([alice, bob]);

    expect(profiles[alice]?.name).toBe('Alice');
    expect(profiles[bob]?.name).toBe('Bob');
    expect(safeQuerySync).toHaveBeenCalledTimes(2);
    expect(safeQuerySync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ kinds: [0], authors: [bob], limit: 5 })
    );
  });
});
