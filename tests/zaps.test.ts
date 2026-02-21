import { describe, it, expect, vi } from 'vitest';
import { requestZapInvoice } from '../src/nostr/zaps';
import type { NostrEvent } from '../src/nostr/types';

function makeEvent(): NostrEvent {
  return {
    id: 'e'.repeat(64),
    kind: 1,
    pubkey: 'f'.repeat(64),
    created_at: 1,
    content: 'hello',
    tags: [],
    sig: 'a'.repeat(128)
  };
}

describe('requestZapInvoice', () => {
  it('throws when LNURL callback is missing', async () => {
    const originalFetch = globalThis.fetch;
    const signer = {
      signEvent: vi.fn(async (event: any) => ({ ...event, id: 'id', pubkey: 'f'.repeat(64), sig: 'a'.repeat(128) }))
    };
    globalThis.fetch = vi.fn(async () => ({
      json: async () => ({})
    })) as any;

    try {
      await expect(requestZapInvoice({
        targetEvent: makeEvent(),
        recipientPubkey: 'f'.repeat(64),
        relays: ['wss://relay.example'],
        amountSats: 21,
        signer: signer as any,
        lud16: 'alice@example.com'
      })).rejects.toThrow('LNURL callback missing');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws when invoice payload is missing pr', async () => {
    const originalFetch = globalThis.fetch;
    const signer = {
      signEvent: vi.fn(async (event: any) => ({ ...event, id: 'id', pubkey: 'f'.repeat(64), sig: 'a'.repeat(128) }))
    };
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ callback: 'https://wallet.example/callback' })
      } as any)
      .mockResolvedValueOnce({
        json: async () => ({})
      } as any);

    try {
      await expect(requestZapInvoice({
        targetEvent: makeEvent(),
        recipientPubkey: 'f'.repeat(64),
        relays: ['wss://relay.example'],
        amountSats: 21,
        signer: signer as any,
        lud16: 'alice@example.com'
      })).rejects.toThrow('Invoice missing');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
