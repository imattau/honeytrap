import type { NostrEvent } from '../nostr/types';

export function canonicaliseEvent(event: NostrEvent): Uint8Array {
  const stable = stableClone(event);
  const json = JSON.stringify(stable);
  return new TextEncoder().encode(json);
}

function stableClone(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableClone(item));
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const next: Record<string, unknown> = {};
    for (const key of keys) {
      const nextValue = obj[key];
      if (nextValue === undefined) continue;
      next[key] = stableClone(nextValue);
    }
    return next;
  }
  return value;
}
