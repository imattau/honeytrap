import type { AppSettings } from '../storage/types';
import type { NostrEvent } from './types';
import type { SocialGraphApi } from './contracts';

export class SocialGraph implements SocialGraphApi {
  private isMuted: (event: NostrEvent) => boolean;

  constructor(private settings: AppSettings) {
    this.isMuted = createMutedMatcher(settings);
  }

  isFollowed(pubkey: string) {
    return this.settings.follows.includes(pubkey);
  }

  isBlocked(pubkey: string) {
    return this.settings.blocked.includes(pubkey);
  }

  isNsfw(pubkey: string) {
    return this.settings.nsfwAuthors.includes(pubkey);
  }

  toggleFollow(pubkey: string): AppSettings {
    const follows = this.isFollowed(pubkey)
      ? this.settings.follows.filter((key) => key !== pubkey)
      : [...this.settings.follows, pubkey];
    return { ...this.settings, follows };
  }

  toggleBlock(pubkey: string): AppSettings {
    if (this.isBlocked(pubkey)) {
      return { ...this.settings, blocked: this.settings.blocked.filter((key) => key !== pubkey) };
    }
    const blocked = [...this.settings.blocked, pubkey];
    const follows = this.settings.follows.filter((key) => key !== pubkey);
    return { ...this.settings, blocked, follows };
  }

  toggleNsfw(pubkey: string): AppSettings {
    if (this.isNsfw(pubkey)) {
      return { ...this.settings, nsfwAuthors: this.settings.nsfwAuthors.filter((key) => key !== pubkey) };
    }
    return { ...this.settings, nsfwAuthors: [...this.settings.nsfwAuthors, pubkey] };
  }

  filterEvents(events: NostrEvent[]): NostrEvent[] {
    if (
      this.settings.blocked.length === 0 &&
      this.settings.mutedWords.length === 0 &&
      this.settings.mutedHashtags.length === 0
    ) {
      return events;
    }
    return events.filter((event) => !this.isBlocked(event.pubkey) && !this.isMuted(event));
  }
}

export function createMutedMatcher(settings: Pick<AppSettings, 'mutedWords' | 'mutedHashtags'>) {
  const mutedWords = normalizeMutedWords(settings.mutedWords);
  const mutedHashtags = normalizeMutedHashtags(settings.mutedHashtags);
  const mutedHashtagSet = new Set(mutedHashtags);
  return (event: NostrEvent) => {
    if (mutedWords.length > 0) {
      const content = event.content.toLowerCase();
      if (mutedWords.some((word) => content.includes(word))) return true;
    }
    if (mutedHashtagSet.size > 0) {
      const eventTags = event.tags
        .filter((tag) => tag[0] === 't' && tag[1])
        .map((tag) => tag[1].toLowerCase());
      if (eventTags.some((tag) => mutedHashtagSet.has(tag))) return true;
      const inlineTags = extractInlineHashtags(event.content);
      if (inlineTags.some((tag) => mutedHashtagSet.has(tag))) return true;
    }
    return false;
  };
}

export function normalizeMutedWords(words: string[]) {
  return Array.from(
    new Set(
      words
        .map((word) => word.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

export function normalizeMutedHashtags(hashtags: string[]) {
  return Array.from(
    new Set(
      hashtags
        .map((tag) => tag.trim().toLowerCase().replace(/^#/, ''))
        .filter(Boolean)
    )
  );
}

function extractInlineHashtags(content: string): string[] {
  const matches = content.toLowerCase().match(/(^|[^a-z0-9_])#([a-z0-9_]+)/g) ?? [];
  if (matches.length === 0) return [];
  const out = new Set<string>();
  matches.forEach((match) => {
    const tag = match.slice(match.lastIndexOf('#') + 1).trim();
    if (tag) out.add(tag);
  });
  return Array.from(out);
}
