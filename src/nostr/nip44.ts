import { getPublicKey, nip44 } from 'nostr-tools';
import { hexToBytes } from 'nostr-tools/utils';

export type Nip44Mode = 'self' | 'nip07' | 'nip46';

export class Nip44Cipher {
  constructor(private getKeys: () => { nsec?: string } | undefined) {}

  canEncrypt(): boolean {
    const keys = this.getKeys();
    if (keys?.nsec) return true;
    const nostrProvider = (window as any).nostr;
    return Boolean(nostrProvider?.nip44?.encrypt && nostrProvider?.getPublicKey);
  }

  async encryptSelf(payload: string): Promise<{ mode: Nip44Mode; content: string } | undefined> {
    const keys = this.getKeys();
    if (keys?.nsec) {
      const key = nip44.v2.utils.getConversationKey(hexToBytes(keys.nsec), selfPubkeyFromSecret(keys.nsec));
      return { mode: 'self', content: nip44.v2.encrypt(payload, key) };
    }
    const nostrProvider = (window as any).nostr;
    if (nostrProvider?.nip44?.encrypt && nostrProvider?.getPublicKey) {
      const pubkey = await nostrProvider.getPublicKey();
      const content = await nostrProvider.nip44.encrypt(pubkey, payload);
      return { mode: 'nip07', content };
    }
    return undefined;
  }

  async decryptSelf(content: string): Promise<string | undefined> {
    const keys = this.getKeys();
    if (keys?.nsec) {
      const key = nip44.v2.utils.getConversationKey(hexToBytes(keys.nsec), selfPubkeyFromSecret(keys.nsec));
      return nip44.v2.decrypt(content, key);
    }
    const nostrProvider = (window as any).nostr;
    if (nostrProvider?.nip44?.decrypt && nostrProvider?.getPublicKey) {
      const pubkey = await nostrProvider.getPublicKey();
      return await nostrProvider.nip44.decrypt(pubkey, content);
    }
    return undefined;
  }
}

function selfPubkeyFromSecret(nsec: string): string {
  // nip44 v2 requires conversation key derived from self-secret + self-pubkey
  return getPublicKey(hexToBytes(nsec));
}
