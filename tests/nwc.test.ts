import { describe, it, expect, vi } from 'vitest';
import { NwcClient } from '../src/nostr/nwc';

describe('NwcClient.parse', () => {
  it('normalizes and deduplicates relay params', () => {
    const walletPubkey = 'f'.repeat(64);
    const parsed = NwcClient.parse(
      `nostr+walletconnect://${walletPubkey}?relay=wss://relay.one&relay=relay.one&relay=https://relay.two/&secret=${'1'.repeat(64)}`
    );
    expect(parsed.walletPubkey).toBe(walletPubkey);
    expect(parsed.relays).toEqual(['wss://relay.one/', 'wss://relay.two/']);
    expect(parsed.secret).toBe('1'.repeat(64));
  });

  it('drops invalid relay params and fails when none remain', () => {
    expect(() => NwcClient.parse(
      'nostr+walletconnect://' + 'f'.repeat(64) + '?relay=not a relay&secret=' + '1'.repeat(64)
    )).toThrow('Missing relay in NWC URI');
  });
});

describe('NwcClient.payInvoice publish reliability', () => {
  it('continues when at least one relay publish succeeds', async () => {
    const client = new NwcClient({
      walletPubkey: 'f'.repeat(64),
      relays: ['wss://relay.one', 'wss://relay.two'],
      secret: '1'.repeat(64)
    });
    const waitForResponse = vi.fn(async () => undefined);
    (client as any).negotiateEncryption = async () => 'nip04';
    (client as any).encryptPayload = () => 'ciphertext';
    (client as any).waitForResponse = waitForResponse;
    (client as any).pool = {
      publish: () => [
        Promise.reject(new Error('relay one down')),
        Promise.resolve('ok')
      ]
    };

    await expect(client.payInvoice('lnbc1invoice')).resolves.toBeUndefined();
    expect(waitForResponse).toHaveBeenCalledTimes(1);
  });

  it('fails fast when all relay publishes fail', async () => {
    const client = new NwcClient({
      walletPubkey: 'f'.repeat(64),
      relays: ['wss://relay.one', 'wss://relay.two'],
      secret: '1'.repeat(64)
    });
    const waitForResponse = vi.fn(async () => undefined);
    (client as any).negotiateEncryption = async () => 'nip04';
    (client as any).encryptPayload = () => 'ciphertext';
    (client as any).waitForResponse = waitForResponse;
    (client as any).pool = {
      publish: () => [
        Promise.reject(new Error('relay one down')),
        Promise.reject(new Error('relay two timeout'))
      ]
    };

    await expect(client.payInvoice('lnbc1invoice')).rejects.toThrow('Wallet request publish failed');
    expect(waitForResponse).not.toHaveBeenCalled();
  });
});

describe('NwcClient wallet response parsing', () => {
  it('rejects when wallet payload is invalid JSON', async () => {
    const client = new NwcClient({
      walletPubkey: 'f'.repeat(64),
      relays: ['wss://relay.one'],
      secret: '1'.repeat(64)
    });

    (client as any).decryptPayload = () => '{not valid';
    (client as any).pool = {
      subscribe: (_relays: string[], _filter: any, handlers: { onevent: (event: any) => void }) => {
        queueMicrotask(() => handlers.onevent({ content: 'cipher' }));
        return { close: () => undefined };
      }
    };

    await expect((client as any).waitForResponse('request-id', 100)).rejects.toThrow('Failed to parse wallet response');
  });

  it('rejects with wallet error message when response has string error', async () => {
    const client = new NwcClient({
      walletPubkey: 'f'.repeat(64),
      relays: ['wss://relay.one'],
      secret: '1'.repeat(64)
    });

    (client as any).decryptPayload = () => JSON.stringify({ error: 'insufficient funds' });
    (client as any).pool = {
      subscribe: (_relays: string[], _filter: any, handlers: { onevent: (event: any) => void }) => {
        queueMicrotask(() => handlers.onevent({ content: 'cipher' }));
        return { close: () => undefined };
      }
    };

    await expect((client as any).waitForResponse('request-id', 100)).rejects.toThrow('insufficient funds');
  });
});
