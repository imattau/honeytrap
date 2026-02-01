import type { NostrEvent, NostrTag } from './types';
import { NostrClient } from './client';
import type { EventSigner } from './signer';
import type { PublishServiceApi } from './contracts';

export interface PublishInput {
  content: string;
  replyTo?: NostrEvent;
  media?: { url: string; magnet?: string; sha256?: string }[];
}

export class PublishService implements PublishServiceApi {
  constructor(private client: NostrClient, private signer: EventSigner) {}

  async publishNote(input: PublishInput): Promise<NostrEvent> {
    const base = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      content: input.content,
      tags: buildTags(input)
    };

    const signed = await this.signer.signEvent(base);
    await this.client.publishEvent(signed);
    return signed;
  }
}

function buildTags(input: PublishInput): NostrTag[] {
  const tags: NostrTag[] = [];
  if (input.replyTo) {
    const root = input.replyTo.tags.find((tag) => tag[0] === 'e' && tag[3] === 'root');
    if (root) tags.push(['e', root[1], '', 'root']);
    tags.push(['e', input.replyTo.id, '', 'reply']);
    tags.push(['p', input.replyTo.pubkey]);
  }
  (input.media ?? []).forEach((item) => {
    if (item.magnet) {
      tags.push(['bt', item.magnet, 'media', `url=${item.url}`]);
    }
    if (item.sha256) {
      tags.push(['x', `sha256:${item.sha256}`, `url=${item.url}`]);
    }
  });
  return tags;
}

// signing handled by EventSigner
