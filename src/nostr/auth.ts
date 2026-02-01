import { generateSecretKey } from 'nostr-tools';
import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46';
import { getPublicKey, nip19 } from 'nostr-tools';
import { bytesToHex } from 'nostr-tools/utils';
import type { KeyRecord } from '../storage/types';

export interface Nip46Session {
  signer: BunkerSigner;
  pubkey: string;
}

export async function connectNip46(input: string): Promise<Nip46Session> {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Missing bunker/nostrconnect URI');
  const secretKey = generateSecretKey();

  let signer: BunkerSigner | null = null;
  if (trimmed.startsWith('nostrconnect://')) {
    signer = await BunkerSigner.fromURI(secretKey, trimmed);
  } else {
    const pointer = await parseBunkerInput(trimmed);
    if (!pointer) throw new Error('Invalid bunker address');
    signer = BunkerSigner.fromBunker(secretKey, pointer, {});
  }
  const pubkey = await signer.getPublicKey();
  return { signer, pubkey };
}

export async function getNip07Pubkey(): Promise<string> {
  const nostrProvider = (window as any).nostr;
  if (!nostrProvider?.getPublicKey) throw new Error('NIP-07 not available');
  return nostrProvider.getPublicKey();
}

export function disconnectNip46(session?: Nip46Session) {
  session?.signer.close().catch?.(() => null);
}

export function decodeKey(input: string): KeyRecord {
  const decoded = nip19.decode(input.trim());
  if (decoded.type === 'npub') return { npub: decoded.data as string };
  if (decoded.type === 'nsec') {
    const secret = decoded.data as Uint8Array;
    return { npub: getPublicKey(secret), nsec: bytesToHex(secret) };
  }
  throw new Error('Unsupported key');
}
