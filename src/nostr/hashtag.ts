import type { NostrEvent, ProfileMetadata } from './types';
import { NostrClient } from './client';
import { FeedOrchestrator } from './feed';
import { FeedService } from './service';
import type { TransportStore } from './transport';
import type { EventVerifier } from './eventVerifier';

export class HashtagService {
  private feedService: FeedService;
  private orchestrator: FeedOrchestrator;

  constructor(
    private client: NostrClient,
    transport?: TransportStore,
    isBlocked?: (pubkey: string) => boolean,
    verifier?: EventVerifier
  ) {
    this.feedService = new FeedService(client);
    this.orchestrator = new FeedOrchestrator(client, this.feedService, transport, isBlocked, undefined, undefined, verifier);
  }

  subscribeHashtagFeed(
    tag: string,
    getEvents: () => NostrEvent[],
    onUpdate: (events: NostrEvent[]) => void,
    onProfiles: (profiles: Record<string, ProfileMetadata>) => void
  ) {
    const normalized = normalizeTag(tag);
    this.orchestrator.subscribe(
      { follows: [], followers: [], feedMode: 'all', tags: [normalized] },
      getEvents,
      onUpdate,
      onProfiles
    );
  }

  async loadOlder(tag: string, getEvents: () => NostrEvent[], onUpdate: (events: NostrEvent[]) => void) {
    const normalized = normalizeTag(tag);
    await this.orchestrator.loadOlder(
      { follows: [], followers: [], feedMode: 'all', tags: [normalized] },
      getEvents,
      onUpdate
    );
  }

  stop() {
    this.orchestrator.stop();
  }
}

function normalizeTag(tag: string) {
  return tag.trim().replace(/^#/, '').toLowerCase();
}
