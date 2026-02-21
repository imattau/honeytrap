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

export interface InlineTextToken {
  type: 'text' | 'hashtag' | 'emoji';
  value: string;
  url?: string;
}

export function extractEmojiMap(tags: NostrTag[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const tag of tags) {
    if (tag[0] !== 'emoji') continue;
    const shortcode = tag[1]?.trim();
    const url = tag[2]?.trim();
    if (!shortcode || !url) continue;
    if (!map[shortcode]) map[shortcode] = url;
    const lower = shortcode.toLowerCase();
    if (!map[lower]) map[lower] = url;
  }
  return map;
}

export function stripInvisibleSeparators(value: string): string {
  return value.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
}

export function tokenizeLineWithEmojiAndHashtags(line: string, emojiMap: Record<string, string>): InlineTextToken[] {
  const normalized = stripInvisibleSeparators(line);
  const tokens: InlineTextToken[] = [];
  const regex = /(^|\s)#([a-zA-Z0-9_]+)|:([a-zA-Z0-9_+\-]+):/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushText = (value: string) => {
    if (!value) return;
    const prev = tokens[tokens.length - 1];
    if (prev?.type === 'text') {
      prev.value += value;
      return;
    }
    tokens.push({ type: 'text', value });
  };

  while ((match = regex.exec(normalized)) !== null) {
    const emojiShortcode = match[3];
    if (emojiShortcode) {
      const start = match.index;
      if (start > lastIndex) pushText(normalized.slice(lastIndex, start));
      const literal = normalized.slice(start, regex.lastIndex);
      const url = emojiMap[emojiShortcode] ?? emojiMap[emojiShortcode.toLowerCase()];
      if (url) tokens.push({ type: 'emoji', value: emojiShortcode, url });
      else pushText(literal);
      lastIndex = regex.lastIndex;
      continue;
    }

    const prefix = match[1] ?? '';
    const tag = match[2];
    if (!tag) continue;
    const start = match.index;
    const textEnd = start + prefix.length;
    if (textEnd > lastIndex) pushText(normalized.slice(lastIndex, textEnd));
    tokens.push({ type: 'hashtag', value: tag });
    lastIndex = start + prefix.length + 1 + tag.length;
  }

  if (lastIndex < normalized.length) {
    pushText(normalized.slice(lastIndex));
  }

  return tokens;
}
