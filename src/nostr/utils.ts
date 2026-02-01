import type { NostrEvent, NostrTag, LongFormMetadata } from './types';

export function getTagValue(tags: NostrTag[], key: string): string | undefined {
  const tag = tags.find((t) => t[0] === key);
  return tag?.[1];
}

export function getAllTagValues(tags: NostrTag[], key: string): string[] {
  return tags.filter((t) => t[0] === key).map((t) => t[1]).filter(Boolean);
}

export function parseLongFormTags(tags: NostrTag[]): LongFormMetadata {
  const metadata: LongFormMetadata = {};
  for (const tag of tags) {
    if (tag[0] === 'title') metadata.title = tag[1];
    if (tag[0] === 'summary') metadata.summary = tag[1];
    if (tag[0] === 'image') metadata.image = tag[1];
    if (tag[0] === 'published_at') metadata.published_at = tag[1];
  }
  return metadata;
}

export function getReplyIds(event: NostrEvent): string[] {
  return event.tags.filter((t) => t[0] === 'e').map((t) => t[1]);
}
