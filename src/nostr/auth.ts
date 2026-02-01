import { generateSecretKey } from 'nostr-tools';
import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46';
import { SimplePool } from 'nostr-tools/pool';
import { getPublicKey, nip19 } from 'nostr-tools';
import { bytesToHex } from 'nostr-tools/utils';
import type { KeyRecord } from '../storage/types';

export interface Nip46Session {
  signer: BunkerSigner;
  pubkey: string;
}

export async function connectNip46(input: string, onAuthUrl?: (url: string) => void): Promise<Nip46Session> {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Missing bunker/nostrconnect URI');
  const secretKey = generateSecretKey();
  const pool = new SimplePool({ enablePing: true, enableReconnect: true });
  const params = {
    pool,
    onauth: (url: string) => {
      onAuthUrl?.(url);
    }
  };

  let signer: BunkerSigner | null = null;
  if (trimmed.startsWith('nostrconnect://')) {
    const uri = new URL(trimmed);
    const relays = uri.searchParams.getAll('relay');
    if (relays.length === 0) throw new Error('nostrconnect URI missing relay parameter');
    signer = await BunkerSigner.fromURI(secretKey, trimmed, params, 30_000);
  } else {
    const pointer = await parseBunkerInput(trimmed);
    if (!pointer) throw new Error('Invalid bunker address');
    if (!pointer.relays || pointer.relays.length === 0) {
      throw new Error('Bunker address missing relay (add ?relay=wss://...)');
    }
    signer = BunkerSigner.fromBunker(secretKey, pointer, params);
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
