import type { AppSettings } from '../storage/types';
import type { NostrEvent } from './types';
import type { SocialGraphApi } from './contracts';

export class SocialGraph implements SocialGraphApi {
  constructor(private settings: AppSettings) {}

  isFollowed(pubkey: string) {
    return this.settings.follows.includes(pubkey);
  }

  isBlocked(pubkey: string) {
    return this.settings.blocked.includes(pubkey);
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

  filterEvents(events: NostrEvent[]): NostrEvent[] {
    if (this.settings.blocked.length === 0) return events;
    return events.filter((event) => !this.isBlocked(event.pubkey));
  }
}
