import { finalizeEvent, nip19 } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import { nip04 } from 'nostr-tools';
import { nip44 } from 'nostr-tools';
import type { NostrEvent } from './types';

export type NwcEncryption = 'nip04' | 'nip44_v2';

export interface NwcConnection {
  walletPubkey: string;
  relays: string[];
  secret: string;
}

export class NwcClient {
  private pool = new SimplePool();
  private encryption: NwcEncryption = 'nip04';

  constructor(private connection: NwcConnection) {}

  static parse(uri: string): NwcConnection {
    const url = new URL(uri.trim());
    const rawPubkey = url.hostname || url.pathname.replace('/', '');
    const walletPubkey = normalizePubkey(rawPubkey);
    if (!walletPubkey) throw new Error('Missing wallet pubkey in NWC URI');
    const relays = url.searchParams.getAll('relay').filter(Boolean);
    const secretRaw = url.searchParams.get('secret') ?? '';
    const secret = normalizeSecret(secretRaw);
    if (!secret) throw new Error('Missing secret in NWC URI');
    if (relays.length === 0) throw new Error('Missing relay in NWC URI');
    return { walletPubkey, relays, secret };
  }

  async negotiateEncryption(): Promise<NwcEncryption> {
    try {
      const events = await this.pool.querySync(this.connection.relays, {
        kinds: [13194],
        authors: [this.connection.walletPubkey],
        limit: 1
      });
      const info = events[0] as NostrEvent | undefined;
      if (info?.tags?.some((tag) => tag[0] === 'encryption' && tag[1] === 'nip44_v2')) {
        this.encryption = 'nip44_v2';
        return this.encryption;
      }
    } catch {
      // ignore and fallback
    }
    this.encryption = 'nip04';
    return this.encryption;
  }

  async payInvoice(invoice: string, timeoutMs = 15000): Promise<void> {
    await this.negotiateEncryption();
    const payload = { method: 'pay_invoice', params: { invoice } };
    const encrypted = this.encryptPayload(JSON.stringify(payload));
    const unsigned = {
      kind: 23194,
      created_at: Math.floor(Date.now() / 1000),
      tags: this.encryption === 'nip44_v2'
        ? [['p', this.connection.walletPubkey], ['encryption', 'nip44_v2']]
        : [['p', this.connection.walletPubkey]],
      content: encrypted
    };
    const signed = finalizeEvent(unsigned, hexToBytes(this.connection.secret));
    await publishToRelays(this.pool, this.connection.relays, signed as NostrEvent);
    await this.waitForResponse(signed.id, timeoutMs);
  }

  private encryptPayload(payload: string): string {
    if (this.encryption === 'nip44_v2') {
      const key = nip44.v2.utils.getConversationKey(hexToBytes(this.connection.secret), this.connection.walletPubkey);
      return nip44.v2.encrypt(payload, key);
    }
    return nip04.encrypt(hexToBytes(this.connection.secret), this.connection.walletPubkey, payload);
  }

  private decryptPayload(payload: string): string {
    if (this.encryption === 'nip44_v2') {
      const key = nip44.v2.utils.getConversationKey(hexToBytes(this.connection.secret), this.connection.walletPubkey);
      return nip44.v2.decrypt(payload, key);
    }
    return nip04.decrypt(hexToBytes(this.connection.secret), this.connection.walletPubkey, payload);
  }

  private waitForResponse(requestId: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const sub = this.pool.subscribe(this.connection.relays, {
        kinds: [23195],
        authors: [this.connection.walletPubkey],
        '#e': [requestId],
        limit: 1
      }, {
        onevent: (event: NostrEvent) => {
          try {
            const decrypted = this.decryptPayload(event.content);
            const response = JSON.parse(decrypted);
            if (response.error) {
              reject(new Error(response.error.message ?? 'Wallet error'));
              return;
            }
            resolve();
          } catch (error) {
            reject(error instanceof Error ? error : new Error('Failed to parse wallet response'));
          } finally {
            sub.close('done');
            window.clearTimeout(timer);
          }
        },
        onclose: () => null
      });

      const timer = window.setTimeout(() => {
        sub.close('timeout');
        reject(new Error('Wallet response timed out'));
      }, timeoutMs);
    });
  }
}

async function publishToRelays(pool: SimplePool, relays: string[], event: NostrEvent): Promise<void> {
  if (relays.length === 0) {
    throw new Error('Missing relay in NWC URI');
  }
  const results = await Promise.allSettled(pool.publish(relays, event));
  const ok = results.some((result) => result.status === 'fulfilled');
  if (ok) return;
  const reasons = results
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => errorMessage(result.reason))
    .filter(Boolean);
  if (reasons.length > 0) {
    throw new Error(`Wallet request publish failed: ${reasons.join('; ')}`);
  }
  throw new Error('Wallet request publish failed');
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message) return reason.message;
  if (typeof reason === 'string') return reason;
  return '';
}

function normalizeSecret(secret: string): string {
  if (!secret) return '';
  if (secret.startsWith('nsec')) {
    const decoded = nip19.decode(secret);
    if (decoded.type === 'nsec') {
      return bytesToHex(decoded.data as Uint8Array);
    }
  }
  return secret;
}

function normalizePubkey(pubkey: string): string {
  if (!pubkey) return '';
  if (pubkey.startsWith('npub')) {
    const decoded = nip19.decode(pubkey);
    if (decoded.type === 'npub') return decoded.data as string;
  }
  return pubkey;
}
