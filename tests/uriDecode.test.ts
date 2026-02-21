import { describe, it, expect } from 'vitest';
import { nip19 } from 'nostr-tools';
import { decodeNostrUri, splitNostrContent } from '../src/nostr/uri';

describe('decodeNostrUri', () => {
  it('decodes a nostr npub URI', () => {
    const pubkey = 'f'.repeat(64);
    const uri = `nostr:${nip19.npubEncode(pubkey)}`;
    expect(decodeNostrUri(uri)).toEqual({ type: 'npub', pubkey });
  });

  it('returns null for non-nostr uri values', () => {
    expect(decodeNostrUri('https://example.com')).toBeNull();
    expect(decodeNostrUri(nip19.npubEncode('f'.repeat(64)))).toBeNull();
  });
});

describe('splitNostrContent', () => {
  it('splits around valid NIP-21 nostr URIs', () => {
    const npub = nip19.npubEncode('f'.repeat(64));
    const input = `hello nostr:${npub} world`;
    expect(splitNostrContent(input)).toEqual([
      { type: 'text', value: 'hello ' },
      { type: 'nostr', value: `nostr:${npub}` },
      { type: 'text', value: ' world' }
    ]);
  });

  it('keeps punctuation outside the nostr URI token', () => {
    const npub = nip19.npubEncode('f'.repeat(64));
    const input = `(nostr:${npub}),`;
    expect(splitNostrContent(input)).toEqual([
      { type: 'text', value: '(' },
      { type: 'nostr', value: `nostr:${npub}` },
      { type: 'text', value: '),' }
    ]);
  });

  it('returns plain text when no valid nostr URI is present', () => {
    expect(splitNostrContent('nostr:invalid-token')).toEqual([
      { type: 'text', value: 'nostr:invalid-token' }
    ]);
  });
});
