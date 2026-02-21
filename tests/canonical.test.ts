import { describe, expect, it } from 'vitest';
import { canonicaliseEvent } from '../src/p2p/canonical';
import type { NostrEvent } from '../src/nostr/types';

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function legacyStableClone(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => legacyStableClone(item));
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const next: Record<string, unknown> = {};
    for (const key of keys) {
      const nextValue = obj[key];
      if (nextValue === undefined) continue;
      next[key] = legacyStableClone(nextValue);
    }
    return next;
  }
  return value;
}

function baseEvent(): NostrEvent {
  return {
    id: 'id-1',
    pubkey: 'pubkey-1',
    created_at: 1,
    kind: 1,
    tags: [['x', '1']],
    content: 'hello',
    sig: 'sig-1'
  };
}

describe('canonicaliseEvent', () => {
  it('matches legacy stable clone and stringify behavior', () => {
    const event = {
      ...baseEvent(),
      extra: {
        z: 1,
        a: 2,
        nested: { b: 2, a: 1, skip: undefined }
      },
      array: [1, undefined, 3]
    } as NostrEvent & Record<string, unknown>;

    const actual = decode(canonicaliseEvent(event));
    const expected = JSON.stringify(legacyStableClone(event));

    expect(actual).toBe(expected);
  });

  it('produces identical output for equivalent objects with different insertion order', () => {
    const first = {
      ...baseEvent(),
      extra: { c: 3, a: 1, b: 2 }
    } as NostrEvent & Record<string, unknown>;

    const second = {
      sig: 'sig-1',
      content: 'hello',
      tags: [['x', '1']],
      kind: 1,
      created_at: 1,
      pubkey: 'pubkey-1',
      id: 'id-1',
      extra: { b: 2, c: 3, a: 1 }
    } as NostrEvent & Record<string, unknown>;

    expect(decode(canonicaliseEvent(first))).toBe(decode(canonicaliseEvent(second)));
  });
});
