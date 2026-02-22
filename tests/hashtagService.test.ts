import { describe, expect, it } from 'vitest';
import type { NostrEvent } from '../src/nostr/types';
import { matchesHashtagEvent, mergeHashtagEvents } from '../src/nostr/hashtag';

function makeEvent(id: string, patch: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id,
    pubkey: patch.pubkey ?? 'alice',
    created_at: patch.created_at ?? 100,
    kind: patch.kind ?? 1,
    tags: patch.tags ?? [],
    content: patch.content ?? '',
    sig: patch.sig ?? 'sig'
  };
}

describe('hashtag helpers', () => {
  it('matches canonical hashtag tag', () => {
    const event = makeEvent('1', { tags: [['t', 'Nostr']] });
    expect(matchesHashtagEvent(event, 'nostr')).toBe(true);
  });

  it('matches inline hashtag and rejects partial words', () => {
    const inline = makeEvent('1', { content: 'Working on #HoneyTrap today' });
    const partial = makeEvent('2', { content: 'This is #honeytrapper content' });
    expect(matchesHashtagEvent(inline, 'honeytrap')).toBe(true);
    expect(matchesHashtagEvent(partial, 'honeytrap')).toBe(false);
  });

  it('merges fallback results while excluding blocked authors', () => {
    const existing = [makeEvent('existing', { created_at: 200, content: '#honeytrap hello' })];
    const incoming = [
      makeEvent('a', { pubkey: 'allowed', content: '#honeytrap fallback', created_at: 150 }),
      makeEvent('b', { pubkey: 'blocked', content: '#honeytrap blocked', created_at: 300 }),
      makeEvent('c', { pubkey: 'allowed', content: '#other', created_at: 250 })
    ];
    const merged = mergeHashtagEvents(existing, incoming, 'honeytrap', (pubkey) => pubkey === 'blocked');
    expect(merged.map((event) => event.id)).toEqual(['existing', 'a']);
  });

  it('keeps newest addressable event version', () => {
    const older = makeEvent('old', {
      kind: 30023,
      created_at: 100,
      tags: [['d', 'card-1'], ['t', 'nostr']]
    });
    const newer = makeEvent('new', {
      kind: 30023,
      created_at: 200,
      tags: [['d', 'card-1'], ['t', 'nostr']]
    });
    const merged = mergeHashtagEvents([older], [newer], 'nostr');
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('new');
  });
});
