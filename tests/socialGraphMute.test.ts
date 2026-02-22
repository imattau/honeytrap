import { describe, expect, it } from 'vitest';
import { SocialGraph, createMutedMatcher, normalizeMutedHashtags, normalizeMutedWords } from '../src/nostr/social';
import { defaultSettings } from '../src/storage/defaults';
import type { NostrEvent } from '../src/nostr/types';

function makeEvent(input: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: 'evt-1',
    kind: 1,
    pubkey: 'author',
    created_at: 1_700_000_000,
    content: '',
    tags: [],
    sig: 'sig',
    ...input
  };
}

describe('muted filtering', () => {
  it('filters events by muted words and hashtags', () => {
    const graph = new SocialGraph({
      ...defaultSettings,
      mutedWords: ['spoiler'],
      mutedHashtags: ['nsfw']
    });

    const events = [
      makeEvent({ id: 'a', content: 'regular post' }),
      makeEvent({ id: 'b', content: 'Contains Spoiler alert' }),
      makeEvent({ id: 'c', tags: [['t', 'nsfw']], content: 'tagged' }),
      makeEvent({ id: 'd', content: 'inline #nsfw tag' })
    ];

    const filtered = graph.filterEvents(events);
    expect(filtered.map((event) => event.id)).toEqual(['a']);
  });

  it('normalizes mute inputs', () => {
    expect(normalizeMutedWords(['  Spoiler ', 'spoiler', ''])).toEqual(['spoiler']);
    expect(normalizeMutedHashtags(['#NSFW', 'nsfw', '  #Drama  '])).toEqual(['nsfw', 'drama']);
  });

  it('creates matcher from settings and matches case-insensitively', () => {
    const isMuted = createMutedMatcher({ mutedWords: ['politics'], mutedHashtags: ['News'] });
    expect(isMuted(makeEvent({ content: 'POLITICS again' }))).toBe(true);
    expect(isMuted(makeEvent({ content: 'check #news now' }))).toBe(true);
    expect(isMuted(makeEvent({ content: 'tech only' }))).toBe(false);
  });
});
