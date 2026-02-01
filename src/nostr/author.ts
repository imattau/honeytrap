import type { NostrEvent, ProfileMetadata } from './types';
import { NostrClient } from './client';
import { FeedOrchestrator } from './feed';
import { FeedService } from './service';
import type { TransportStore } from './transport';

export class AuthorService {
  private feedService: FeedService;
  private orchestrator: FeedOrchestrator;

  constructor(
    private client: NostrClient,
    transport?: TransportStore,
    isBlocked?: (pubkey: string) => boolean
  ) {
    this.feedService = new FeedService(client);
    this.orchestrator = new FeedOrchestrator(client, this.feedService, transport, isBlocked);
  }

  async loadProfile(pubkey: string): Promise<ProfileMetadata | undefined> {
    return this.client.fetchProfile(pubkey);
  }

  subscribeAuthorFeed(
    pubkey: string,
    getEvents: () => NostrEvent[],
    onUpdate: (events: NostrEvent[]) => void,
    onProfiles: (profiles: Record<string, ProfileMetadata>) => void
  ) {
    this.orchestrator.subscribe(
      { follows: [pubkey], followers: [], feedMode: 'follows' },
      getEvents,
      onUpdate,
      onProfiles
    );
  }

  async loadOlder(pubkey: string, getEvents: () => NostrEvent[], onUpdate: (events: NostrEvent[]) => void) {
    await this.orchestrator.loadOlder(
      { follows: [pubkey], followers: [], feedMode: 'follows' },
      getEvents,
      onUpdate
    );
  }

  stop() {
    this.orchestrator.stop();
  }
}
