import { normalizeURL } from 'nostr-tools/utils';

export function normalizeRelayUrl(url: string): string | undefined {
  const value = url.trim();
  if (!value) return undefined;
  try {
    return normalizeURL(value);
  } catch {
    return undefined;
  }
}
