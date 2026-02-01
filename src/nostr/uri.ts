import { nip19 } from 'nostr-tools';

export type NostrPointer =
  | { type: 'npub'; pubkey: string }
  | { type: 'nprofile'; pubkey: string }
  | { type: 'note'; id: string }
  | { type: 'nevent'; id: string };

export function decodeNostrUri(value: string): NostrPointer | null {
  try {
    const encoded = value.replace('nostr:', '');
    const decoded = nip19.decode(encoded);
    if (decoded.type === 'npub') return { type: 'npub', pubkey: decoded.data as string };
    if (decoded.type === 'note') return { type: 'note', id: decoded.data as string };
    if (decoded.type === 'nprofile') return { type: 'nprofile', pubkey: (decoded.data as { pubkey: string }).pubkey };
    if (decoded.type === 'nevent') return { type: 'nevent', id: (decoded.data as { id: string }).id };
    return null;
  } catch {
    return null;
  }
}
