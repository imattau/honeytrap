import { describe, it, expect, vi } from 'vitest';
import { NwcClient } from '../src/nostr/nwc';

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
