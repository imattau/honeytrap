import { nip19, nip21 } from 'nostr-tools';

export type NostrPointer =
  | { type: 'npub'; pubkey: string }
  | { type: 'nprofile'; pubkey: string }
  | { type: 'note'; id: string }
  | { type: 'nevent'; id: string }
  | { type: 'naddr'; id: string };

export type NostrContentPart =
  | { type: 'text'; value: string }
  | { type: 'nostr'; value: string };

export function splitNostrContent(content: string): NostrContentPart[] {
  const regex = new RegExp(nip21.NOSTR_URI_REGEX.source, 'g');
  const parts: NostrContentPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const value = match[0];
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'nostr', value });
    lastIndex = match.index + value.length;
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex) });
  }
  return parts;
}

export function decodeNostrUri(value: string): NostrPointer | null {
  try {
    const decoded = nip21.parse(value).decoded;
    if (decoded.type === 'npub') return { type: 'npub', pubkey: decoded.data as string };
    if (decoded.type === 'note') return { type: 'note', id: decoded.data as string };
    if (decoded.type === 'nprofile') return { type: 'nprofile', pubkey: (decoded.data as { pubkey: string }).pubkey };
    if (decoded.type === 'nevent') return { type: 'nevent', id: (decoded.data as { id: string }).id };
    if (decoded.type === 'naddr') return { type: 'naddr', id: (decoded.data as { identifier: string }).identifier };
    return null;
  } catch {
    return null;
  }
}

export function encodeNeventUri(input: { id: string; author?: string; relays?: string[] }): string {
  const nevent = nip19.neventEncode({
    id: input.id,
    author: input.author,
    relays: input.relays
  });
  return `nostr:${nevent}`;
}

export function encodeNpubUri(pubkey: string): string {
  return `nostr:${nip19.npubEncode(pubkey)}`;
}
