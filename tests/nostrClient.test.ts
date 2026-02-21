import { describe, it, expect } from 'vitest';
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
