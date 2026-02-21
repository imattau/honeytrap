import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '../src/nostr/types';
import { extractLinks } from '../src/nostr/links';

function baseEvent(content: string): NostrEvent {
  return {
    id: '1',
    pubkey: 'pub',
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [],
    content,
    sig: 'sig'
  };
}

describe('extractLinks', () => {
  it('extracts HTTP links and excludes media URLs', () => {
    const event = baseEvent('Read https://example.com/page and view https://cdn.example.com/cat.jpg');
    const links = extractLinks(event);
    expect(links).toEqual([{ url: 'https://example.com/page', type: 'link' }]);
  });

  it('handles trailing punctuation and deduplicates urls', () => {
    const event = baseEvent('See (https://example.com/path). Again: https://example.com/path,');
    const links = extractLinks(event);
    expect(links).toEqual([{ url: 'https://example.com/path', type: 'link' }]);
  });
});
