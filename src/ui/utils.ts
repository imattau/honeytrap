/**
 * Common UI utility functions for the Honeytrap application.
 */

/**
 * Copies a string to the system clipboard with a fallback for older browsers.
 */
export async function copyToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const area = document.createElement('textarea');
  area.value = value;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(area);
  }
}

/**
 * Checks if a URL points to a supported video format.
 */
export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);
}

/**
 * Clamps a number between a minimum and maximum value.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Formats a timestamp into a localized date and time string.
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

/**
 * Shortens a Nostr pubkey or event ID for display.
 */
export function shortenId(id: string, chars = 12): string {
  if (!id) return '';
  return `${id.slice(0, chars)}…`;
}

/**
 * Dedupes a list of Nostr events by ID and sorts them by created_at (descending).
 */
export function dedupeEvents<T extends { id: string; created_at: number }>(events: T[]): T[] {
  const map = new Map<string, T>();
  events.forEach((event) => {
    if (!map.has(event.id)) map.set(event.id, event);
  });
  return Array.from(map.values()).sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id));
}
