import { finalizeEvent } from 'nostr-tools';
import { hexToBytes } from 'nostr-tools/utils';
import type { NostrEvent, NostrTag } from './types';
import type { KeyRecord } from '../storage/types';
import type { Nip46Session } from './auth';
import type { EventSignerApi } from './contracts';

export interface UnsignedEventInput {
  kind: number;
  created_at: number;
  content: string;
  tags: NostrTag[];
}

export class EventSigner implements EventSignerApi {
  constructor(
    private getKeys: () => KeyRecord | undefined,
    private getNip46Session: () => Nip46Session | null
  ) {}

  async signEvent(event: UnsignedEventInput): Promise<NostrEvent> {
    const session = this.getNip46Session();
    if (session) {
      const signed = await session.signer.signEvent(event);
      return signed as NostrEvent;
    }
    const keys = this.getKeys();
    if (keys?.nsec) {
      const signed = finalizeEvent(event, hexToBytes(keys.nsec));
      return signed as NostrEvent;
    }
    const nostrProvider = (window as any).nostr;
    if (nostrProvider?.signEvent) {
      const signed = await nostrProvider.signEvent(event);
      return signed as NostrEvent;
    }
    throw new Error('No signing method available');
  }
}
