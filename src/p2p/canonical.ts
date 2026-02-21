import stringify from 'fast-json-stable-stringify';
import type { NostrEvent } from '../nostr/types';

export function canonicaliseEvent(event: NostrEvent): Uint8Array {
  const json = stringify(event as unknown as Record<string, unknown>);
  return new TextEncoder().encode(json);
}
