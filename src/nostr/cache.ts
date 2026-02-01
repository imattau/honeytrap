import type { NostrEvent, ProfileMetadata } from './types';
import { CacheStore } from '../storage/cache';

const TTL_PROFILE = 6 * 60 * 60 * 1000;
const TTL_EVENT = 60 * 60 * 1000;
const TTL_REPLIES = 5 * 60 * 1000;
const TTL_FOLLOWERS = 10 * 60 * 1000;
const TTL_FOLLOWING = 10 * 60 * 1000;
const TTL_RELAYLIST = 10 * 60 * 1000;
const TTL_RECENT = 5 * 60 * 1000;

import type { NostrCacheApi } from './contracts';

export class NostrCache implements NostrCacheApi {
  private profiles = new CacheStore<ProfileMetadata>({ maxEntries: 800, evictionPolicy: 'lru', persistAccessMs: 20_000 });
  private events = new CacheStore<NostrEvent>({ maxEntries: 2000, evictionPolicy: 'lru', persistAccessMs: 20_000 });
  private replies = new CacheStore<NostrEvent[]>({ maxEntries: 400, evictionPolicy: 'lru', persistAccessMs: 20_000 });
  private followers = new CacheStore<string[]>({ maxEntries: 200, evictionPolicy: 'fifo' });
  private following = new CacheStore<string[]>({ maxEntries: 200, evictionPolicy: 'fifo' });
  private relayList = new CacheStore<string[]>({ maxEntries: 200, evictionPolicy: 'fifo' });
  private mediaRelayList = new CacheStore<string[]>({ maxEntries: 200, evictionPolicy: 'fifo' });
  private recentEvents = new CacheStore<NostrEvent[]>({ maxEntries: 20, evictionPolicy: 'lru' });

  async getProfile(pubkey: string) {
    return this.profiles.get(`profile:${pubkey}`);
  }

  async setProfile(pubkey: string, profile: ProfileMetadata) {
    await this.profiles.set(`profile:${pubkey}`, profile, TTL_PROFILE);
  }

  async getEvent(id: string) {
    return this.events.get(`event:${id}`);
  }

  async setEvent(event: NostrEvent) {
    await this.events.set(`event:${event.id}`, event, TTL_EVENT);
  }

  async getReplies(eventId: string) {
    return this.replies.get(`replies:${eventId}`);
  }

  async setReplies(eventId: string, events: NostrEvent[]) {
    await this.replies.set(`replies:${eventId}`, events, TTL_REPLIES);
  }

  async getFollowers(pubkey: string) {
    return this.followers.get(`followers:${pubkey}`);
  }

  async setFollowers(pubkey: string, list: string[]) {
    await this.followers.set(`followers:${pubkey}`, list, TTL_FOLLOWERS);
  }

  async getFollowing(pubkey: string) {
    return this.following.get(`following:${pubkey}`);
  }

  async setFollowing(pubkey: string, list: string[]) {
    await this.following.set(`following:${pubkey}`, list, TTL_FOLLOWING);
  }

  async getRelayList(pubkey: string) {
    return this.relayList.get(`relaylist:${pubkey}`);
  }

  async setRelayList(pubkey: string, list: string[]) {
    await this.relayList.set(`relaylist:${pubkey}`, list, TTL_RELAYLIST);
  }

  async getMediaRelayList(pubkey: string) {
    return this.mediaRelayList.get(`mediarelaylist:${pubkey}`);
  }

  async setMediaRelayList(pubkey: string, list: string[]) {
    await this.mediaRelayList.set(`mediarelaylist:${pubkey}`, list, TTL_RELAYLIST);
  }

  async getRecentEvents() {
    return this.recentEvents.get('recent:feed');
  }

  async setRecentEvents(events: NostrEvent[]) {
    await this.recentEvents.set('recent:feed', events, TTL_RECENT);
  }

  async purgeExpired() {
    await Promise.all([
      this.profiles.purgeExpired(),
      this.events.purgeExpired(),
      this.replies.purgeExpired(),
      this.followers.purgeExpired(),
      this.following.purgeExpired(),
      this.relayList.purgeExpired(),
      this.mediaRelayList.purgeExpired(),
      this.recentEvents.purgeExpired()
    ]);
  }
}
