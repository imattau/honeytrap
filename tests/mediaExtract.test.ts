import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '../src/nostr/types';
import { extractMedia } from '../src/nostr/media';

function baseEvent(): NostrEvent {
  return {
    id: '1',
    pubkey: 'pub',
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [],
    content: '',
    sig: 'sig'
  };
}

describe('extractMedia', () => {
  it('includes media urls from bt/x tags when content is empty', () => {
    const event = baseEvent();
    event.tags = [
      ['bt', 'magnet:?xt=urn:btih:abc', 'media', 'url=https://cdn.example.com/cat.jpg'],
      ['x', 'sha256:deadbeef', 'url=https://cdn.example.com/cat.jpg']
    ];
    const media = extractMedia(event);
    expect(media).toHaveLength(1);
    expect(media[0].url).toBe('https://cdn.example.com/cat.jpg');
    expect(media[0].magnet).toBe('magnet:?xt=urn:btih:abc');
    expect(media[0].sha256).toBe('deadbeef');
  });

  it('discovers p2p urls from tags without content urls', () => {
    const event = baseEvent();
    event.tags = [
      ['bt', 'magnet:?xt=urn:btih:xyz', 'media', 'url=p2p://sha256:abc123'],
      ['x', 'sha256:abc123', 'url=p2p://sha256:abc123']
    ];
    const media = extractMedia(event);
    expect(media).toHaveLength(1);
    expect(media[0].url).toBe('p2p://sha256:abc123');
    expect(media[0].magnet).toBe('magnet:?xt=urn:btih:xyz');
    expect(media[0].sha256).toBe('abc123');
  });

  it('extracts clean media urls from content with trailing punctuation', () => {
    const event = baseEvent();
    event.content = 'Look: https://cdn.example.com/cat.jpg).';
    const media = extractMedia(event);
    expect(media).toHaveLength(1);
    expect(media[0].url).toBe('https://cdn.example.com/cat.jpg');
  });
});
