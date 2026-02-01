import type { NostrEvent } from './types';

const nsfwRegex = /(^|\\s)#nsfw(\\s|$)/i;

export function isSensitiveEvent(event: NostrEvent): boolean {
  if (event.tags.some((tag) => tag[0] === 'content-warning' || tag[0] === 'cw')) return true;
  if (event.tags.some((tag) => tag[0] === 't' && tag[1]?.toLowerCase() === 'nsfw')) return true;
  return nsfwRegex.test(event.content);
}
